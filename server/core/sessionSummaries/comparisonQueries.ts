import type { Database as DatabaseType } from 'better-sqlite3';
import type { ComparableLap, WeatherCondition } from '../../../shared/types/index.js';
import { CIRCUIT_SPECIFICATIONS } from '../../../shared/domain/circuitDefinitions.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { computeTheoreticalBest } from '../../../shared/domain/formatters.js';
import { SESSION_TYPE_BY_KIND, type CompareLapSort, type SessionKind } from '../../../shared/domain/compareLapScope.js';
import type { ComparableLapsResult } from '../../sessions/sessionAnalytics.js';
import { comparisonLapKey, readComparisonLapRows } from './comparisonLapRows.js';

export interface CompactCompareFilters {
  trackName?: string; trackVenue?: string; trackCourse?: string; carClass?: string; carType?: string; driverName?: string; sessionId?: string;
  driverOrdinal?: number; lapOrdinal?: number; lapNumber?: number;
  playerOnly?: boolean; humansOnly?: boolean; telemetryOnly?: boolean;
  /** Telemetry picker only: session-type bucket and recording condition the laps must have. */
  sessionKind?: SessionKind; condition?: WeatherCondition;
  /** Telemetry picker only: skip laps the parser marked non-representative. */
  representativeOnly?: boolean;
  /** Match `driverName` as the whole name (case-insensitive) instead of as part of it. */
  driverNameExact?: boolean;
  /** Leave out one lap (the one on screen): its session and lap ordinal. */
  excludeLap?: { sessionId: string; lapOrdinal: number };
}
export interface CompactComparePage { page?: number; pageSize?: number; sort?: CompareLapSort; }
export interface CompactCompareResult extends ComparableLapsResult { page: number; pageSize: number; total: number; }
export interface TelemetryCompareResult {
  laps: ComparableLap[]; page: number; pageSize: number; total: number;
  /** Car types of the scope ignoring the car filter (the other filters still apply), sorted by name. Page 1 only: the list does not depend on the page. */
  carTypes?: string[];
}

