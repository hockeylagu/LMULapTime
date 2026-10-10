import type { Database } from 'better-sqlite3';
import type { TrackSummary } from '../../../shared/types/index.js';
import { computeTheoreticalBest, getDisplayTrackName, minValidTime } from '../../../shared/domain/formatters.js';
import { sessionWhere, type SessionQuery } from './pageQueries.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { matchesTrack } from '../../../shared/domain/paceCategory.js';

export interface TrackDetailFilterOptions {
  carModels: string[];
  sessionTypes: string[];
  emptyCount: number;
  replayCount: number;
}

export interface TrackPositionAverages { qualifyingAveragePosition: number | null; finishAveragePosition: number | null; }
export interface TrackLatestSessionContext { trackCourse?: string; trackLengthMeters?: number | null; carClass?: string; carType?: string; }

interface TrackAggregateRow {
  track_venue: string; track_course: string; layout_key: string; raw_latest: number;
  sessions_count: number; total_laps: number; last_timestamp: number | null;
  best_lap_time: number | null; best_lap_driver: string | null; best_lap_car: string | null;
  best_lap_class: string | null; best_lap_wet: number | null; sector_s1: number | null; best_s2: number | null; best_s3: number | null;
  best_timestamp: number | null; best_id: string | null;
}

interface SqlFragment { sql: string; values: (string | number)[]; }

function customTrackScope(trackName: string): SqlFragment {
  return { sql: "(s.track_venue=? OR trim(s.track_venue || ' - ' || s.track_course)=? OR s.track_venue || ' (' || s.track_course || ')'=?)",
    values: [trackName, trackName, trackName] };
}

function carClassMatch(targetClass?: string): SqlFragment {
  if (!targetClass || targetClass === 'All') return { sql: '1=1', values: [] };
  const combined = "lower(coalesce(f.driver_class,'') || ' ' || coalesce(fv.car_type,''))";
  switch (targetClass.toLowerCase()) {
    case 'lmh': case 'hypercar': case 'hyper': case 'lmdh':
      return { sql: `(${combined} LIKE '%hyper%' OR ${combined} LIKE '%lmh%' OR ${combined} LIKE '%lmdh%')`, values: [] };
    case 'lmgt3': case 'gt3':
      return { sql: `(${combined} LIKE '%gt3%' OR ${combined} LIKE '%lmgt3%')`, values: [] };
    case 'lmp2elms': case 'lmp2 (elms)': case 'lmp2_elms': case 'elms':
      return { sql: `(${combined} LIKE '%elms%' OR ${combined} LIKE '%lmp2_elms%')`, values: [] };
    case 'lmp2wec': case 'lmp2 (wec)': case 'lmp2': case 'wec':
      return { sql: `(${combined} LIKE '%lmp2%' AND ${combined} NOT LIKE '%elms%')`, values: [] };
    case 'lmp3':
      return { sql: `${combined} LIKE '%lmp3%'`, values: [] };
    case 'gte':
      return { sql: `${combined} LIKE '%gte%'`, values: [] };
    default:
      return { sql: `instr(${combined},?)>0`, values: [targetClass.toLowerCase()] };
  }
}

function sessionClassMatch(targetClass?: string): SqlFragment {
  const match = carClassMatch(targetClass);
  if (match.sql === '1=1') return match;
  return { sql: `EXISTS (SELECT 1 FROM session_drivers f LEFT JOIN vehicles fv ON fv.vehicle_id=f.vehicle_id WHERE f.session_id=s.id AND ${match.sql})`, values: match.values };
}

function aggregateScopeSql(trackName: string, carClass?: string, carModel?: string): SqlFragment {
  const spec = getCircuitSpecification(trackName);
  const canonicalLayout = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, spec.layoutKey);
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (canonicalLayout) { clauses.push('s.layout_key=?'); values.push(spec.layoutKey); }
  else {
    const track = customTrackScope(trackName);
    clauses.push(track.sql);
    values.push(...track.values);
  }
  if (carModel && carModel !== 'All') { clauses.push('s.player_car_type=?'); values.push(carModel); }
  if (carClass && carClass !== 'All') {
    const match = sessionClassMatch(carClass);
    clauses.push(match.sql);
    values.push(...match.values);
  }
  return { sql: clauses.join(' AND '), values };
}

