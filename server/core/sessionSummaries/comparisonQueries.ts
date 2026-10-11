import type { Database as DatabaseType } from 'better-sqlite3';
import type { ComparableLap } from '../types.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { formatTime } from '../../../shared/domain/formatters.js';
import type { ComparableLapsResult } from '../../sessions/sessionAnalytics.js';
import { comparisonLapKey, readComparisonLapRows } from './comparisonLapRows.js';

export interface CompactCompareFilters {
  trackName?: string; trackVenue?: string; trackCourse?: string; carClass?: string; carModel?: string; driverName?: string; sessionId?: string;
  driverOrdinal?: number; lapOrdinal?: number; lapNum?: number;
  playerOnly?: boolean; humansOnly?: boolean; telemetryOnly?: boolean;
}
export interface CompactComparePage { page?: number; pageSize?: number; }
export interface CompactCompareResult extends ComparableLapsResult { page: number; pageSize: number; total: number; }
export interface TelemetryCompareResult { laps: ComparableLap[]; page: number; pageSize: number; total: number; }

interface LapFact {
  session_id: string; timestamp: number; track_venue: string; track_course: string; session_name: string;
  driver_ordinal: number; driver_name: string; car_class: string; car_type: string; is_player: number;
  lap_ordinal: number; lap_number: number; lap_time: number | null; s1: number | null; s2: number | null; s3: number | null;
  is_valid: number; is_inferred: number; is_pit_lap: number; is_out_lap: number; is_representative: number;
  leaderboard_eligible: number; non_representative_reason: string | null; is_all_time_pb: number;
}
interface QueryParts { where: string[]; args: Array<string | number>; }
interface SectorFact { s1: number | null; s2: number | null; s3: number | null; }
interface CountFact { total: number; }

function trackWhere(track: string, trackVenue?: string, trackCourse = ''): QueryParts {
  if ((!track || track.toLowerCase() === 'all') && !trackVenue) return { where: [], args: [] };
  const venue = trackVenue || track;
  const spec = getCircuitSpecification(venue, trackVenue ? trackCourse : '');
  if (Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, spec.layoutKey)) return { where: ['s.layout_key=?'], args: [spec.layoutKey] };
  return { where: ["s.layout_key='unknown' AND s.track_venue=? AND s.track_course=?"] , args: [venue, trackVenue ? trackCourse : ''] };
}
function classWhere(carClass: string): QueryParts {
  const target = carClass.trim();
  if (!target || target.toLowerCase() === 'all') return { where: [], args: [] };
  return { where: ['d.driver_class = ?'], args: [target] };
}
function append(parts: QueryParts, extra: QueryParts): QueryParts {
  return { where: [...parts.where, ...extra.where], args: [...parts.args, ...extra.args] };
}
function whereSql(parts: QueryParts): string { return parts.where.length ? parts.where.join(' AND ') : '1=1'; }
function lapJoinWhere(parts: QueryParts): string {
  return `FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    JOIN session_laps l ON l.session_id=d.session_id AND l.driver_ordinal=d.driver_ordinal
    WHERE ${whereSql(parts)}`;
}

function comparisonScope(filters: CompactCompareFilters) {
  const track = filters.trackName?.trim() ?? '';
  const trackParts = trackWhere(track, filters.trackVenue, filters.trackCourse);
  const classParts = classWhere(filters.carClass ?? '');
  const model = filters.carModel?.trim().toLowerCase() ?? '';
  const humanParts = filters.humansOnly ? { where: ['d.is_human=1'], args: [] } : { where: [], args: [] };
  let broad = append(append(trackParts, classParts), humanParts);
  if (model && model !== 'all') broad = append(broad, { where: ['lower(trim(v.car_type))=?'], args: [model] });
  if (filters.telemetryOnly) broad.where.push('s.recording_name IS NOT NULL');
  const display = { ...broad, where: [...broad.where], args: [...broad.args] };
  if (filters.playerOnly) display.where.push('d.is_player_driver=1');
  const driverName = filters.driverName?.trim().toLowerCase() ?? '';
  if (driverName && driverName !== 'all') { display.where.push('instr(lower(dn.name),?)>0'); display.args.push(driverName); }
  if (filters.sessionId) { display.where.push('s.id=?'); display.args.push(filters.sessionId); }
  const selected = { ...display, where: [...display.where], args: [...display.args] };
  if (filters.telemetryOnly) selected.where.push('l.is_valid=1', 'coalesce(l.is_pit_stop,0)=0', 'coalesce(l.is_out_lap,0)=0', 'l.lap_time>0');
  if (filters.driverOrdinal !== undefined) { selected.where.push('d.driver_ordinal=?'); selected.args.push(filters.driverOrdinal); }
  if (filters.lapOrdinal !== undefined) { selected.where.push('l.lap_ordinal=?'); selected.args.push(filters.lapOrdinal); }
  if (filters.lapNum !== undefined) { selected.where.push('l.lap_num=?'); selected.args.push(filters.lapNum); }
  return { trackParts, broad, display, selected };
}

