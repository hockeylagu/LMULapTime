import { Database as DatabaseType } from 'better-sqlite3';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';

/** The build a replay's corner passes come from (see replay_corner_pass_builds). */
export interface CornerPassBuild {
  versionKey: string;
  layoutKey: string;
  passCount: number;
}

export function getCornerPassBuild(db: DatabaseType, filename: string): CornerPassBuild | null {
  const row = db.prepare('SELECT version_key, layout_key, pass_count FROM replay_corner_pass_builds WHERE filename = ?')
    .get(filename) as { version_key: string; layout_key: string; pass_count: number } | undefined;
  return row ? { versionKey: row.version_key, layoutKey: row.layout_key, passCount: row.pass_count } : null;
}

const tenths = (value: number | null): number | null => value === null ? null : Math.round(value * 10);
const ms = (sec: number | null): number | null => sec === null ? null : Math.round(sec * 1000);

/** Replaces a replay's corner passes and records the build they come from, in one transaction. */
export function replaceCornerPasses(db: DatabaseType, filename: string, build: Omit<CornerPassBuild, 'passCount'>, passes: CornerPass[]): void {
  const insert = db.prepare(`
    INSERT INTO replay_corner_passes (filename, driver_slot, lap_number, segment, entry_ms, min_speed_after_ms, duration_ms,
      entry_speed_dkmh, min_speed_dkmh, exit_speed_dkmh, min_speed_dm, brake_dm, turn_in_dm, throttle_dm,
      ahead_slot, ahead_gap_ms, behind_slot, behind_gap_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    db.prepare('DELETE FROM replay_corner_passes WHERE filename = ?').run(filename);
    for (const pass of passes) {
      const entryMs = Math.round(pass.entrySec * 1000);
      insert.run(filename, pass.slot, pass.lapNumber, pass.segment, entryMs,
        pass.minSpeedSec === null ? null : Math.round(pass.minSpeedSec * 1000) - entryMs, Math.round(pass.exitSec * 1000) - entryMs,
        tenths(pass.entrySpeedKmh), tenths(pass.minSpeedKmh), tenths(pass.exitSpeedKmh),
        tenths(pass.minSpeedM), tenths(pass.brakeM), tenths(pass.turnInM), tenths(pass.throttleM),
        pass.aheadSlot, ms(pass.aheadGapSec), pass.behindSlot, ms(pass.behindGapSec));
    }
    db.prepare(`
      INSERT INTO replay_corner_pass_builds (filename, version_key, layout_key, pass_count, built_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET version_key = excluded.version_key, layout_key = excluded.layout_key,
        pass_count = excluded.pass_count, built_at = excluded.built_at
    `).run(filename, build.versionKey, build.layoutKey, passes.length, Date.now());
  })();
}

/** A replay's stored corner passes, back in the builder's units. */
export function listCornerPasses(db: DatabaseType, filename: string): CornerPass[] {
  const rows = db.prepare(`
    SELECT driver_slot, lap_number, segment, entry_ms, min_speed_after_ms, duration_ms, entry_speed_dkmh, min_speed_dkmh,
      exit_speed_dkmh, min_speed_dm, brake_dm, turn_in_dm, throttle_dm, ahead_slot, ahead_gap_ms, behind_slot, behind_gap_ms
    FROM replay_corner_passes WHERE filename = ? ORDER BY driver_slot, lap_number, segment
  `).all(filename) as Array<Record<string, number | null>>;
  const fromTenths = (value: number | null): number | null => value === null ? null : value / 10;
  const sec = (value: number | null): number | null => value === null ? null : value / 1000;
  return rows.map(row => {
    const entryMs = row.entry_ms as number;
    return {
      slot: row.driver_slot as number, lapNumber: row.lap_number as number, segment: row.segment as number,
      entrySec: entryMs / 1000,
      minSpeedSec: row.min_speed_after_ms === null ? null : (entryMs + row.min_speed_after_ms) / 1000,
      exitSec: (entryMs + (row.duration_ms as number)) / 1000,
      entrySpeedKmh: fromTenths(row.entry_speed_dkmh), minSpeedKmh: fromTenths(row.min_speed_dkmh), exitSpeedKmh: fromTenths(row.exit_speed_dkmh),
      minSpeedM: fromTenths(row.min_speed_dm), brakeM: fromTenths(row.brake_dm), turnInM: fromTenths(row.turn_in_dm),
      throttleM: fromTenths(row.throttle_dm),
      aheadSlot: row.ahead_slot, aheadGapSec: sec(row.ahead_gap_ms), behindSlot: row.behind_slot, behindGapSec: sec(row.behind_gap_ms),
    };
  });
}
