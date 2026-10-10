import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession, SessionMetadata } from './types.js';
import { isReplayLinkWithdrawn } from './replay/dbReplayLinkStore.js';
import { persistSessionProjection } from './sessionSummaries/store.js';
import { NORMALIZED_SESSION_VERSION, SESSION_DICTIONARY_TABLES, SESSION_ROW_TABLES } from './sessionRows/schema.js';
import { loadSession, readStoredLinkState, sameReplayLink } from './sessionRows/access.js';

import { upsertTargetedReplayLink, updateTargetedTelemetry } from './sessionRows/targeted.js';
import { withSessionTelemetry } from './sessionRows/canonical.js';


/** Ingestion's persisted XML end timestamp; a different path must not reuse it. */
export function getSessionXmlMtime(db: DatabaseType, sessionId: string, filePath: string): number | undefined {
  const row = db.prepare('SELECT file_mtime FROM sessions WHERE id=? AND file_path=?')
    .get(sessionId, filePath) as { file_mtime: number } | undefined;
  return row && Number.isFinite(row.file_mtime) && row.file_mtime > 0 ? row.file_mtime : undefined;
}

export function getSessionById(db: DatabaseType, id: string): DetailedSession | null {
  const cleanId = id.endsWith('.xml') ? id.replace(/\.xml$/, '') : id;
  const withXml = `${cleanId}.xml`;

  const row = db.prepare(
    'SELECT id FROM sessions WHERE id = ? OR id = ? OR id = ? OR filename = ? OR filename = ? LIMIT 1'
  ).get(id, cleanId, withXml, withXml, id) as { id: string } | undefined;
  return row ? loadSession(db, row.id) : null;
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
  if (!session.duckdbFilename && stored.duckdbFilename) {
    session.duckdbFilename = stored.duckdbFilename;
    session.hasDuckDbTelemetry = true;
  }
}

export function upsertSession(
  db: DatabaseType,
  session: DetailedSession,
  filePath: string,
  mtime: number,
  size: number
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
        id, filename, file_path, file_mtime, file_size, timestamp,
        track_venue, track_course, session_type, session_name,
        player_driver_name, player_car_class, player_car_type,
        player_best_lap_time, player_laps_count, drivers_count,
        updated_at
      ) VALUES (
        @id, @filename, @filePath, @fileMtime, @fileSize, @timestamp,
        @trackVenue, @trackCourse, @sessionType, @sessionName,
        @playerDriverName, @playerCarClass, @playerCarType,
        @playerBestLapTime, @playerLapsCount, @driversCount,
        @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        file_path = excluded.file_path,
        file_mtime = excluded.file_mtime,
        file_size = excluded.file_size,
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
      fileMtime: mtime,
      fileSize: size,
      timestamp: session.timestamp,
      trackVenue: session.trackVenue,
      trackCourse: session.trackCourse,
      sessionType: session.sessionType,
      sessionName: session.sessionName,
      playerDriverName: session.playerDriver?.name || null,
      playerCarClass: session.playerDriver?.carClass || null,
      playerCarType: session.playerDriver?.carType || null,
      playerBestLapTime: session.playerDriver?.bestLapTime ?? null,
      playerLapsCount: session.playerDriver?.lapsCount ?? 0,
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
): { updated: boolean; session?: DetailedSession; metadata?: SessionMetadata } {
  try {
    const stored = readStoredLinkState(db, sessionId);
    if (!stored) return { updated: false };
    matchingReplayFile = withSessionTelemetry(matchingReplayFile, stored.duckdbFilename);
    // Reconciliation re-asserts matches: skip identical rewrites.
    if (stored.link && sameReplayLink(stored.link, matchingReplayFile)) {
      return { updated: false };
    }
    const updatedAt = Date.now();
    upsertTargetedReplayLink(db, sessionId, matchingReplayFile, updatedAt);
    const data = loadSession(db, sessionId);
    if (!data) return { updated: true };
    const { drivers: _drivers, ...metadata } = data;
    return { updated: true, session: data, metadata };
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
  const state = db.prepare('SELECT normalized_version AS version, has_duckdb_telemetry AS flag, duckdb_filename AS file FROM sessions WHERE id = ?')
    .get(sessionId) as { version: number; flag: number | null; file: string | null } | undefined;
  if (!state) return false;
  // Verified rows mirror the session's attachment onto the link, so the session columns decide.
  if (state.version === NORMALIZED_SESSION_VERSION && (state.file ?? undefined) === duckdbFilename && Boolean(state.flag) === Boolean(duckdbFilename)) return false;
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
