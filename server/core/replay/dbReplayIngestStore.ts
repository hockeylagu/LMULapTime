import { Database as DatabaseType } from 'better-sqlite3';
import { REPLAY_CACHE_VERSION } from '../dbSchema.js';
import { deleteReplayDriverLapFacts } from './dbReplayLapStore.js';
import { ReplayDecodeError } from '../../replay/decode/replayDecodeError.js';

// Per-driver decode outcomes (see replay_ingest_drivers in dbSchema.ts).

/**
 * `failed`: the decoder rejected the file (ReplayDecodeError). `interrupted`: the decode did not finish
 * for a reason outside the file (the worker exited with the server, ran out of memory, a storage error).
 * Either is tried again: one error is not proof that the file is bad (see MAX_DECODE_ATTEMPTS).
 */
export type ReplayDriverIngestStatus = 'stored' | 'failed' | 'interrupted';

/**
 * Failed attempts in a row on one file version before the driver is left alone (until the file or the
 * parser version changes, or a manual Refresh), so a replay that always fails is not decoded on every scan.
 */
export const MAX_DECODE_ATTEMPTS = 3;

export interface ReplayDriverIngest {
  fileMtime: number;
  fileSize: number;
  parserVersion: string;
  status: ReplayDriverIngestStatus;
  error: string | null;
  /** Consecutive attempts that ended with this status for this file and parser version. */
  attempts: number;
}

export function getReplayDriverIngest(db: DatabaseType, filename: string, driverSlot: number): ReplayDriverIngest | null {
  const row = db.prepare(
    'SELECT file_mtime, file_size, parser_version, status, error, attempts FROM replay_ingest_drivers WHERE filename = ? AND driver_slot = ?'
  ).get(filename, driverSlot) as { file_mtime: number; file_size: number; parser_version: string; status: ReplayDriverIngestStatus; error: string | null; attempts: number } | undefined;
  if (!row) return null;
  return { fileMtime: row.file_mtime, fileSize: row.file_size, parserVersion: row.parser_version, status: row.status, error: row.error, attempts: row.attempts };
}

/**
 * Records this build's outcome of decoding one driver of a replay file version. The same outcome for
 * the same file and parser version counts one more attempt; any other outcome starts again at one.
 */
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
    INSERT INTO replay_ingest_drivers (filename, driver_slot, file_mtime, file_size, parser_version, status, error, attempted_at, attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(filename, driver_slot) DO UPDATE SET
      attempts = CASE
        WHEN replay_ingest_drivers.file_mtime = excluded.file_mtime
          AND replay_ingest_drivers.file_size = excluded.file_size
          AND replay_ingest_drivers.parser_version = excluded.parser_version
          AND replay_ingest_drivers.status = excluded.status
        THEN replay_ingest_drivers.attempts + 1 ELSE 1 END,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      parser_version = excluded.parser_version,
      status = excluded.status,
      error = excluded.error,
      attempted_at = excluded.attempted_at
  `).run(filename, driverSlot, fileMtime, fileSize, REPLAY_CACHE_VERSION, status, error, Date.now());
}

/** How a decode that threw is recorded: only the decoder rejecting the file settles it. */
export function replayFailureStatus(error: unknown): Exclude<ReplayDriverIngestStatus, 'stored'> {
  return error instanceof ReplayDecodeError ? 'failed' : 'interrupted';
}

export function replayErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.trim() || 'Replay decode stopped without an error message';
}

/**
 * True when this build stored this driver of this file version, or its decode failed MAX_DECODE_ATTEMPTS
 * times in a row: it is not decoded again until the file or the parser version changes.
 */
export function isReplayDriverSettled(attempt: ReplayDriverIngest | null, fileMtime: number, fileSize: number): boolean {
  if (!attempt || attempt.fileMtime !== fileMtime || attempt.fileSize !== fileSize || attempt.parserVersion !== REPLAY_CACHE_VERSION) return false;
  return attempt.status === 'stored' || attempt.attempts >= MAX_DECODE_ATTEMPTS;
}

/** A settled attempt that did not store the driver: the error to show for it. */
export function settledReplayFailure(attempt: ReplayDriverIngest | null, fileMtime: number, fileSize: number): string | null {
  if (!attempt || attempt.status === 'stored' || !isReplayDriverSettled(attempt, fileMtime, fileSize)) return null;
  return attempt.error ?? 'Replay could not be decoded';
}

/** Removes a driver's lap rows, lap facts and default pointer, so a new decode replaces the whole set. */
export function deleteReplayDriverLaps(db: DatabaseType, filename: string, driverSlot: number): void {
  db.prepare('DELETE FROM replay_trajectories WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
  db.prepare('DELETE FROM replay_trajectory_defaults WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
  deleteReplayDriverLapFacts(db, filename, driverSlot);
}