interface LapFact {
  session_id: string; timestamp: number; track_venue: string; track_course: string; session_name: string;
  driver_ordinal: number; driver_name: string; car_class: string; car_type: string; is_player: number;
  lap_ordinal: number; lap_number: number; lap_time: number | null; s1: number | null; s2: number | null; s3: number | null;
  is_valid: number; is_inferred: number; is_pit_stop: number; is_out_lap: number; is_representative: number;
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
function lapJoinWhere(parts: QueryParts, recordings = false): string {
  return `FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    JOIN session_laps l ON l.session_id=d.session_id AND l.driver_ordinal=d.driver_ordinal${recordings ? ' LEFT JOIN session_recordings r ON r.session_id=s.id' : ''}
    WHERE ${whereSql(parts)}`;
}

/** The SQL form of `recordedCondition` over the joined recording `r`. */
const RECORDED_CONDITION_SQL = "coalesce(r.weather_condition, CASE WHEN r.has_rain=1 THEN 'Wet' ELSE 'Dry' END)";

const TELEMETRY_ORDER: Record<CompareLapSort, string> = {
  lap: 'l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal',
  recent: 's.timestamp DESC,s.rowid DESC,d.driver_ordinal,l.lap_ordinal',
  driver: "coalesce(dn.name,'') COLLATE NOCASE,l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal",
};

function telemetryViewWhere(filters: CompactCompareFilters): QueryParts {
  const parts: QueryParts = { where: [], args: [] };
  if (filters.sessionKind) { parts.where.push('s.session_type=?'); parts.args.push(SESSION_TYPE_BY_KIND[filters.sessionKind]); }
  if (filters.condition) { parts.where.push(`${RECORDED_CONDITION_SQL}=?`); parts.args.push(filters.condition); }
  return parts;
}

function comparisonScope(filters: CompactCompareFilters) {
  const track = filters.trackName?.trim() ?? '';
  const trackParts = trackWhere(track, filters.trackVenue, filters.trackCourse);
  const classParts = classWhere(filters.carClass ?? '');
  const model = filters.carType?.trim().toLowerCase() ?? '';
  const humanParts = filters.humansOnly ? { where: ['d.is_human=1'], args: [] } : { where: [], args: [] };
  let broad = append(append(trackParts, classParts), humanParts);
  if (model && model !== 'all') broad = append(broad, { where: ['lower(trim(v.car_type))=?'], args: [model] });
  if (filters.telemetryOnly) broad.where.push('s.recording_name IS NOT NULL');
  const driverParts: QueryParts = { where: [], args: [] };
  if (filters.playerOnly) driverParts.where.push('d.is_player=1');
  const driverName = filters.driverName?.trim().toLowerCase() ?? '';
  if (driverName && driverName !== 'all') {
    driverParts.where.push(filters.driverNameExact ? 'lower(trim(dn.name))=?' : 'instr(lower(dn.name),?)>0'); driverParts.args.push(driverName);
  }
  const display = append(broad, driverParts);
  // The gold personal best is the driver's fastest lap of the layout and class: any car, any condition,
  // with or without a replay. Car, recording, session and lap filters only narrow the rows shown.
  const personalBestScope = append(append(append(trackParts, classParts), humanParts), driverParts);
  if (filters.sessionId) { display.where.push('s.id=?'); display.args.push(filters.sessionId); }
  const selected = { ...display, where: [...display.where], args: [...display.args] };
  if (filters.telemetryOnly) selected.where.push('l.is_valid=1', 'coalesce(l.is_pit_stop,0)=0', 'coalesce(l.is_out_lap,0)=0', 'l.lap_time>0');
  if (filters.telemetryOnly && filters.representativeOnly) selected.where.push('l.non_representative_reason IS NULL');
  if (filters.driverOrdinal !== undefined) { selected.where.push('d.driver_ordinal=?'); selected.args.push(filters.driverOrdinal); }
  if (filters.lapOrdinal !== undefined) { selected.where.push('l.lap_ordinal=?'); selected.args.push(filters.lapOrdinal); }
  if (filters.lapNumber !== undefined) { selected.where.push('l.lap_number=?'); selected.args.push(filters.lapNumber); }
  if (filters.excludeLap) { selected.where.push('NOT (s.id=? AND l.lap_ordinal=?)'); selected.args.push(filters.excludeLap.sessionId, filters.excludeLap.lapOrdinal); }
  return { trackParts, broad, display, selected, personalBestScope };
}

type PageLapFact = Pick<LapFact, 'session_id' | 'driver_ordinal' | 'lap_ordinal' | 'driver_name' | 'is_all_time_pb'>;

/**
 * Personal-best distinctions:
 * - Gold badge (`is_all_time_pb`): fastest valid lap in the class across any car and condition.
 * - Blue badge: session best.
 * - Compare page `playerBestLap`: clean dry personal best.
 * - "vs your best": fastest representative lap in the class.
 */
function markPagePersonalBests(db: DatabaseType, rows: PageLapFact[], display: QueryParts): void {
  if (!rows.length) return;
  const names = [...new Set(rows.map(row => row.driver_name.trim().toLowerCase()))];
  // Rank history once for the page's drivers. Locator/paging filters do not narrow a driver's PB.
  // Each session row already stores the driver's fastest valid lap there, so only one row per
  // driver and session is ranked, not every lap.
  const bests = db.prepare(`SELECT session_id,driver_ordinal,lap_ordinal FROM (
      SELECT s.id session_id,d.driver_ordinal,d.best_lap_ordinal lap_ordinal,
        row_number() OVER (PARTITION BY lower(trim(dn.name))
          ORDER BY d.best_lap_time,s.timestamp,s.rowid,d.driver_ordinal) best_rank
      FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      WHERE ${whereSql({ where: [...display.where, `lower(trim(dn.name)) IN (${names.map(() => '?').join(',')})`], args: [] })}
        AND d.best_lap_time>0 AND d.best_lap_ordinal IS NOT NULL
    ) WHERE best_rank=1`).all(...display.args, ...names) as Array<Pick<PageLapFact, 'session_id' | 'driver_ordinal' | 'lap_ordinal'>>;
  const bestKeys = new Set(bests.map(best => `${best.session_id}:${best.driver_ordinal}:${best.lap_ordinal}`));
  for (const row of rows) row.is_all_time_pb = bestKeys.has(`${row.session_id}:${row.driver_ordinal}:${row.lap_ordinal}`) ? 1 : 0;
}

interface TelemetryLapFact extends PageLapFact {
  timestamp: number; session_name: string; session_type: string; time_string: string;
  car_type: string; car_class: string; is_player: number; lap_number: number; lap_time: number;
  s1: number | null; s2: number | null; s3: number | null; top_speed: number | null;
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
  const { personalBestScope, selected: scoped } = comparisonScope({ ...filters, telemetryOnly: true });
  const selected = append(scoped, telemetryViewWhere(filters));
  const total = (db.prepare(`SELECT count(*) total ${lapJoinWhere(selected, true)}`).get(...selected.args) as CountFact).total;
  let carTypes: string[] | undefined;
  if (page === 1) {
    const carScope = comparisonScope({ ...filters, carType: undefined, telemetryOnly: true }).selected;
    const carTypeScope = append(carScope, telemetryViewWhere(filters));
    carTypes = (db.prepare(`SELECT DISTINCT v.car_type car_type ${lapJoinWhere(carTypeScope, true)} AND coalesce(v.car_type,'')<>'' ORDER BY v.car_type`)
      .all(...carTypeScope.args) as Array<{ car_type: string }>).map(row => row.car_type);
  }
  const rows = db.prepare(`SELECT s.id session_id,s.timestamp,s.session_name,s.session_type,s.time_string,s.recording_name,
      d.driver_ordinal,coalesce(dn.name,'') driver_name,coalesce(v.car_type,'') car_type,coalesce(nullif(v.car_class,''),'General') car_class,
      d.is_player,d.best_lap_time,l.lap_ordinal,l.lap_number,l.lap_time,
      l.s1,l.s2,l.s3,l.top_speed,l.is_inferred,l.non_representative_reason,0 is_all_time_pb,
      r.has_rain,r.weather_condition
    ${lapJoinWhere(selected, true)} ORDER BY ${TELEMETRY_ORDER[pageOptions.sort ?? 'lap']} LIMIT ? OFFSET ?`)
    .all(...selected.args, pageSize, (page - 1) * pageSize) as TelemetryLapFact[];
  markPagePersonalBests(db, rows, personalBestScope);
  const laps: ComparableLap[] = rows.map(row => ({
    id: `${row.session_id}_driver_${row.driver_ordinal}_lap_${row.lap_ordinal}`,
    sessionId: row.session_id, driverOrdinal: row.driver_ordinal, lapOrdinal: row.lap_ordinal,
    sessionName: row.session_name, sessionType: row.session_type, timeString: row.time_string, timestamp: row.timestamp,
    driverName: row.driver_name, carType: row.car_type, carClass: row.car_class,
    lapNumber: row.lap_number, lapTime: row.lap_time,
    s1: row.s1, s2: row.s2, s3: row.s3, topSpeed: row.top_speed,
    isValid: true, isPitStop: false, isOutLap: false, isInferred: Boolean(row.is_inferred),
    nonRepresentativeReason: row.non_representative_reason ?? undefined,
    isPlayer: Boolean(row.is_player), isAllTimePB: Boolean(row.is_all_time_pb),
    isSessionBest: row.best_lap_time !== null && Math.abs(row.lap_time - row.best_lap_time) < 0.0005,
    matchingReplayFile: row.recording_name,
    hasRain: row.has_rain === null ? undefined : Boolean(row.has_rain), weatherCondition: row.weather_condition ?? undefined,
  }));
  return { laps, total, page, pageSize, carTypes };
}

/** SQL-scoped comparison reads; only the result page and three exact best laps are materialized. */
export function queryCompactComparableLaps(
  db: DatabaseType,
  filters: CompactCompareFilters,
  pageOptions: CompactComparePage = {},
): CompactCompareResult {
  const page = Math.max(1, Math.trunc(pageOptions.page ?? 1));
  const pageSize = Math.max(1, Math.min(250, Math.trunc(pageOptions.pageSize ?? 100)));
  const { trackParts, broad, display, selected, personalBestScope } = comparisonScope(filters);
  const offset = (page - 1) * pageSize;

  const total = (db.prepare(`SELECT count(*) total ${lapJoinWhere(selected)}`).get(...selected.args) as CountFact).total;
  const sessionsCount = (db.prepare(`SELECT count(DISTINCT s.id) total FROM sessions s WHERE ${whereSql(trackParts)}`).get(...trackParts.args) as CountFact).total;
  const baseSql = lapJoinWhere(broad);
  const overallFact = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player,
      l.lap_ordinal,l.lap_number lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    ${baseSql} AND l.is_valid=1 AND l.lap_time>0 ORDER BY l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...broad.args) as LapFact | undefined ?? null;
  const representativeBest = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player,
      l.lap_ordinal,l.lap_number lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
      JOIN session_laps l ON l.session_id=c.session_id AND l.driver_ordinal=c.driver_ordinal AND l.lap_ordinal=c.best_lap_ordinal
    WHERE ${whereSql(display)} AND c.best_lap_time>0 ORDER BY c.best_lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...display.args) as LapFact | undefined ?? null;
  const playerScopeMatches = filters.playerOnly && !filters.sessionId && (!filters.driverName?.trim() || filters.driverName.trim().toLowerCase() === 'all');
  const playerBest = playerScopeMatches ? representativeBest : db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player,
      l.lap_ordinal,l.lap_number lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,0 is_all_time_pb
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
      JOIN session_laps l ON l.session_id=c.session_id AND l.driver_ordinal=c.driver_ordinal AND l.lap_ordinal=c.best_lap_ordinal
    WHERE ${whereSql(broad)} AND d.is_player=1 AND c.best_lap_time>0 ORDER BY c.best_lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`).get(...broad.args) as LapFact | undefined ?? null;
  const sector = db.prepare(`SELECT min(c.best_s1) s1,min(c.best_s2) s2,min(c.best_s3) s3
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal AND c.condition_group='dry'
    WHERE ${whereSql(display)}`).get(...display.args) as SectorFact;

  const rows = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player,
      l.lap_ordinal,l.lap_number lap_number,l.lap_time,l.s1,l.s2,l.s3,l.is_valid,l.is_inferred,l.is_pit_stop,l.is_out_lap,l.is_representative,l.leaderboard_eligible,l.non_representative_reason,
      0 is_all_time_pb
    ${lapJoinWhere(selected)} ORDER BY s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT ? OFFSET ?`)
    .all(...selected.args, pageSize, offset) as LapFact[];
  markPagePersonalBests(db, rows, personalBestScope);

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
  const theoreticalBestSec = computeTheoreticalBest(bestS1, bestS2, bestS3);
  const tagged = (lap: ComparableLap | null, kind: 'overall' | 'all-time' | 'player'): ComparableLap | null => {
    if (!lap) return null;
    if (kind === 'overall') return { ...lap, isOverallTrackBest: true, tag: `🏆 All-Time Best (${lap.driverName})` };
    if (kind === 'all-time') return { ...lap, isAllTimePB: true, tag: '⭐ All-Time Best Lap' };
    return { ...lap, isAllTimePB: true, isPlayer: true, tag: '⭐ Personal Best' };
  };
  return {
    laps, allTimeBestLap: tagged(allTimeDto, 'all-time'), playerBestLap: tagged(playerDto, 'player'), overallTrackBestLap: tagged(bestValidDto, 'overall'),
    bestS1, bestS2, bestS3,
    theoreticalBestSec, sessionsCount, page, pageSize, total,
  };
}