function trackBaseCte(carClass?: string, carModel?: string, layoutKey?: string, trackName?: string): SqlFragment {
  const classMatch = carClassMatch(carClass);
  const clauses: string[] = [];
  const values: (string | number)[] = [...classMatch.values];
  if (carModel && carModel !== 'All') { clauses.push('s.player_car_type=?'); values.push(carModel); }
  if (layoutKey) { clauses.push('s.layout_key=?'); values.push(layoutKey); }
  if (trackName) {
    const track = customTrackScope(trackName);
    clauses.push(track.sql);
    values.push(...track.values);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { sql: `WITH base AS (
      SELECT s.id,s.track_venue,s.track_course,s.layout_key,s.timestamp,s.session_name,
        s.player_driver_name,s.player_car_type,s.player_car_class,s.player_best_lap_time,s.player_laps_count,
        a.event_timestamp,
        CASE WHEN ${sessionClassMatch(carClass).sql} THEN 1 ELSE 0 END class_match,
        a.best_s1,a.best_s2,a.best_s3,a.best_lap_wet
      FROM sessions s JOIN session_summary_facts a ON a.session_id=s.id
      ${where}
    )`, values };
}

function queryAggregatedTrackSummaries(db: Database, carClass?: string, carModel?: string, layoutKey?: string, trackName?: string): Map<string, TrackSummary> {
  const cte = trackBaseCte(carClass, carModel, layoutKey, trackName);
  const rows = db.prepare(`${cte.sql}, aggregates AS (
      SELECT track_venue,track_course,layout_key,MAX(event_timestamp) raw_latest,
        SUM(class_match) sessions_count,
        SUM(CASE WHEN class_match=1 AND player_driver_name IS NOT NULL THEN coalesce(player_laps_count,0) ELSE 0 END) total_laps,
        MAX(CASE WHEN class_match=1 THEN event_timestamp END) last_timestamp,
        MIN(CASE WHEN class_match=1 AND player_driver_name IS NOT NULL AND best_s1>0 THEN best_s1 END) sector_s1,
        MIN(CASE WHEN class_match=1 AND player_driver_name IS NOT NULL AND best_s2>0 THEN best_s2 END) best_s2,
        MIN(CASE WHEN class_match=1 AND player_driver_name IS NOT NULL AND best_s3>0 THEN best_s3 END) best_s3
      FROM base GROUP BY track_venue,track_course,layout_key
    ), best_ranked AS (
      SELECT *,ROW_NUMBER() OVER (PARTITION BY track_venue,track_course,layout_key ORDER BY player_best_lap_time ASC,event_timestamp DESC,id DESC) best_rank
      FROM base WHERE class_match=1 AND player_driver_name IS NOT NULL AND player_best_lap_time>0
    )
    SELECT a.*,b.player_best_lap_time best_lap_time,b.player_driver_name best_lap_driver,b.player_car_type best_lap_car,
      b.player_car_class best_lap_class,b.best_lap_wet,b.event_timestamp best_timestamp,b.id best_id
    FROM aggregates a LEFT JOIN best_ranked b ON b.track_venue=a.track_venue AND b.track_course=a.track_course
      AND b.layout_key=a.layout_key AND b.best_rank=1
    ORDER BY a.raw_latest DESC,a.track_venue,a.track_course`).all(...cte.values) as TrackAggregateRow[];
  const summaries = new Map<string, TrackSummary>();
  const bestOrder = new Map<string, { time: number; timestamp: number; id: string }>();
  for (const row of rows) {
    const displayTrack = getDisplayTrackName(row.track_venue, row.track_course);
    if (!displayTrack) continue;
    let summary = summaries.get(displayTrack);
    if (!summary) {
      summary = { trackVenue: displayTrack, sessionsCount: 0, totalLaps: 0, bestLapTime: null, bestLapDriver: '', bestLapCar: '',
        bestLapClass: '', bestS1: null, bestS2: null, bestS3: null, theoreticalBest: null, carsUsed: [], lastSessionTimestamp: 0 };
      summaries.set(displayTrack, summary);
    }
    summary.sessionsCount += row.sessions_count;
    summary.totalLaps += row.total_laps;
    summary.lastSessionTimestamp = Math.max(summary.lastSessionTimestamp ?? 0, row.last_timestamp ?? 0);
    summary.bestS1 = minValidTime(summary.bestS1, row.sector_s1);
    summary.bestS2 = minValidTime(summary.bestS2, row.best_s2);
    summary.bestS3 = minValidTime(summary.bestS3, row.best_s3);
    summary.theoreticalBest = computeTheoreticalBest(summary.bestS1, summary.bestS2, summary.bestS3);
    const time = row.best_lap_time;
    if (time !== null) {
      const previous = bestOrder.get(displayTrack);
      const timestamp = row.best_timestamp ?? 0;
      const id = row.best_id ?? '';
      if (!previous || time < previous.time || (time === previous.time && (timestamp > previous.timestamp || (timestamp === previous.timestamp && id > previous.id)))) {
        summary.bestLapTime = time; summary.bestLapDriver = row.best_lap_driver ?? '';
        summary.bestLapCar = row.best_lap_car ?? ''; summary.bestLapClass = row.best_lap_class ?? '';
        summary.bestLapWet = row.best_lap_wet ? true : undefined;
        bestOrder.set(displayTrack, { time, timestamp, id });
      }
    }
  }
  const carRows = db.prepare(`${cte.sql}, ranked_cars AS (
      SELECT track_venue,track_course,player_car_type,event_timestamp,id,
        ROW_NUMBER() OVER(PARTITION BY track_venue,track_course,player_car_type ORDER BY event_timestamp DESC,id DESC) car_rank
      FROM base WHERE class_match=1 AND player_driver_name IS NOT NULL AND coalesce(player_car_type,'')<>''
    ) SELECT track_venue,track_course,player_car_type FROM ranked_cars WHERE car_rank=1
      ORDER BY event_timestamp DESC,id DESC`).all(...cte.values) as Array<{ track_venue: string; track_course: string; player_car_type: string }>;
  for (const row of carRows) {
    const summary = summaries.get(getDisplayTrackName(row.track_venue, row.track_course));
    if (summary && !summary.carsUsed.includes(row.player_car_type)) summary.carsUsed.push(row.player_car_type);
  }
  return summaries;
}

export function queryTrackLatestSessionContext(db: Database, trackName: string, carClass?: string, carModel?: string): TrackLatestSessionContext {
  const where = sessionWhere({ ...trackScope(trackName, { carClass }), playerCar: carModel && carModel !== 'All' ? carModel : undefined });
  const row = db.prepare(`SELECT s.track_course,a.track_length,
      d.driver_class car_class,v.car_type FROM sessions s LEFT JOIN session_drivers d ON d.session_id=s.id AND d.is_player_driver=1
      LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_summary_facts a ON a.session_id=s.id
      ${where.sql} ORDER BY s.timestamp DESC,s.id DESC LIMIT 1`).get(...where.values) as
    { track_course: string | null; track_length: number | null; car_class: string | null; car_type: string | null } | undefined;
  return row ? { trackCourse: row.track_course ?? undefined, trackLengthMeters: row.track_length,
    carClass: row.car_class ?? undefined, carType: row.car_type ?? undefined } : {};
}

export function queryTrackPositionAverages(db: Database, trackName: string, carClass?: string, carModel?: string): TrackPositionAverages {
  const scope = aggregateScopeSql(trackName, carClass, carModel);
  const row = db.prepare(`SELECT avg(CASE WHEN s.session_kind='qualifying' AND d.position>0 THEN d.position END) qualifying_average,
      avg(CASE WHEN s.session_kind='race' AND d.position>0 THEN d.position END) finish_average
    FROM sessions s LEFT JOIN session_drivers d ON d.session_id=s.id AND d.driver_ordinal=s.primary_driver_ordinal
    WHERE s.player_driver_name IS NOT NULL AND ${scope.sql}`).get(...scope.values) as
    { qualifying_average: number | null; finish_average: number | null };
  return { qualifyingAveragePosition: row.qualifying_average, finishAveragePosition: row.finish_average };
}

function trackScope(trackName: string, options: SessionQuery): SessionQuery {
  return { ...options, track: trackName, search: undefined, sessionType: undefined, hideEmpty: false, hasReplay: false, from: undefined, to: undefined };
}

/** Query a compact, SQL-aggregated track summary for the selected canonical layout/class/model. */
export function queryTrackDetailSummary(db: Database, trackName: string, carClass?: string, carModel?: string): TrackSummary | undefined {
  const spec = getCircuitSpecification(trackName);
  const canonicalLayout = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, spec.layoutKey);
  const summaries = queryAggregatedTrackSummaries(db, carClass, carModel,
    canonicalLayout ? spec.layoutKey : undefined,
    canonicalLayout ? undefined : trackName);
  const summary = [...summaries.values()].find(item => !canonicalLayout
    ? matchesTrack(trackName, item.trackVenue)
    : getCircuitSpecification(item.trackVenue).layoutKey === spec.layoutKey);
  return summary && summary.sessionsCount > 0 ? summary : undefined;
}

