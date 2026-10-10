import type { Database } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';
import type { SessionSummaryProjection } from '../../../shared/types/sessionSummaries.js';

/** Compact one-row-per-session facts keep history scans away from source/card JSON. */
export function initSessionAggregateSchema(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS session_summary_facts (
    session_id TEXT PRIMARY KEY, timestamp REAL NOT NULL, event_timestamp REAL NOT NULL,
    track_venue TEXT NOT NULL, track_course TEXT NOT NULL, layout_key TEXT NOT NULL, track_length REAL,
    session_type TEXT NOT NULL, session_name TEXT NOT NULL, session_kind TEXT NOT NULL,
    time_string TEXT NOT NULL, session_day TEXT NOT NULL, is_empty INTEGER NOT NULL, has_player INTEGER NOT NULL,
    driver_name TEXT NOT NULL, car_type TEXT NOT NULL, car_class TEXT NOT NULL, position INTEGER,
    position_gain REAL, laps_count INTEGER NOT NULL, declared_laps_count INTEGER NOT NULL,
    clean_laps_count INTEGER NOT NULL, driving_time_sum REAL NOT NULL, pit_count INTEGER NOT NULL,
    distance_km REAL NOT NULL, activity_distance_km REAL NOT NULL, max_speed REAL,
    best_lap_time REAL, best_lap_time_string TEXT NOT NULL, best_lap_wet INTEGER NOT NULL,
    best_lap_number INTEGER, best_s1 REAL, best_s2 REAL, best_s3 REAL, consistency_score REAL,
    primary_lap_count INTEGER NOT NULL, primary_valid_lap_count INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_session_facts_recent ON session_summary_facts(timestamp DESC,
    (CASE session_type WHEN 'Race' THEN 3 WHEN 'Qualifying' THEN 2 WHEN 'Practice' THEN 1 ELSE 0 END) DESC);
  CREATE INDEX IF NOT EXISTS idx_session_facts_day ON session_summary_facts(session_day,session_type,timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_session_facts_layout ON session_summary_facts(layout_key,car_class,event_timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_session_facts_pace ON session_summary_facts(car_class,timestamp DESC) WHERE has_player=1 AND best_lap_wet=0 AND best_lap_time>0;
  CREATE INDEX IF NOT EXISTS idx_session_facts_speed ON session_summary_facts(max_speed DESC,timestamp ASC) WHERE max_speed IS NOT NULL;`);
}

export function persistSessionAggregate(db: Database, session: DetailedSession, projection: SessionSummaryProjection): void {
  const facts = projection.aggregate;
  const player = facts.player;
  const values = {
    session_id: session.id, timestamp: session.timestamp, event_timestamp: facts.eventTimestamp,
    track_venue: session.trackVenue, track_course: session.trackCourse, layout_key: projection.layoutKey,
    track_length: facts.trackLengthMeters, session_type: session.sessionType, session_name: session.sessionName,
    session_kind: projection.sessionKind, time_string: facts.timeString, session_day: facts.sessionDay,
    is_empty: Number(projection.isEmpty), has_player: Number(Boolean(player)), driver_name: player?.driverName ?? '',
    car_type: player?.carType ?? '', car_class: player?.carClass ?? '', position: player?.position ?? null,
    position_gain: facts.positionGain, laps_count: player?.lapsCount ?? 0, declared_laps_count: player?.declaredLapsCount ?? 0,
    clean_laps_count: player?.cleanLapsCount ?? 0, driving_time_sum: player?.drivingTimeSum ?? 0,
    pit_count: player?.pitCount ?? 0, distance_km: facts.distanceKm, activity_distance_km: facts.activityDistanceKm,
    max_speed: player?.maxSpeed ?? null, best_lap_time: player?.bestLapTime ?? null,
    best_lap_time_string: facts.bestLapTimeString, best_lap_wet: Number(player?.bestLapWet ?? false),
    best_lap_number: player?.bestLapNumber ?? null, best_s1: player?.bestS1 ?? null,
    best_s2: player?.bestS2 ?? null, best_s3: player?.bestS3 ?? null, consistency_score: player?.consistencyScore ?? null,
    primary_lap_count: facts.primaryLapCount, primary_valid_lap_count: facts.primaryValidLapCount,
  };
  const columns = Object.keys(values);
  db.prepare(`INSERT INTO session_summary_facts (${columns.join(',')}) VALUES (${columns.map(key => `@${key}`).join(',')})
    ON CONFLICT(session_id) DO UPDATE SET ${columns.filter(key => key !== 'session_id').map(key => `${key}=excluded.${key}`).join(',')}`).run(values);
}
