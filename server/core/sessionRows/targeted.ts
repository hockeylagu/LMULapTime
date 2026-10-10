import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, SessionMetadata } from '../types.js';
import { RECORDING_FIELDS } from './specs.js';
import { packFields, type Row, type SqlValue } from './fields.js';
import { buildSessionSummaryProjection } from '../../../shared/domain/sessionSummaries/index.js';
import { persistSessionAggregate } from '../sessionSummaries/aggregateStore.js';
import { updateDerivedColumns } from './writer.js';

type ReplayLink = NonNullable<SessionMetadata['matchingReplayFile']>;

const insertCondition = `INSERT INTO session_driver_condition_summaries VALUES (
  @sessionId,@driverOrdinal,@conditionGroup,@cleanCount,@cleanTimeSum,@cleanTimeSquareSum,@bestLapOrdinal,@bestLapTime,
  @bestS1,@bestS2,@bestS3,@fastestThreeCount,@fastestThreeTimeSum)`;

function bumpSessionDataRevision(db: DatabaseType): void {
  db.prepare(`INSERT INTO cache_metadata(key,value) VALUES('session_data_revision','1')
    ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)`).run();
}

/**
 * Targeted update for associating a replay with a session: upserts `session_recordings` and
 * updates `sessions.recording_name` and `updated_at`.
 */
