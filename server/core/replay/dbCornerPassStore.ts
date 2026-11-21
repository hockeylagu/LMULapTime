import { Database as DatabaseType } from 'better-sqlite3';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';

/** The build a replay's corner passes come from (see replay_corner_pass_builds). */
export interface CornerPassBuild {
  versionKey: string;
  layoutKey: string;
  passCount: number;
}

/** Passes through official turns, or through the sequences of each class's map: the same rows in their own tables. */
export type PassKind = 'turns' | 'sequences';

const TABLES: Record<PassKind, { passes: string; builds: string }> = {
  turns: { passes: 'replay_corner_passes', builds: 'replay_corner_pass_builds' },
  sequences: { passes: 'replay_sequence_passes', builds: 'replay_sequence_pass_builds' },
};

export function getCornerPassBuild(db: DatabaseType, filename: string, kind: PassKind = 'turns'): CornerPassBuild | null {
  const row = db.prepare(`SELECT version_key, layout_key, pass_count FROM ${TABLES[kind].builds} WHERE filename = ?`)
    .get(filename) as { version_key: string; layout_key: string; pass_count: number } | undefined;
  return row ? { versionKey: row.version_key, layoutKey: row.layout_key, passCount: row.pass_count } : null;
}

const tenths = (value: number | null): number | null => value === null ? null : Math.round(value * 10);
const ms = (sec: number | null): number | null => sec === null ? null : Math.round(sec * 1000);

/** Replaces a replay's corner passes and records the build they come from, in one transaction. */
export function replaceCornerPasses(
  db: DatabaseType, filename: string, build: Omit<CornerPassBuild, 'passCount'>, passes: CornerPass[], kind: PassKind = 'turns'
): void {
  const { passes: table, builds } = TABLES[kind];
  const insert = db.prepare(`
    INSERT INTO ${table} (filename, driver_slot, lap_number, segment, entry_ms, min_speed_after_ms, duration_ms,
      entry_speed_dkmh, min_speed_dkmh, exit_speed_dkmh, min_speed_dm, brake_dm, turn_in_dm, throttle_dm,
      ahead_slot, ahead_gap_ms,
      min_speed_gear, peak_brake_pm, brake_ms, part_throttle_ms, abs_ms, coast_ms,
      arc_radius_dm, apex_lateral_cm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const hundredths = (value: number | null): number | null => value === null ? null : Math.round(value * 100);
  const perMille = (value: number | null): number | null => value === null ? null : Math.round(value * 1000);
  db.transaction(() => {
    db.prepare(`DELETE FROM ${table} WHERE filename = ?`).run(filename);
    for (const pass of passes) {
      const entryMs = Math.round(pass.entrySec * 1000);
      insert.run(filename, pass.slot, pass.lapNumber, pass.segment, entryMs,
        pass.minSpeedSec === null ? null : Math.round(pass.minSpeedSec * 1000) - entryMs, Math.round(pass.exitSec * 1000) - entryMs,
        tenths(pass.entrySpeedKmh), tenths(pass.minSpeedKmh), tenths(pass.exitSpeedKmh),
        tenths(pass.minSpeedM), tenths(pass.brakeM), tenths(pass.turnInM), tenths(pass.throttleM),
        pass.aheadSlot, ms(pass.aheadGapSec),
        pass.minSpeedGear, perMille(pass.peakBrake), ms(pass.brakeSec), ms(pass.partThrottleSec),
        ms(pass.absSec), ms(pass.coastSec),
        tenths(pass.arcRadiusM), hundredths(pass.apexLateralM));
    }
    db.prepare(`
      INSERT INTO ${builds} (filename, version_key, layout_key, pass_count, built_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET version_key = excluded.version_key, layout_key = excluded.layout_key,
        pass_count = excluded.pass_count, built_at = excluded.built_at
    `).run(filename, build.versionKey, build.layoutKey, passes.length, Date.now());
  })();
}

/** A stored pass row's columns (`SELECT p.*` of a pass table). */
export type CornerPassRow = Record<string, number | null>;

/** A stored pass row back in the builder's units. */
export function passFromRow(row: CornerPassRow): CornerPass {
  const fromTenths = (value: number | null): number | null => value === null ? null : value / 10;
  const sec = (value: number | null): number | null => value === null ? null : value / 1000;
  const fromPerMille = (value: number | null): number | null => value === null ? null : value / 1000;
  const fromHundredths = (value: number | null): number | null => value === null ? null : value / 100;
  const entryMs = row.entry_ms as number;
  return {
    slot: row.driver_slot as number, lapNumber: row.lap_number as number, segment: row.segment as number,
    entrySec: entryMs / 1000,
    minSpeedSec: row.min_speed_after_ms === null ? null : (entryMs + row.min_speed_after_ms) / 1000,
    exitSec: (entryMs + (row.duration_ms as number)) / 1000,
    entrySpeedKmh: fromTenths(row.entry_speed_dkmh), minSpeedKmh: fromTenths(row.min_speed_dkmh), exitSpeedKmh: fromTenths(row.exit_speed_dkmh),
    minSpeedM: fromTenths(row.min_speed_dm), brakeM: fromTenths(row.brake_dm), turnInM: fromTenths(row.turn_in_dm),
    throttleM: fromTenths(row.throttle_dm),
    minSpeedGear: row.min_speed_gear, peakBrake: fromPerMille(row.peak_brake_pm),
    brakeSec: sec(row.brake_ms) ?? 0, partThrottleSec: sec(row.part_throttle_ms), absSec: sec(row.abs_ms) ?? 0, coastSec: sec(row.coast_ms) ?? 0,
    arcRadiusM: fromTenths(row.arc_radius_dm ?? null),
    apexLateralM: fromHundredths(row.apex_lateral_cm ?? null),
    aheadSlot: row.ahead_slot, aheadGapSec: sec(row.ahead_gap_ms),
  };
}

/** A replay's stored corner passes, back in the builder's units. */
export function listCornerPasses(db: DatabaseType, filename: string, kind: PassKind = 'turns'): CornerPass[] {
  const rows = db.prepare(`SELECT * FROM ${TABLES[kind].passes} WHERE filename = ? ORDER BY driver_slot, lap_number, segment`)
    .all(filename) as CornerPassRow[];
  return rows.map(passFromRow);
}

/** The replays whose corner passes were built on a layout. */
export function listLayoutPassReplays(db: DatabaseType, layoutKey: string): string[] {
  return (db.prepare('SELECT filename FROM replay_corner_pass_builds WHERE layout_key = ? ORDER BY filename').all(layoutKey) as Array<{ filename: string }>)
    .map(row => row.filename);
}