type PageLapFact = Pick<LapFact, 'session_id' | 'driver_ordinal' | 'lap_ordinal' | 'driver_name' | 'is_all_time_pb'>;

function markPagePersonalBests(db: DatabaseType, rows: PageLapFact[], display: QueryParts): void {
  if (!rows.length) return;
  const names = [...new Set(rows.map(row => row.driver_name.trim().toLowerCase()))];
  // Rank history once for the page's drivers. Locator/paging filters do not narrow a driver's PB.
  const bests = db.prepare(`SELECT session_id,driver_ordinal,lap_ordinal FROM (
      SELECT s.id session_id,d.driver_ordinal,l.lap_ordinal,
        row_number() OVER (PARTITION BY lower(trim(dn.name))
          ORDER BY l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal) best_rank
      ${lapJoinWhere({ where: [...display.where, `lower(trim(dn.name)) IN (${names.map(() => '?').join(',')})`], args: [] })}
        AND l.is_valid=1 AND l.lap_time>0
    ) WHERE best_rank=1`).all(...display.args, ...names) as Array<Pick<PageLapFact, 'session_id' | 'driver_ordinal' | 'lap_ordinal'>>;
  const bestKeys = new Set(bests.map(best => `${best.session_id}:${best.driver_ordinal}:${best.lap_ordinal}`));
  for (const row of rows) row.is_all_time_pb = bestKeys.has(`${row.session_id}:${row.driver_ordinal}:${row.lap_ordinal}`) ? 1 : 0;
}

interface TelemetryLapFact extends PageLapFact {
  timestamp: number; session_name: string; session_type: string; time_string: string;
  car_type: string; car_class: string; is_player: number; lap_num: number; lap_time: number;
  lap_time_string: string; s1: number | null; s2: number | null; s3: number | null; top_speed: number | null;
  is_inferred: number; non_representative_reason: ComparableLap['nonRepresentativeReason'] | null;
  best_lap_time: number | null; recording_name: string;
  has_rain: number | null; weather_condition: ComparableLap['weatherCondition'] | null;
}

/** The telemetry picker needs only one page of lap identities and display fields, with no session hydration. */
export function queryTelemetryComparableLaps(
  db: DatabaseType, filters: CompactCompareFilters, pageOptions: CompactComparePage = {},
): TelemetryCompareResult {
  const page = Math.max(1, Math.trunc(pageOptions.page ?? 1));
  const pageSize = Math.max(1, Math.min(250, Math.trunc(pageOptions.pageSize ?? 50)));
  const { display, selected } = comparisonScope({ ...filters, telemetryOnly: true });
  const total = (db.prepare(`SELECT count(*) total ${lapJoinWhere(selected)}`).get(...selected.args) as CountFact).total;
  const rows = db.prepare(`SELECT s.id session_id,s.timestamp,s.session_name,s.session_type,s.time_string,s.recording_name,
      d.driver_ordinal,coalesce(dn.name,'') driver_name,coalesce(v.car_type,'') car_type,coalesce(nullif(v.car_class,''),'General') car_class,
      d.is_player_driver is_player,d.best_lap_time,l.lap_ordinal,l.lap_num,l.lap_time,l.lap_time_string,
      l.s1,l.s2,l.s3,l.top_speed,l.is_inferred,l.non_representative_reason,0 is_all_time_pb,
      (SELECT has_rain FROM session_recordings WHERE session_id=s.id) has_rain,
      (SELECT weather_condition FROM session_recordings WHERE session_id=s.id) weather_condition
    ${lapJoinWhere(selected)} ORDER BY s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT ? OFFSET ?`)
    .all(...selected.args, pageSize, (page - 1) * pageSize) as TelemetryLapFact[];
  markPagePersonalBests(db, rows, display);
  const laps: ComparableLap[] = rows.map(row => ({
    id: `${row.session_id}_driver_${row.driver_ordinal}_lap_${row.lap_ordinal}`,
    sessionId: row.session_id, driverOrdinal: row.driver_ordinal, lapOrdinal: row.lap_ordinal,
    sessionName: row.session_name, sessionType: row.session_type, dateString: row.time_string, timestamp: row.timestamp,
    driverName: row.driver_name, carType: row.car_type, carClass: row.car_class,
    lapNum: row.lap_num, lapTime: row.lap_time, lapTimeString: row.lap_time_string,
    s1: row.s1, s2: row.s2, s3: row.s3, topSpeed: row.top_speed,
    isValid: true, isPitStop: false, isOutLap: false, isInferred: Boolean(row.is_inferred),
    nonRepresentativeReason: row.non_representative_reason ?? undefined,
    isPlayer: Boolean(row.is_player), isAllTimePB: Boolean(row.is_all_time_pb),
    isSessionBest: row.best_lap_time !== null && Math.abs(row.lap_time - row.best_lap_time) < 0.0005,
    matchingReplayFile: row.recording_name,
    hasRain: row.has_rain === null ? undefined : Boolean(row.has_rain), weatherCondition: row.weather_condition ?? undefined,
  }));
  return { laps, total, page, pageSize };
}