export function upsertTargetedReplayLink(
  db: DatabaseType,
  sessionId: string,
  link: ReplayLink,
  updatedAt = Date.now()
): void {
  const params: Record<string, SqlValue> = { session_id: sessionId };
  packFields(params, link as unknown as Row, RECORDING_FIELDS);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO session_recordings (
        session_id, recording_name, path, size_bytes, event_title, split_no, event_type,
        duration_sec, has_rain, max_rain_intensity, weather_condition, ambient_temp, track_temp
      ) VALUES (
        @session_id, @recording_name, @path, @size_bytes, @event_title, @split_no, @event_type,
        @duration_sec, @has_rain, @max_rain_intensity, @weather_condition, @ambient_temp, @track_temp
      )
      ON CONFLICT(session_id) DO UPDATE SET
        recording_name = excluded.recording_name,
        path = excluded.path,
        size_bytes = excluded.size_bytes,
        event_title = excluded.event_title,
        split_no = excluded.split_no,
        event_type = excluded.event_type,
        duration_sec = excluded.duration_sec,
        has_rain = excluded.has_rain,
        max_rain_intensity = excluded.max_rain_intensity,
        weather_condition = excluded.weather_condition,
        ambient_temp = excluded.ambient_temp,
        track_temp = excluded.track_temp
    `).run(params);

    db.prepare('UPDATE sessions SET recording_name = ?, updated_at = ? WHERE id = ?')
      .run(link.name, updatedAt, sessionId);

    bumpSessionDataRevision(db);
  })();
}

/**
 * Targeted update for withdrawing a replay link: removes from `session_recordings` and clears
 * `sessions.recording_name`.
 */
export function deleteTargetedReplayLink(
  db: DatabaseType,
  sessionId: string,
  updatedAt = Date.now()
): void {
  db.transaction(() => {
    db.prepare('DELETE FROM session_recordings WHERE session_id = ?').run(sessionId);
    db.prepare('UPDATE sessions SET recording_name = NULL, updated_at = ? WHERE id = ?').run(updatedAt, sessionId);

    bumpSessionDataRevision(db);
  })();
}

/**
 * Targeted update when an archived replay file is renamed: updates all matching recordings in
 * `session_recordings` and `sessions`.
 */
export function renameTargetedReplay(
  db: DatabaseType,
  oldFilename: string,
  newFilename: string,
  newPath: string,
  updatedAt = Date.now()
): void {
  db.transaction(() => {
    db.prepare('UPDATE session_recordings SET recording_name = ?, path = ? WHERE recording_name = ?')
      .run(newFilename, newPath, oldFilename);
    db.prepare(`UPDATE sessions SET recording_name = ?, source_revision = source_revision + 1,
      projection_revision = projection_revision + 1, updated_at = ? WHERE recording_name = ?`)
      .run(newFilename, updatedAt, oldFilename);

    bumpSessionDataRevision(db);
  })();
}


/**
 * Targeted update for attaching or detaching a DuckDB telemetry file: sets `sessions.duckdb_filename`
 * and `has_duckdb_telemetry`.
 */
export function updateTargetedTelemetry(
  db: DatabaseType,
  sessionId: string,
  duckdbFilename: string | undefined
): void {
  db.transaction(() => {
    db.prepare('UPDATE sessions SET duckdb_filename = ?, has_duckdb_telemetry = ? WHERE id = ?')
      .run(duckdbFilename ?? null, duckdbFilename ? 1 : 0, sessionId);

    bumpSessionDataRevision(db);
  })();
}

/**
 * Targeted update for reclassified conditions: updates condition columns on `session_recordings`,
 * `session_drivers`, and `session_laps`, re-computes projection condition summaries and derived
 * metrics, and updates `sessions` revisions.
 */
export function updateTargetedConditions(
  db: DatabaseType,
  session: DetailedSession,
  updatedAt = Date.now()
): void {
  const row = db.prepare('SELECT source_revision FROM sessions WHERE id = ?').get(session.id) as { source_revision: number } | undefined;
  const revision = (row?.source_revision ?? 0) + 1;
  const projection = buildSessionSummaryProjection(session, revision);

  db.transaction(() => {
    // 1. Update session_recordings weather if linked
    if (session.matchingReplayFile) {
      const link = session.matchingReplayFile;
      const hasRainSql = link.hasRain === undefined ? null : (link.hasRain ? 1 : 0);
      db.prepare(`UPDATE session_recordings SET
        has_rain = ?, max_rain_intensity = ?, weather_condition = ?
        WHERE session_id = ?`)
        .run(
          hasRainSql,
          link.maxRainIntensity ?? null,
          link.weatherCondition ?? null,
          session.id
        );
    }


    // 2. Update session_drivers and session_laps condition values
    const driverStmt = db.prepare(`UPDATE session_drivers SET
      avg_lap_time = ?, avg_lap_time_string = ?, best_lap_wet = ?
      WHERE session_id = ? AND driver_ordinal = ?`);

    const lapStmt = db.prepare(`UPDATE session_laps SET
      condition_wet_tyres = ?, condition_rain = ?, non_representative_reason = ?
      WHERE session_id = ? AND driver_ordinal = ? AND lap_ordinal = ?`);

    session.drivers.forEach((driver, driverOrdinal) => {
      driverStmt.run(
        driver.avgLapTime ?? null,
        driver.avgLapTimeString ?? null,
        driver.bestLapWet ? 1 : null,
        session.id,
        driverOrdinal
      );

      driver.laps.forEach((lap, lapOrdinal) => {
        lapStmt.run(
          lap.conditions?.wetTyres ? 1 : null,
          lap.conditions?.rain ?? null,
          lap.nonRepresentativeReason ?? null,
          session.id,
          driverOrdinal,
          lapOrdinal
        );
      });
    });

    // 3. Update condition summaries
    db.prepare('DELETE FROM session_driver_condition_summaries WHERE session_id = ?').run(session.id);
    const conditionStmt = db.prepare(insertCondition);
    for (const value of projection.conditions) conditionStmt.run(value);

    // 4. Update aggregates and driver/lap derived projection columns
    persistSessionAggregate(db, session, projection);
    updateDerivedColumns(db, session.id, projection);

    // 5. Update session row metadata
    db.prepare(`UPDATE sessions SET layout_key=?, session_kind=?, primary_driver_ordinal=?, is_empty=?,
      source_revision=?, projection_revision=?, projection_version=?, updated_at=?,
      recording_name=?, projection_error=NULL WHERE id=?`)
      .run(
        projection.layoutKey, projection.sessionKind, projection.primaryDriverOrdinal,
        Number(projection.isEmpty), revision, revision, projection.projectionVersion, updatedAt,
        projection.recordingName, session.id
      );

    bumpSessionDataRevision(db);
  })();
}
