import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';
import type { SessionSummaryProjection, SessionProjectionState, SessionCard } from '../../../shared/types/sessionSummaries.js';
import { buildSessionSummaryProjection } from '../../../shared/domain/sessionSummaries/index.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../../shared/types/sessionSummaries.js';
import { persistSessionAggregate } from './aggregateStore.js';
import { writeAndVerifySessionRows } from '../sessionRows/verify.js';
import { clearDerivedColumns } from '../sessionRows/writer.js';
import { NORMALIZED_SESSION_VERSION } from '../sessionRows/schema.js';
import { isSessionJsonRemoved } from '../sessionRows/conversion.js';
import { loadSession } from '../sessionRows/access.js';
import { readSessionCards } from './cards.js';
const insertCondition = `INSERT INTO session_driver_condition_summaries VALUES (
 @sessionId,@driverOrdinal,@conditionGroup,@cleanCount,@cleanTimeSum,@cleanTimeSquareSum,@bestLapOrdinal,@bestLapTime,
 @bestS1,@bestS2,@bestS3,@fastestThreeCount,@fastestThreeTimeSum)`;

/**
 * Replaces a session's summary rows and its card in one transaction. Callers never write
 * summary_json themselves, so a current projection always has a matching card.
 */
export function persistSessionProjection(db: DatabaseType, session: DetailedSession, sourceRevision?: number): SessionSummaryProjection {
  const row = db.prepare('SELECT source_revision FROM sessions WHERE id = ?').get(session.id) as { source_revision: number } | undefined;
  const revision = sourceRevision ?? ((row?.source_revision ?? 0) + 1);
  const projection = buildSessionSummaryProjection(session, revision);
  const run = db.transaction(() => {
    const current = db.prepare('SELECT source_revision, projection_revision FROM sessions WHERE id = ?').get(session.id) as { source_revision: number; projection_revision: number } | undefined;
    if (current && current.source_revision > revision) return false;
    db.prepare('DELETE FROM session_driver_condition_summaries WHERE session_id = ?').run(session.id);
    const conditionStmt = db.prepare(insertCondition);
    for (const value of projection.conditions) conditionStmt.run(value);
    persistSessionAggregate(db, session, projection);
    // The normalized rows carry the per-driver and per-lap derived columns, so they are written with the projection.
    // JSON is still written by every caller, so a session whose rows do not verify keeps being served from it.
    writeAndVerifySessionRows(db, session, projection);
    db.prepare(`UPDATE sessions SET layout_key=?, session_kind=?, primary_driver_ordinal=?, is_empty=?,
      source_revision=?, projection_revision=?, projection_version=? WHERE id=?`)
      .run(projection.layoutKey, projection.sessionKind, projection.primaryDriverOrdinal, Number(projection.isEmpty), revision, revision, projection.projectionVersion, session.id);
    if (isSessionJsonRemoved(db)) {
      db.prepare('UPDATE sessions SET recording_name=?, projection_error=NULL WHERE id=?')
        .run(projection.recordingName, session.id);
    } else {
      db.prepare('UPDATE sessions SET recording_name=?, summary_json=?, projection_error=NULL WHERE id=?')
        .run(projection.recordingName, serializeSessionCard(session, projection), session.id);
    }
    db.prepare(`INSERT INTO cache_metadata(key,value) VALUES('session_data_revision','1')
      ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)`).run();
    return true;
  });
  if (!run()) throw new Error(`Skipped stale session projection for ${session.id}`);
  return projection;
}

export function serializeSessionCard(session: DetailedSession, projection: SessionSummaryProjection): string {
  const metadata = { ...session } as Record<string, unknown>;
  metadata.isEmpty = projection.isEmpty;
  delete metadata.drivers;
  if (session.playerDriver) {
    const playerSummary = projection.drivers.find(driver => driver.isPlayer) ?? projection.drivers[projection.primaryDriverOrdinal ?? -1];
    const { laps: _laps, incidents: _incidents, trackLimits: _limits, penalties: _penalties, ...player } = session.playerDriver;
    metadata.playerDriver = { ...player, driverOrdinal: playerSummary?.driverOrdinal,
      bestLapOrdinal: playerSummary?.bestLapOrdinal ?? null, completedLapsCount: playerSummary?.lapsCount ?? 0,
      cleanLapsCount: playerSummary?.cleanLapsCount ?? 0, drivingTimeSeconds: playerSummary?.drivingTimeSum ?? 0,
      pitStopsCount: playerSummary?.pitCount ?? 0, maxTopSpeed: playerSummary?.maxSpeed ?? null,
      consistencyScore: playerSummary?.consistencyScore ?? null, topThreeAverage: playerSummary?.topThreeAverage ?? null };
  }
  return JSON.stringify(metadata);
}

export function projectionState(db: DatabaseType, sessionId: string): SessionProjectionState | null {
  const row = db.prepare('SELECT source_revision, projection_revision, projection_version FROM sessions WHERE id = ?').get(sessionId) as { source_revision: number; projection_revision: number; projection_version: number } | undefined;
  return row ? { sourceRevision: row.source_revision, projectionRevision: row.projection_revision, projectionVersion: row.projection_version } : null;
}

