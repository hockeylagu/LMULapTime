import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from './types.js';
import { REPLAY_MATCH_WINDOW_MS } from '../sessions/replayMatching.js';
import { loadSessions } from './sessionRows/access.js';

// Ingestion reconciles only what a scan could have changed: candidates come from indexed time
// windows and change stamps, never from walking every stored session (see serverContext).

/**
 * Sessions whose replay link may need deciding again since `sinceMs`: sessions written since
 * (new, reparsed or relinked rows), sessions linked to a replay stored since, and sessions inside
 * the matching window of such a replay (replayMatching.ts: XML end or session start near it).
 */
export function getReplayReconciliationCandidateIds(db: DatabaseType, sinceMs: number): string[] {
  const rows = db.prepare(`
    SELECT id FROM sessions WHERE updated_at >= @since
    UNION SELECT s.id FROM replay_metadata r JOIN sessions s ON s.recording_name = r.filename WHERE r.updated_at >= @since
    UNION SELECT s.id FROM replay_metadata r JOIN sessions s
      ON s.file_mtime BETWEEN r.file_mtime - @window AND r.file_mtime + @window
      WHERE r.updated_at >= @since
    UNION SELECT s.id FROM replay_metadata r JOIN sessions s
      ON s.timestamp BETWEEN coalesce(r.recording_start_ms, r.file_mtime) - @window AND coalesce(r.recording_start_ms, r.file_mtime) + @window
      WHERE r.updated_at >= @since`)
    .all({ since: sinceMs, window: REPLAY_MATCH_WINDOW_MS }) as Array<{ id: string }>;
  return rows.map(row => row.id);
}

export function getSessionsByIds(db: DatabaseType, ids: readonly string[]): DetailedSession[] {
  return loadSessions(db, ids);
}

/** Sessions that started inside [fromMs, toMs], oldest first. */
export function getSessionsStartingBetween(db: DatabaseType, fromMs: number, toMs: number): DetailedSession[] {
  const rows = db.prepare('SELECT id FROM sessions WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp, id')
    .all(fromMs, toMs) as Array<{ id: string }>;
  return loadSessions(db, rows.map(row => row.id));
}

/** Recording name -> the session linked to it, for the given recordings. */
export function getRecordingOwners(db: DatabaseType, names: readonly string[]): Map<string, string> {
  const select = db.prepare('SELECT id FROM sessions WHERE recording_name = ? ORDER BY id LIMIT 1');
  const owners = new Map<string, string>();
  for (const name of names) {
    const row = select.get(name) as { id: string } | undefined;
    if (row) owners.set(name, row.id);
  }
  return owners;
}

/** Sessions owning DuckDB files whose row does not show the attachment yet (rows stored before it was persisted). */
export function getTelemetryOwnersWithoutFile(db: DatabaseType): string[] {
  const rows = db.prepare(`SELECT DISTINCT t.matched_session_id AS id FROM telemetry_metadata t
    JOIN sessions s ON s.id = t.matched_session_id
    WHERE s.duckdb_filename IS NULL`).all() as Array<{ id: string }>;
  return rows.map(row => row.id);
}
