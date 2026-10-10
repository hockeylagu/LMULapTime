import type { Database as DatabaseType } from 'better-sqlite3';
import type { ReferenceLaptimeEntry } from '../types.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DashboardData, DashboardMetrics, DashboardTrends } from '../../../shared/types/dashboard.js';
import { getDisplayTrackName, matchesSessionType } from '../../../shared/domain/formatters.js';
import { getPaceCategoryFromPercentage, normalizeCarClass } from '../../../shared/domain/paceCategory.js';
import { findLayoutBenchmark } from '../../../shared/domain/leaderboard.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { querySessionPage, type SessionQuery } from './pageQueries.js';
import { rateSessionCard } from './readTimePace.js';
import { readSessionCards } from './cards.js';

export interface DashboardQueryOptions extends SessionQuery { revision?: string; referenceEntries?: Record<string, ReferenceLaptimeEntry>; }

interface DashboardSummaryRow {
  id: string; track_venue: string; track_course: string; track_length: number | null;
  car_type: string; car_class: string; best_lap_time: number | null; best_lap_wet: number;
  best_lap_time_string: string; time_string: string;
}

function emptyTrends(): DashboardTrends {
  return { hasData: false, driverName: 'Driver', latestOuting: null, todayActivity: null, recentPaceTrend: [], paceDelta: null,
    paceTrendDirection: 'none', paceTrendClass: null, recentCleanRate: null, recentConsistency: null, recentNetPositions: 0 };
}

function paceFor(row: DashboardSummaryRow, entries: Record<string, ReferenceLaptimeEntry>): { percentage: number; category: ReturnType<typeof getPaceCategoryFromPercentage> } | null {
  if (row.best_lap_wet || !row.best_lap_time || row.best_lap_time <= 0) return null;
  const spec = getCircuitSpecification(row.track_venue, row.track_course, null, null, null, row.track_length);
  const target = findLayoutBenchmark(entries, spec.layoutKey, row.car_class);
  if (!target?.target100Sec) return null;
  const percentage = Number(((row.best_lap_time / target.target100Sec) * 100).toFixed(2));
  return { percentage, category: getPaceCategoryFromPercentage(percentage) };
}

/** Current targets are small lookup inputs; SQLite rates history and returns only grouped results. */
function benchmarkMetrics(db: DatabaseType, entries: Record<string, ReferenceLaptimeEntry>) {
  const targets = new Map<string, [string, string, number]>();
  for (const entry of Object.values(entries)) {
    const layout = getCircuitSpecification(entry.trackName).layoutKey;
    const carClass = normalizeCarClass(entry.carClass);
    const key = `${layout}:${carClass}`;
    if (!targets.has(key) && entry.target100Sec > 0) targets.set(key, [layout, carClass, entry.target100Sec]);
  }
  if (!targets.size) return { sum: 0, count: 0, best: [] as DashboardMetrics['bestTrackRefLaps'] };
  const values = [...targets.values()];
  const cte = `WITH targets(layout,car_class,target) AS (VALUES ${values.map(() => '(?,?,?)').join(',')}), rated AS (
    SELECT s.session_id id,s.timestamp,s.track_venue,s.track_course,s.car_type,
      s.best_lap_time_string lap_string,
      round(s.best_lap_time*100.0/t.target,2) percentage
    FROM session_summary_facts s
    JOIN targets t ON t.layout=s.layout_key AND t.car_class=s.car_class
    WHERE s.has_player=1 AND s.best_lap_wet=0 AND s.best_lap_time>0
      AND coalesce(s.best_lap_time_string,'')<>''
  )`;
  const totals = db.prepare(`${cte} SELECT coalesce(sum(percentage),0) sum,count(*) count FROM rated`)
    .get(...values.flat()) as { sum: number; count: number };
  const rows = db.prepare(`${cte}, ranked AS (
    SELECT *,row_number() OVER(PARTITION BY track_venue,track_course ORDER BY percentage,timestamp,id) rank FROM rated
  ) SELECT * FROM ranked WHERE rank=1`).all(...values.flat()) as Array<{
    id:string;track_venue:string;track_course:string;car_type:string;lap_string:string;percentage:number;
  }>;
  const best = new Map<string, DashboardMetrics['bestTrackRefLaps'][number]>();
  for (const row of rows) {
    const track = getDisplayTrackName(row.track_venue,row.track_course);
    if (!best.has(track) || row.percentage < best.get(track)!.percentage) best.set(track, {
      sessionId:row.id,percentage:row.percentage,category:getPaceCategoryFromPercentage(row.percentage),
      lapTimeString:row.lap_string,track,car:row.car_type,
    });
  }
  return {...totals,best:[...best.values()].sort((a,b)=>a.percentage-b.percentage)};
}