export function readCompactSession(db: DatabaseType, sessionId: string): SessionCard | null {
  return readSessionCards(db, [sessionId])[0] ?? null;
}

/** Sessions whose summaries are missing or stale; failed rows count as done (see markProjectionFailed). */
const STALE_PROJECTION = 'projection_version != ? OR projection_revision != source_revision';

/**
 * True when no session waits for its summaries or its normalized rows (a negative version was attempted
 * and counts as done, like a failed projection). Reads only the covering idx_sessions_ready index:
 * these columns sit after data_json in each row, so reading the row would walk its JSON.
 */
export function isSessionSummaryReady(db: DatabaseType): boolean {
  return !db.prepare(`SELECT 1 FROM sessions WHERE ${STALE_PROJECTION} OR normalized_version NOT IN (?, ?) LIMIT 1`)
    .get(SESSION_SUMMARY_PROJECTION_VERSION, NORMALIZED_SESSION_VERSION, -NORMALIZED_SESSION_VERSION);
}

export function countReadySessionSummaries(db: DatabaseType): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE projection_version = ? AND projection_revision = source_revision')
    .get(SESSION_SUMMARY_PROJECTION_VERSION) as { count: number }).count;
}

/**
 * A session whose summaries cannot be built keeps its detail row but leaves every aggregate: no
 * summary rows, a card without player figures, and the error. The rebuild moves on and history
 * reads stop waiting for it; its next source write (reparse, relink) builds it again.
 */
function markProjectionFailed(db: DatabaseType, id: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  db.transaction(() => {
    const row = db.prepare(`SELECT id, filename, file_path, timestamp, track_venue, track_course, session_type, session_name, time_string
      FROM sessions WHERE id = ?`).get(id) as { id: string; filename: string; file_path: string; timestamp: number;
      track_venue: string; track_course: string; session_type: DetailedSession['sessionType']; session_name: string; time_string: string | null } | undefined;
    if (!row) return;
    const card = { id: row.id, filename: row.filename, filePath: row.file_path, timestamp: row.timestamp,
      trackVenue: row.track_venue, trackCourse: row.track_course, sessionType: row.session_type,
      sessionName: row.session_name, isEmpty: true };
    for (const table of ['session_driver_condition_summaries', 'session_summary_facts']) {
      db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(id);
    }
    clearDerivedColumns(db, id);
    // Keep the session in counts/date groups, with no driver contribution after a failed rebuild.
    const empty: DetailedSession = { id: row.id, filename: row.filename, filePath: row.file_path,
      timestamp: row.timestamp, trackVenue: row.track_venue, trackCourse: row.track_course, trackEvent: '', trackLengthMeters: null,
      timeString: row.time_string ?? '',
      sessionType: row.session_type, sessionName: row.session_name, driversCount: 0, drivers: [] };
    persistSessionAggregate(db, empty, buildSessionSummaryProjection(empty, 0));
    if (isSessionJsonRemoved(db)) {
      db.prepare(`UPDATE sessions SET projection_version = ?, projection_revision = source_revision, is_empty = 1,
        projection_error = ? WHERE id = ?`)
        .run(SESSION_SUMMARY_PROJECTION_VERSION, message, id);
    } else {
      db.prepare(`UPDATE sessions SET projection_version = ?, projection_revision = source_revision, is_empty = 1,
        summary_json = ?, projection_error = ? WHERE id = ?`)
        .run(SESSION_SUMMARY_PROJECTION_VERSION, JSON.stringify(card), message, id);
    }
  })();
}

export interface SessionSummaryBackfillBatch { processed: number; failed: Array<{ id: string; error: unknown }> }

export function backfillSessionSummaries(db: DatabaseType, batchSize = 10): SessionSummaryBackfillBatch {
  const ids = db.prepare(`SELECT id FROM sessions WHERE ${STALE_PROJECTION} ORDER BY timestamp LIMIT ?`)
    .all(SESSION_SUMMARY_PROJECTION_VERSION, Math.max(1, batchSize)) as Array<{ id: string }>;
  const select = db.prepare('SELECT source_revision FROM sessions WHERE id = ?');
  const result: SessionSummaryBackfillBatch = { processed: 0, failed: [] };
  for (const { id } of ids) {
    try {
      const row = select.get(id) as { source_revision: number } | undefined;
      const session = row ? loadSession(db, id) : null;
      if (!row || !session) continue;
      persistSessionProjection(db, session, row.source_revision);
    } catch (error: unknown) {
      markProjectionFailed(db, id, error);
      result.failed.push({ id, error });
    }
    result.processed++;
  }
  return result;
}

export function *iterateStoredSessions(db: DatabaseType, batchSize = 10): Generator<DetailedSession> {
  const limit = Math.max(1, batchSize);
  let lastId = '';
  while (true) {
    const rows = db.prepare('SELECT id FROM sessions WHERE id > ? ORDER BY id LIMIT ?').all(lastId, limit) as Array<{ id: string }>;
    if (!rows.length) return;
    for (const row of rows) {
      lastId = row.id;
      const session = loadSession(db, row.id);
      if (session) yield session;
    }
  }
}

