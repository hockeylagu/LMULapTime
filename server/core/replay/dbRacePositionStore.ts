import { Database as DatabaseType } from 'better-sqlite3';
import { compressJson, decompressJson } from '../dbSchema.js';

/**
 * The race positions index of a replay (server/traffic/racePositions.ts) is built from the
 * replay's stored laps, so it is only valid for the laps it was built from: `signature` records
 * them (how many rows, when last written) together with the index version and layout.
 */
export interface ReplayLapRow {
  slot: number;
  lapNumber: number;
  blob: Buffer;
}

/** Identifies the stored laps of a replay; null when none are stored. */
export function getReplayLapSignature(db: DatabaseType, filename: string): string | null {
  const row = db.prepare(
    'SELECT COUNT(*) AS lapCount, MAX(updated_at) AS lastUpdated FROM replay_trajectories WHERE filename = ? AND lap_key > 0'
  ).get(filename) as { lapCount: number; lastUpdated: number | null };
  return row.lapCount > 0 ? `${row.lapCount}:${row.lastUpdated}` : null;
}

/** Every stored lap of every driver of a replay, still compressed. */
export function listReplayLapRows(db: DatabaseType, filename: string): ReplayLapRow[] {
  const rows = db.prepare(
    'SELECT driver_slot, lap_key, trajectory_br FROM replay_trajectories WHERE filename = ? AND lap_key > 0 ORDER BY driver_slot, lap_key'
  ).all(filename) as Array<{ driver_slot: number; lap_key: number; trajectory_br: Buffer }>;
  return rows.map((row) => ({ slot: row.driver_slot, lapNumber: row.lap_key, blob: row.trajectory_br }));
}

export function getRacePositions<T>(db: DatabaseType, filename: string, signature: string): T | null {
  const row = db.prepare(
    'SELECT positions_br FROM replay_race_positions WHERE filename = ? AND signature = ?'
  ).get(filename, signature) as { positions_br: Buffer } | undefined;
  return row ? decompressJson<T>(row.positions_br) : null;
}

export function saveRacePositions(db: DatabaseType, filename: string, signature: string, positions: unknown): void {
  db.prepare(`
    INSERT INTO replay_race_positions (filename, signature, positions_br, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET
      signature = excluded.signature,
      positions_br = excluded.positions_br,
      updated_at = excluded.updated_at
  `).run(filename, signature, compressJson(positions), Date.now());
}