function dashboardMetrics(db: DatabaseType, entries: Record<string, ReferenceLaptimeEntry>): DashboardMetrics {
  const totals = db.prepare(`
    SELECT count(DISTINCT s.session_id) sessions_count,coalesce(sum(s.laps_count),0) total_laps,coalesce(sum(s.clean_laps_count),0) clean_laps,
      coalesce(sum(s.driving_time_sum),0) driving_seconds,coalesce(sum(s.pit_count),0) pit_stops,
      coalesce(sum(s.distance_km),0) distance_km
    FROM session_summary_facts s
  `).get() as { sessions_count: number; total_laps: number; clean_laps: number; driving_seconds: number; pit_stops: number; distance_km: number };
  const trackRows = db.prepare(`SELECT s.track_venue,s.track_course,coalesce(sum(s.laps_count),0) laps,
      coalesce(sum(s.distance_km),0) km
    FROM session_summary_facts s GROUP BY s.track_venue,s.track_course`)
    .all() as Array<{ track_venue: string; track_course: string; laps: number; km: number }>;
  const trackMap = new Map<string, { track: string; laps: number; km: number }>();
  for (const row of trackRows) {
    const track = getDisplayTrackName(row.track_venue, row.track_course); if (!track) continue;
    const item = trackMap.get(track) ?? { track, laps: 0, km: 0 }; item.laps += row.laps; item.km += row.km; trackMap.set(track, item);
  }
  const carRows = db.prepare(`SELECT s.car_type car,coalesce(sum(s.laps_count),0) laps,
      coalesce(sum(s.distance_km),0) km
    FROM session_summary_facts s
    WHERE s.car_type<>'' AND s.laps_count>0 GROUP BY s.car_type`).all() as Array<{ car: string; laps: number; km: number }>;
  const fastest = db.prepare(`SELECT s.track_venue,s.track_course,s.max_speed FROM session_summary_facts s WHERE s.max_speed IS NOT NULL ORDER BY s.max_speed DESC,s.timestamp ASC,s.rowid ASC LIMIT 1`)
    .get() as { track_venue: string; track_course: string; max_speed: number } | undefined;
  const maxTopSpeed = fastest?.max_speed ?? 0;
  const maxTopSpeedTrack = fastest ? getDisplayTrackName(fastest.track_venue, fastest.track_course) : '';
  const typeRows = db.prepare(`SELECT s.session_type,s.session_name,s.position,count(*) n FROM session_summary_facts s GROUP BY s.session_type,s.session_name,s.position`).iterate() as IterableIterator<{ session_type: string; session_name: string; position: number | null; n:number }>;
  let practiceSessionsCount = 0; let qualifyingSessionsCount = 0; let raceSessionsCount = 0; let raceWinsCount = 0; let racePodiumsCount = 0;
  for (const row of typeRows) {
    if (matchesSessionType(row.session_type, row.session_name, 'Race')) { raceSessionsCount+=row.n; if (row.position === 1) raceWinsCount+=row.n; if (row.position !== null && row.position > 0 && row.position <= 3) racePodiumsCount+=row.n; }
    else if (matchesSessionType(row.session_type, row.session_name, 'Qualifying')) qualifyingSessionsCount+=row.n;
    else practiceSessionsCount+=row.n;
  }
  const benchmark = benchmarkMetrics(db,entries);
  const cleanPercentage = totals.total_laps > 0 ? Math.round((totals.clean_laps / totals.total_laps) * 1000) / 10 : 0;
  const average = benchmark.count ? Math.round((benchmark.sum / benchmark.count) * 10) / 10 : null;
  return {
    sessionsCount: totals.sessions_count,
    totalLaps: totals.total_laps, cleanLaps: totals.clean_laps, cleanLapsPercentage: cleanPercentage,
    totalDistanceKm: totals.distance_km, totalDrivingSeconds: totals.driving_seconds, maxTopSpeed, maxTopSpeedTrack,
    averageBenchmarkPacePercentage: average, averageBenchmarkPaceCategory: average === null ? null : getPaceCategoryFromPercentage(average),
    practiceSessionsCount, qualifyingSessionsCount, raceSessionsCount, raceWinsCount, racePodiumsCount, totalPitStops: totals.pit_stops,
    rankedTracks: [...trackMap.values()].sort((a, b) => b.laps - a.laps), rankedCars: carRows.sort((a, b) => b.laps - a.laps),
    bestTrackRefLaps: benchmark.best,
  };
}

