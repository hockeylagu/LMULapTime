import { Database as DatabaseType } from 'better-sqlite3';

/** A replay's stored lap row (replay_trajectories), still compressed: what the corner passes and race poses are built from. */
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

/** The stored blobs of the given laps of a replay; laps without a stored row are left out. */
export function getReplayLapBlobs(db: DatabaseType, filename: string, laps: ReadonlyArray<{ slot: number; lapNumber: number }>): ReplayLapRow[] {
  const statement = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?');
  return laps.flatMap((lap) => {
    const row = statement.get(filename, lap.slot, lap.lapNumber) as { trajectory_br: Buffer } | undefined;
    return row ? [{ slot: lap.slot, lapNumber: lap.lapNumber, blob: row.trajectory_br }] : [];
  });
}