/** Small, scoped option lists and counts for controls; never derived from the current page. */
export function queryTrackDetailFilters(db: Database, trackName: string, carClass?: string, carModel?: string): TrackDetailFilterOptions {
  const base = sessionWhere(trackScope(trackName, { carClass }));
  const rows = db.prepare(`SELECT DISTINCT v.car_type FROM sessions s JOIN session_drivers d
    ON d.session_id=s.id AND d.is_player_driver=1 JOIN vehicles v ON v.vehicle_id=d.vehicle_id ${base.sql} ORDER BY v.car_type`)
    .all(...base.values) as Array<{ car_type: string }>;
  const types = db.prepare(`SELECT DISTINCT s.session_kind FROM sessions s ${base.sql} ORDER BY s.session_kind`)
    .all(...base.values) as Array<{ session_kind: string }>;
  const modelFilter = carModel && carModel !== 'All' ? ' AND s.player_car_type=?' : '';
  const modelValues = carModel && carModel !== 'All' ? [carModel] : [];
  const countRow = db.prepare(`SELECT sum(s.is_empty) empty_count,sum(CASE WHEN s.recording_name IS NOT NULL THEN 1 ELSE 0 END) replay_count
    FROM sessions s ${base.sql}${modelFilter}`).get(...base.values, ...modelValues) as { empty_count: number | null; replay_count: number | null };
  return { carModels: rows.map(row => row.car_type).filter(Boolean), sessionTypes: types.map(row => row.session_kind),
    emptyCount: countRow.empty_count ?? 0, replayCount: countRow.replay_count ?? 0 };
}

/** SQL groups compact contributions; only one result per displayed circuit is materialized. */
export function queryTrackSummaries(db: Database, carClass?: string): TrackSummary[] {
  return [...queryAggregatedTrackSummaries(db, carClass).values()];
}