function dashboardTrends(db: DatabaseType, entries: Record<string, ReferenceLaptimeEntry>): DashboardTrends {
  const order = `s.timestamp DESC,CASE s.session_type WHEN 'Race' THEN 3 WHEN 'Qualifying' THEN 2 WHEN 'Practice' THEN 1 ELSE 0 END DESC,s.rowid DESC`;
  const driverName = (db.prepare(`SELECT s.driver_name FROM session_summary_facts s
    WHERE trim(s.driver_name)<>'' ORDER BY ${order} LIMIT 1`).get() as { driver_name: string } | undefined)?.driver_name ?? 'Driver';
  const validWhere = `s.is_empty=0 AND s.laps_count>0 AND (s.best_lap_time>0 OR
    (trim(coalesce(s.best_lap_time_string,''))<>'' AND s.best_lap_time_string<>'--:--.---'))`;
  const hydrate = (id: string): (SessionCard & { isEmpty: boolean }) | null => {
    const card = readSessionCards(db, [id])[0];
    return card ? rateSessionCard(card) : null;
  };
  const validRows = db.prepare(`SELECT s.session_id id,s.timestamp,s.time_string time_string FROM session_summary_facts s WHERE ${validWhere} ORDER BY ${order} LIMIT 5`)
    .all() as Array<{ id: string; timestamp: number; time_string: string }>;
  const newestValid = validRows[0];
  let latestId: string | undefined;
  if (newestValid) {
    const day = newestValid.time_string?.split(' ')[0] ?? '';
    if (day) {
      latestId = (db.prepare(`SELECT s.session_id id FROM session_summary_facts s
        WHERE ${validWhere} AND s.session_type='Race' AND s.session_day=? ORDER BY ${order} LIMIT 1`)
        .get(day) as { id: string } | undefined)?.id;
    }
    if (!latestId) {
      const newestMillis = newestValid.time_string ? new Date(newestValid.time_string.replace(/\//g, '-')).getTime() : 0;
      latestId = validRows.find(row => {
        if (row === newestValid) return false;
        const card = hydrate(row.id);
        if (card?.sessionType !== 'Race') return false;
        if (!row.time_string || !newestValid.time_string || !newestMillis) return true;
        return newestMillis - new Date(row.time_string.replace(/\//g, '-')).getTime() <= 7 * 24 * 60 * 60 * 1000;
      })?.id;
    }
    latestId ??= newestValid.id;
  } else {
    latestId = (db.prepare(`SELECT s.session_id id FROM session_summary_facts s
      WHERE s.session_type='Race' AND (coalesce(s.laps_count,0)>0 OR trim(coalesce(s.best_lap_time_string,''))<>'')
      ORDER BY ${order} LIMIT 1`).get() as { id: string } | undefined)?.id ??
      (db.prepare(`SELECT s.session_id id FROM session_summary_facts s
        WHERE s.laps_count>0 OR trim(coalesce(s.best_lap_time_string,''))<>'' ORDER BY ${order} LIMIT 1`)
        .get() as { id: string } | undefined)?.id ??
      (db.prepare(`SELECT s.session_id id FROM session_summary_facts s WHERE s.has_player=1 ORDER BY ${order} LIMIT 1`)
        .get() as { id: string } | undefined)?.id;
  }
  const latest = latestId ? hydrate(latestId) : null;
  if (!latest?.playerDriver) return { ...emptyTrends(), driverName };
  const player = latest.playerDriver;
  const trackName = getDisplayTrackName(latest.trackVenue, latest.trackCourse);
  const latestOuting: DashboardTrends['latestOuting'] = {
    id: latest.id, trackName, trackVenue: latest.trackVenue, trackCourse: latest.trackCourse,
    sessionType: latest.sessionType, timeString: latest.timeString, carName: player.carType, carClass: player.carClass,
    bestLapTimeString: player.bestLapTimeString, bestLapTime: player.bestLapTime,
    bestLapNum: player.bestLapNum, pacePercentage: player.bestLapPacePercentage, paceCategory: player.bestLapPaceCategory,
    bestLapWet: player.bestLapWet, position: player.position, gridPosition: player.gridPosition, positionGain: player.positionGain,
    driverOrdinal: player.driverOrdinal, bestLapOrdinal: player.bestLapOrdinal,
    lapsCount: player.lapsCount, hasReplay: Boolean(latest.matchingReplayFile),
    hasDuckDbTelemetry: Boolean(latest.hasDuckDbTelemetry || latest.matchingReplayFile?.hasDuckDbTelemetry),
  };
  const trendClass = normalizeCarClass(player.carClass, player.carType);
  const recentPaceTrend: DashboardTrends['recentPaceTrend'] = [];
  const trendRows = db.prepare(`SELECT s.session_id id,s.track_venue,s.track_course,s.track_length,
      s.car_type,s.car_class,s.best_lap_time,s.best_lap_wet,s.best_lap_time_string,s.time_string
    FROM session_summary_facts s
    WHERE s.has_player=1 AND s.car_class=? AND s.best_lap_wet=0 AND s.best_lap_time>0 ORDER BY ${order}`)
    .iterate(trendClass) as IterableIterator<DashboardSummaryRow>;
  for (const row of trendRows) {
    const pace = paceFor(row, entries); if (!pace) continue;
    recentPaceTrend.push({ id: row.id, trackName: getDisplayTrackName(row.track_venue, row.track_course), carName: row.car_type,
      timeString: row.time_string, bestLapTimeString: row.best_lap_time_string, pacePercentage: pace.percentage, paceCategory: pace.category });
    if (recentPaceTrend.length === 6) break;
  }
  recentPaceTrend.reverse();
  const paceDelta = recentPaceTrend.length >= 2 ? Number((recentPaceTrend[0].pacePercentage - recentPaceTrend[recentPaceTrend.length - 1].pacePercentage).toFixed(2)) : null;
  const dateString = latest.timeString.split(' ')[0] ?? '';
  const dayRows = dateString ? db.prepare(`SELECT count(*) sessions_count,coalesce(sum(s.laps_count),0) laps,
      coalesce(sum(s.activity_distance_km),0) km
    FROM session_summary_facts s
    WHERE s.session_day=?`).get(dateString) as { sessions_count: number; laps: number; km: number } : null;
  const recentIds = (db.prepare(`SELECT session_id id FROM session_summary_facts s ORDER BY ${order} LIMIT 8`).all() as Array<{ id: string }>).map(value => value.id);
  const recentMetrics = recentIds.length ? (() => {
    const placeholders = recentIds.map(() => '?').join(',');
    const lapCounts = db.prepare(`SELECT sum(primary_lap_count) total,sum(primary_valid_lap_count) valid FROM session_summary_facts
      WHERE session_id IN (${placeholders})`)
      .get(...recentIds) as { total: number; valid: number };
    const sessionStats = db.prepare(`SELECT avg(s.consistency_score) consistency,
        coalesce(sum(s.position_gain),0) net_positions
      FROM session_summary_facts s WHERE s.session_id IN (${placeholders})`)
      .get(...recentIds) as { consistency: number | null; net_positions: number };
    return { ...lapCounts, ...sessionStats };
  })() : null;
  const cleanRate = recentMetrics?.total ? Number(((recentMetrics.valid / recentMetrics.total) * 100).toFixed(1)) : null;
  const direction = paceDelta === null ? 'none' : paceDelta >= 0.3 ? 'improving' : paceDelta <= -0.3 ? 'declining' : 'steady';
  return { hasData: true, driverName, latestOuting, todayActivity: dayRows ? { dateString, sessionsCount: dayRows.sessions_count, lapsCount: dayRows.laps, distanceKm: Number(dayRows.km.toFixed(1)) } : null,
    recentPaceTrend, paceDelta, paceTrendDirection: direction, paceTrendClass: trendClass || null,
    recentCleanRate: cleanRate, recentConsistency: recentMetrics?.consistency === null || recentMetrics?.consistency === undefined ? null : Number(recentMetrics.consistency.toFixed(1)),
    recentNetPositions: recentMetrics?.net_positions ?? 0 };
}

export function queryCompactDashboard(db: DatabaseType, options: DashboardQueryOptions): DashboardData {
  const entries = options.referenceEntries ?? {};
  const sessions = querySessionPage(db, options);
  const metrics = dashboardMetrics(db, entries);
  const trends = dashboardTrends(db, entries);
  const tracks = db.prepare('SELECT DISTINCT track_venue,track_course FROM sessions ORDER BY track_venue,track_course')
    .all() as Array<{ track_venue: string; track_course: string }>;
  const trackNames = [...new Set(tracks.map(row => getDisplayTrackName(row.track_venue, row.track_course)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const emptyCount = (db.prepare('SELECT count(*) count FROM sessions WHERE is_empty=1').get() as { count: number }).count;
  const replayCount = (db.prepare('SELECT count(*) count FROM sessions WHERE recording_name IS NOT NULL').get() as { count: number }).count;
  return { revision: options.revision ?? '', metrics, trends, tracks: trackNames, emptyCount, replayCount,
    sessions: sessions.sessions.map(rateSessionCard), total: sessions.total, page: sessions.page, pageSize: sessions.pageSize };
}

