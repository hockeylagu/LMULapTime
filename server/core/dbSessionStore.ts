import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession, SessionMetadata } from '../../shared/types/index.js';
import { isReplayLinkWithdrawn } from './replay/dbReplayLinkStore.js';
import { persistSessionProjection } from './sessionSummaries/store.js';
import { SESSION_DICTIONARY_TABLES, SESSION_ROW_TABLES } from './sessionRows/schema.js';
import { readStoredLinkState, sameReplayLink } from './sessionRows/access.js';

import { upsertTargetedReplayLink, updateTargetedTelemetry } from './sessionRows/targeted.js';


/** Ingestion's persisted XML end timestamp; a different path must not reuse it. */
export function getSessionXmlMtime(db: DatabaseType, sessionId: string, filePath: string): number | undefined {
  const row = db.prepare('SELECT file_mtime_ms FROM sessions WHERE id=? AND file_path=?')
    .get(sessionId, filePath) as { file_mtime_ms: number } | undefined;
  return row && Number.isFinite(row.file_mtime_ms) && row.file_mtime_ms > 0 ? row.file_mtime_ms : undefined;
}

/**
 * A reparse reads the XML alone, while the replay link and the DuckDB attachment were decided
 * against other files. They carry over (a withdrawn link never does) and replay reconciliation
 * re-checks the link, since the reparsed row counts as changed.
 */
export function restoreStoredSessionLinks(db: DatabaseType, session: DetailedSession): void {
  const stored = readStoredLinkState(db, session.id);
  if (!stored) return;
  if (!session.matchingReplayFile && stored.link && !isReplayLinkWithdrawn(db, session.id, stored.link.name)) session.matchingReplayFile = stored.link;
  if (!session.duckdbFilename && stored.duckdbFilename) session.duckdbFilename = stored.duckdbFilename;
}

export function upsertSession(
  db: DatabaseType,
  session: DetailedSession,
  filePath: string,
  mtimeMs: number,
  fileSizeBytes: number
): void {
  // A (re)parse matches the replay again from the XML alone. A replay withdrawn from the session
  // stays withdrawn, so it is dropped here instead of being stored and withdrawn again.
  if (session.matchingReplayFile && isReplayLinkWithdrawn(db, session.id, session.matchingReplayFile.name)) {
    delete session.matchingReplayFile;
  }
  const now = Date.now();

  const write = db.transaction(() => {
    db.prepare(`
      INSERT INTO sessions (
        id, filename, file_path, file_mtime_ms, file_size_bytes, timestamp,
        track_venue, track_course, session_type, session_name,
        player_driver_name, player_car_class, player_car_type,
        player_best_lap_time, player_laps_count, drivers_count,
        updated_at
      ) VALUES (
        @id, @filename, @filePath, @mtimeMs, @fileSizeBytes, @timestamp,
        @trackVenue, @trackCourse, @sessionType, @sessionName,
        @playerDriverName, @playerCarClass, @playerCarType,
        @playerBestLapTime, @playerLapsCount, @driversCount,
        @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        file_path = excluded.file_path,
        file_mtime_ms = excluded.file_mtime_ms,
        file_size_bytes = excluded.file_size_bytes,
        timestamp = excluded.timestamp,
        track_venue = excluded.track_venue,
        track_course = excluded.track_course,
        session_type = excluded.session_type,
        session_name = excluded.session_name,
        player_driver_name = excluded.player_driver_name,
        player_car_class = excluded.player_car_class,
        player_car_type = excluded.player_car_type,
        player_best_lap_time = excluded.player_best_lap_time,
        player_laps_count = excluded.player_laps_count,
        drivers_count = excluded.drivers_count,
        updated_at = excluded.updated_at
    `).run({
      id: session.id,
      filename: session.filename,
      filePath,
      mtimeMs,
      fileSizeBytes,
      timestamp: session.timestamp,
      trackVenue: session.trackVenue,
      trackCourse: session.trackCourse,
      sessionType: session.sessionType,
      sessionName: session.sessionName,
      playerDriverName: session.playerDriver?.name || null,
      playerCarClass: session.playerDriver ? session.playerDriver.carClass : null,
      playerCarType: session.playerDriver?.carType || null,
      playerBestLapTime: session.playerDriver?.bestLapTime ?? null,
      playerLapsCount: session.playerDriver?.declaredLapsCount ?? 0,
      driversCount: session.driversCount,
      updatedAt: now,
    });
    persistSessionProjection(db, session);
  });
  write();
}

export function updateSessionMatchingReplay(
  db: DatabaseType,
  sessionId: string,
  matchingReplayFile: NonNullable<SessionMetadata['matchingReplayFile']>
): { updated: boolean } {
  try {
    const stored = readStoredLinkState(db, sessionId);
    if (!stored) return { updated: false };
    // Reconciliation re-asserts matches: skip identical rewrites.
    if (stored.link && sameReplayLink(stored.link, matchingReplayFile)) {
      return { updated: false };
    }
    const updatedAt = Date.now();
    upsertTargetedReplayLink(db, sessionId, matchingReplayFile, updatedAt);
    return { updated: true };
  } catch (err) {
    console.warn('[SessionDb] Failed to update session matching replay:', err);
    return { updated: false };
  }
}

/**
 * Stores the session's main DuckDB file (TelemetryLinks.forSession) on its row, its replay link
 * and its card, when ownership is decided. Reads then serve it without consulting the catalog.
 * Returns whether anything changed.
 */
export function updateSessionTelemetryFile(db: DatabaseType, sessionId: string, duckdbFilename: string | undefined): boolean {
  const state = db.prepare('SELECT duckdb_filename AS file FROM sessions WHERE id = ?').get(sessionId) as { file: string | null } | undefined;
  if (!state) return false;
  if ((state.file ?? undefined) === duckdbFilename) return false;
  updateTargetedTelemetry(db, sessionId, duckdbFilename);
  return true;
}


export function getSessionsCount(db: DatabaseType): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return row.count;
}

export function clearSessionCache(db: DatabaseType): void {
  db.transaction(() => {
    db.exec('DELETE FROM session_driver_condition_summaries; DELETE FROM session_summary_facts;');
    for (const table of [...SESSION_ROW_TABLES, ...SESSION_DICTIONARY_TABLES]) db.exec(`DELETE FROM ${table}`);
    db.exec("DELETE FROM sessions; DELETE FROM cache_metadata WHERE key NOT LIKE 'reference_%' AND key != 'session_data_revision';");
  })();
}
