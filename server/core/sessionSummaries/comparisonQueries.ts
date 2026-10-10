import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, ComparableLap } from '../types.js';
import type { LapData, DriverData } from '../types.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { formatTime } from '../../../shared/domain/formatters.js';
import { toComparableLap, type ComparableLapsResult } from '../../sessions/sessionAnalytics.js';
import { rateSessionDetail } from './readTimePace.js';

export interface CompactCompareFilters {
  trackName?: string; carClass?: string; carModel?: string; driverName?: string; sessionId?: string;
  driverOrdinal?: number; lapOrdinal?: number; lapNum?: number;
  playerOnly?: boolean; humansOnly?: boolean;
}
export interface CompactComparePage { page?: number; pageSize?: number; }
export interface CompactCompareResult extends ComparableLapsResult { page: number; pageSize: number; total: number; }

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

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, '\\$&'); }
function normalizedSql(expression: string): string {
  return `lower(replace(replace(replace(replace(replace(replace(replace(replace(${expression},' ',''),'-',''), '_',''),'.',''),':',''),'/',''),'(',''),')',''))`;
}
function trackWhere(track: string): QueryParts {
  if (!track || track.toLowerCase() === 'all') return { where: [], args: [] };
  const spec = getCircuitSpecification(track);
  if (Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, spec.layoutKey)) return { where: ['s.layout_key=?'], args: [spec.layoutKey] };
  const q = escapeLike(track.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const combined = normalizedSql("s.track_venue || ' ' || s.track_course");
  const venue = normalizedSql('s.track_venue');
  return { where: [`s.layout_key='unknown' AND (${combined} LIKE '%'||?||'%' ESCAPE '\\' OR ? LIKE '%'||${combined}||'%' ESCAPE '\\' OR ${venue} LIKE '%'||?||'%' ESCAPE '\\')`], args: [q, q, q] };
}
function classWhere(carClass: string): QueryParts {
  const target = carClass.trim().toLowerCase();
  if (!target || target === 'all') return { where: [], args: [] };
  const combined = "lower(coalesce(d.driver_class,'') || ' ' || coalesce(v.car_type,''))";
  const includes = (_part: string) => `${combined} LIKE ?`;
  switch (target) {
    case 'lmh': case 'hypercar': case 'hyper': case 'lmdh':
      return { where: [`(${includes('hyper')} OR ${includes('lmh')} OR ${includes('lmdh')})`], args: ['%hyper%', '%lmh%', '%lmdh%'] };
    case 'lmgt3': case 'gt3':
      return { where: [`(${includes('gt3')} OR ${includes('lmgt3')})`], args: ['%gt3%', '%lmgt3%'] };
    case 'lmp2elms': case 'lmp2 (elms)': case 'lmp2_elms': case 'elms':
      return { where: [`(${includes('elms')} OR ${includes('lmp2_elms')})`], args: ['%elms%', '%lmp2_elms%'] };
    case 'lmp2wec': case 'lmp2 (wec)': case 'lmp2': case 'wec':
      return { where: [`${includes('lmp2')} AND ${combined} NOT LIKE ?`], args: ['%lmp2%', '%elms%'] };
    case 'lmp3': return { where: [includes('lmp3')], args: ['%lmp3%'] };
    case 'gte': return { where: [includes('gte')], args: ['%gte%'] };
    default: return { where: [includes(target)], args: [`%${escapeLike(target)}%`] };
  }
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

function lapDto(row: LapFact, getSessionById: (id: string) => DetailedSession | null): ComparableLap | null {
  const session = getSessionById(row.session_id);
  const driver = session?.drivers?.[row.driver_ordinal] as DriverData | undefined;
  const lap = driver?.laps?.[row.lap_ordinal] as LapData | undefined;
  if (!session || !driver || !lap) return null;
  return toComparableLap(session, driver, lap, {
    id: `${row.session_id}_driver_${row.driver_ordinal}_lap_${row.lap_ordinal}`,
    sessionId: row.session_id, driverOrdinal: row.driver_ordinal, lapOrdinal: row.lap_ordinal,
    isPlayer: Boolean(row.is_player), isAllTimePB: Boolean(row.is_all_time_pb),
    isSessionBest: lap.lapTime !== null && driver.bestLapTime !== null && Math.abs(lap.lapTime - driver.bestLapTime) < 0.0005,
  });
}

/** SQL-scoped comparison reads; only the result page and three exact best locators hydrate session JSON. */
export function queryCompactComparableLaps(
  db: DatabaseType,
  getSessionById: (id: string) => DetailedSession | null,
  filters: CompactCompareFilters,
  pageOptions: CompactComparePage = {},
): CompactCompareResult {
  const page = Math.max(1, Math.trunc(pageOptions.page ?? 1));
  const pageSize = Math.max(1, Math.min(250, Math.trunc(pageOptions.pageSize ?? 100)));
  const track = filters.trackName?.trim() ?? '';
  const trackParts = trackWhere(track);
  const classParts = classWhere(filters.carClass ?? '');
  const model = filters.carModel?.trim().toLowerCase() ?? '';
  const humanParts = filters.humansOnly ? { where: ['d.is_human=1'], args: [] } : { where: [], args: [] };
  let broad = append(append(trackParts, classParts), humanParts);
  if (model && model !== 'all') broad = append(broad, { where: ['lower(trim(v.car_type))=?'], args: [model] });
  const display = { ...broad, where: [...broad.where], args: [...broad.args] };
  if (filters.playerOnly) display.where.push('d.is_player_driver=1');
  const driverName = filters.driverName?.trim().toLowerCase() ?? '';
  if (driverName && driverName !== 'all') { display.where.push('lower(dn.name) LIKE ? ESCAPE \'\\\''); display.args.push(`%${escapeLike(driverName)}%`); }
  if (filters.sessionId) { display.where.push('s.id=?'); display.args.push(filters.sessionId); }
  const selected = { ...display, where: [...display.where], args: [...display.args] };
  if (filters.driverOrdinal !== undefined) { selected.where.push('d.driver_ordinal=?'); selected.args.push(filters.driverOrdinal); }
  if (filters.lapOrdinal !== undefined) { selected.where.push('l.lap_ordinal=?'); selected.args.push(filters.lapOrdinal); }
  if (filters.lapNum !== undefined) { selected.where.push('l.lap_num=?'); selected.args.push(filters.lapNum); }
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
  const playerBest = db.prepare(`SELECT s.id session_id,s.timestamp,s.track_venue,s.track_course,s.session_name,d.driver_ordinal,coalesce(dn.name,'') driver_name,d.driver_class car_class,coalesce(v.car_type,'') car_type,d.is_player_driver is_player,
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
  const bestForName = db.prepare(`SELECT s.id session_id,d.driver_ordinal,l.lap_ordinal
    ${lapJoinWhere({ where: [...display.where, 'lower(trim(dn.name))=?'], args: [] })}
      AND l.is_valid=1 AND l.lap_time>0 ORDER BY l.lap_time,s.timestamp,s.rowid,d.driver_ordinal,l.lap_ordinal LIMIT 1`);
  const bestKeys = new Set<string>();
  for (const name of new Set(rows.map(row => row.driver_name.trim().toLowerCase()))) {
    const best = bestForName.get(...display.args, name) as { session_id: string; driver_ordinal: number; lap_ordinal: number } | undefined;
    if (best) bestKeys.add(`${best.session_id}:${best.driver_ordinal}:${best.lap_ordinal}`);
  }
  for (const row of rows) row.is_all_time_pb = bestKeys.has(`${row.session_id}:${row.driver_ordinal}:${row.lap_ordinal}`) ? 1 : 0;

  const hydratedSessions = new Map<string, DetailedSession | null>();
  const readSession = (id: string): DetailedSession | null => {
    if (!hydratedSessions.has(id)) {
      const session = getSessionById(id);
      hydratedSessions.set(id, session ? rateSessionDetail(session) : null);
    }
    return hydratedSessions.get(id) ?? null;
  };
  const toDto = (fact: LapFact | null): ComparableLap | null => fact ? lapDto(fact, readSession) : null;
  const laps = rows.flatMap(row => { const dto = lapDto(row, readSession); return dto ? [dto] : []; });
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