/** SQL-scoped comparison reads; only the result page and three exact best laps are materialized. */
export function queryCompactComparableLaps(
  db: DatabaseType,
  filters: CompactCompareFilters,
  pageOptions: CompactComparePage = {},
): CompactCompareResult {
  const page = Math.max(1, Math.trunc(pageOptions.page ?? 1));
  const pageSize = Math.max(1, Math.min(250, Math.trunc(pageOptions.pageSize ?? 100)));
  const { trackParts, broad, display, selected } = comparisonScope(filters);
  const offset = (page - 1) * pageSize;

  const total = (db.prepare(`SELECT count(*) total ${lapJoinWhere(selected)}`).get(...selected.args) as CountFact).total;
  const sessionsCount = (db.prepare(`SELECT count(DISTINCT s.id) total FROM sessions s WHERE ${whereSql(trackParts)}`).get(...trackParts.args) as CountFact).total;
  const baseSql = lapJoinWhere(broad);
  const overallFact = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player_driver is_player,
      l.lap_ordinal,l.lap_num lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop is_pit_lap,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    ${baseSql} AND l.is_valid=1 AND l.lap_time>0 ORDER BY l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...broad.args) as LapFact | undefined ?? null;
  const representativeBest = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player_driver is_player,
      l.lap_ordinal,l.lap_num lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop is_pit_lap,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
      JOIN session_laps l ON l.session_id=c.session_id AND l.driver_ordinal=c.driver_ordinal AND l.lap_ordinal=c.best_lap_ordinal
    WHERE ${whereSql(display)} AND c.best_lap_time>0 ORDER BY c.best_lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...display.args) as LapFact | undefined ?? null;
  const playerScopeMatches = filters.playerOnly && !filters.sessionId && (!filters.driverName?.trim() || filters.driverName.trim().toLowerCase() === 'all');
  const playerBest = playerScopeMatches ? representativeBest : db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player_driver is_player,
      l.lap_ordinal,l.lap_num lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop is_pit_lap,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
      JOIN session_laps l ON l.session_id=c.session_id AND l.driver_ordinal=c.driver_ordinal AND l.lap_ordinal=c.best_lap_ordinal
    WHERE ${whereSql(broad)} AND d.is_player_driver=1 AND c.best_lap_time>0 ORDER BY c.best_lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...broad.args) as LapFact | undefined ?? null;
  const sector = db.prepare(`SELECT min(c.best_s1) s1,min(c.best_s2) s2,min(c.best_s3) s3
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
    WHERE ${whereSql(display)}`).get(...display.args) as SectorFact;

  const rows = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player_driver is_player,
      l.lap_ordinal,l.lap_num lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop is_pit_lap,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,
      0 is_all_time_pb
    ${lapJoinWhere(selected)} ORDER BY s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT ? OFFSET ?`)
    .all(...selected.args, pageSize, offset) as LapFact[];
  markPagePersonalBests(db, rows, display);

  const selectedLaps = readComparisonLapRows(db, [...rows,
    ...[overallFact, representativeBest, playerBest].filter((fact): fact is LapFact => fact !== null)]);
  const toDto = (fact: LapFact | null): ComparableLap | null => {
    const lap = fact && selectedLaps.get(comparisonLapKey(fact));
    return lap && fact ? { ...lap, isAllTimePB: Boolean(fact.is_all_time_pb) } : null;
  };
  const laps = rows.flatMap(row => { const dto = toDto(row); return dto ? [dto] : []; });
  const bestValidDto = toDto(overallFact);
  const allTimeDto = toDto(representativeBest);
  const playerDto = toDto(playerBest);
  const bestS1 = sector.s1; const bestS2 = sector.s2; const bestS3 = sector.s3;
  const theoreticalBestSec = bestS1 !== null && bestS2 !== null && bestS3 !== null ? Number((bestS1 + bestS2 + bestS3).toFixed(3)) : null;
  const tagged = (lap: ComparableLap | null, kind: 'overall' | 'all-time' | 'player'): ComparableLap | null => {
    if (!lap) return null;
    if (kind === 'overall') return { ...lap, isOverallTrackBest: true, tag: `🏆 All-Time Best (${lap.driverName})` };
    if (kind === 'all-time') return { ...lap, isAllTimePB: true, tag: '⭐ All-Time Best Lap' };
    return { ...lap, isAllTimePB: true, isPlayer: true, tag: '⭐ Personal Best' };
  };
  return {
    laps, allTimeBestLap: tagged(allTimeDto, 'all-time'), playerBestLap: tagged(playerDto, 'player'), overallTrackBestLap: tagged(bestValidDto, 'overall'),
    bestS1, bestS2, bestS3, bestS1String: formatTime(bestS1), bestS2String: formatTime(bestS2), bestS3String: formatTime(bestS3),
    theoreticalBestSec, theoreticalBestString: formatTime(theoreticalBestSec), sessionsCount, page, pageSize, total,
  };
}
