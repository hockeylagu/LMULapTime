import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from './types.js';
import type { TelemetrySessionCandidate } from '../telemetry/telemetryMatcher.js';
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

interface TelemetryCandidateRow {
  id: string;
  file_path: string;
  timestamp: number;
  track_venue: string;
  track_course: string;
  session_type: string;
  session_name: string;
  recording_name: string | null;
  driver_ordinal: number | null;
  driver_name: string | null;
}

/** Reads only session matching fields and the small driver-name roster, without laps or events. */
function readTelemetryCandidates(db: DatabaseType, whereSql: string, params: Array<string | number> = []): TelemetrySessionCandidate[] {
  const rows = db.prepare(`SELECT s.id, s.file_path, s.timestamp, s.track_venue, s.track_course,
      s.session_type, s.session_name, r.recording_name AS recording_name, d.driver_ordinal, n.name AS driver_name
    FROM sessions s
    LEFT JOIN session_recordings r ON r.session_id = s.id
    LEFT JOIN session_drivers d ON d.session_id = s.id
    LEFT JOIN drivers n ON n.driver_id = d.driver_id
    WHERE ${whereSql}
    ORDER BY s.timestamp, s.id, d.driver_ordinal`)
    .all(...params) as TelemetryCandidateRow[];
  const candidates = new Map<string, TelemetrySessionCandidate>();
  for (const row of rows) {
    let candidate = candidates.get(row.id);
    if (!candidate) {
      candidate = {
        id: row.id,
        filePath: row.file_path,
        timestamp: row.timestamp,
        trackVenue: row.track_venue,
        trackCourse: row.track_course,
        sessionType: row.session_type,
        sessionName: row.session_name,
        drivers: [],
      };
      if (row.recording_name) candidate.matchingReplayFile = { name: row.recording_name };
      candidates.set(row.id, candidate);
    }
    if (row.driver_ordinal !== null) candidate.drivers.push({ name: row.driver_name ?? '' });
  }
  return [...candidates.values()];
}

/** Telemetry ownership candidates in a timestamp window, with only matching metadata and names. */
export function getTelemetrySessionCandidatesStartingBetween(
  db: DatabaseType,
  fromMs: number,
  toMs: number
): TelemetrySessionCandidate[] {
  return readTelemetryCandidates(db, 's.timestamp BETWEEN ? AND ?', [fromMs, toMs]);
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
