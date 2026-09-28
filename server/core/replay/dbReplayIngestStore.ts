import { Database as DatabaseType } from 'better-sqlite3';
import { REPLAY_CACHE_VERSION } from '../dbSchema.js';
import { deleteReplayDriverLapFacts } from './dbReplayLapStore.js';

// Per-driver decode outcomes (see replay_ingest_drivers in dbSchema.ts).

export type ReplayDriverIngestStatus = 'stored' | 'failed';

export interface ReplayDriverIngest {
  fileMtime: number;
  fileSize: number;
  parserVersion: string;
  status: ReplayDriverIngestStatus;
  error: string | null;
}

export function getReplayDriverIngest(db: DatabaseType, filename: string, driverSlot: number): ReplayDriverIngest | null {
  const row = db.prepare(
    'SELECT file_mtime, file_size, parser_version, status, error FROM replay_ingest_drivers WHERE filename = ? AND driver_slot = ?'
  ).get(filename, driverSlot) as { file_mtime: number; file_size: number; parser_version: string; status: ReplayDriverIngestStatus; error: string | null } | undefined;
  if (!row) return null;
  return { fileMtime: row.file_mtime, fileSize: row.file_size, parserVersion: row.parser_version, status: row.status, error: row.error };
}

/** Records this build's outcome of decoding one driver of a replay file version. */
export function recordReplayDriverIngest(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  fileMtime: number,
  fileSize: number,
  status: ReplayDriverIngestStatus,
  error: string | null = null
): void {
  db.prepare(`
    INSERT INTO replay_ingest_drivers (filename, driver_slot, file_mtime, file_size, parser_version, status, error, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(filename, driver_slot) DO UPDATE SET
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      parser_version = excluded.parser_version,
      status = excluded.status,
      error = excluded.error,
      attempted_at = excluded.attempted_at
  `).run(filename, driverSlot, fileMtime, fileSize, REPLAY_CACHE_VERSION, status, error, Date.now());
}

/** True when this build already stored, or failed to decode, this driver of this file version. */
export function isReplayDriverSettled(attempt: ReplayDriverIngest | null, fileMtime: number, fileSize: number): boolean {
  return Boolean(attempt &&
    attempt.fileMtime === fileMtime &&
    attempt.fileSize === fileSize &&
    attempt.parserVersion === REPLAY_CACHE_VERSION);
}

/** Removes a driver's lap rows, lap facts and default pointer, so a new decode replaces the whole set. */
export function deleteReplayDriverLaps(db: DatabaseType, filename: string, driverSlot: number): void {
  db.prepare('DELETE FROM replay_trajectories WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
  db.prepare('DELETE FROM replay_trajectory_defaults WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
  deleteReplayDriverLapFacts(db, filename, driverSlot);
}
