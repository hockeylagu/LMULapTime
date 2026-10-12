import {
  ReferenceBenchmarkDiff,
  ReferenceBenchmarkDiffItem,
} from '../../shared/types/index.js';
import {
  PACE_CATEGORY_BANDS,
} from '../../shared/domain/paceCategory.js';
import { formatTime } from '../../shared/domain/formatters.js';
import { CIRCUIT_SPECIFICATIONS } from '../../shared/domain/circuitDefinitions.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import type { PaceCategory } from '../../shared/types/index.js';
import type { Database as DatabaseType } from 'better-sqlite3';

const MAX_STORED_SAMPLE_SHIFTS = 25;

/** Bump when the impact rule changes: stored diffs computed with an older rule are recomputed. 2: player laps only. 3: the driver's own name on each changed lap. */
export const BENCHMARK_IMPACT_RULE = 4;

interface CompactImpactLap {
  affected_sessions: number; affected_laps: number; category_shifts_count: number;
  session_id: string | null; session_name: string | null; session_type: string | null;
  driver_name: string | null; lap_number: number | null; lap_time: number | null;
  old_category: PaceCategory | null; new_category: PaceCategory | null;
}

interface ImpactSql { sql: string; values: (string | number)[]; }

function sqlCarClassMatch(carClass: string): ImpactSql {
  return { sql: 'd.driver_class = ?', values: [carClass] };
}

function benchmarkTrackScope(item: ReferenceBenchmarkDiffItem): ImpactSql {
  const spec = getCircuitSpecification(item.trackName);
  const knownLayout = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, spec.layoutKey);
  return knownLayout
    ? { sql: 's.layout_key=?', values: [spec.layoutKey] }
    : { sql: "(s.track_venue=? OR trim(s.track_venue || ' - ' || s.track_course)=? OR s.track_venue || ' (' || s.track_course || ')' =?)", values: [item.trackName, item.trackName, item.trackName] };
}

function benchmarkScope(item: ReferenceBenchmarkDiffItem): ImpactSql {
  const track = benchmarkTrackScope(item);
  const car = sqlCarClassMatch(item.carClass);
  return { sql: `${track.sql} AND ${car.sql}`, values: [...track.values, ...car.values] };
}

function paceCategorySql(target: number | undefined): string {
  if (!target || target <= 0) return 'NULL';
  const pct = `(l.lap_time*100.0/${target})`;
  const bands = PACE_CATEGORY_BANDS;
  const cases = bands.slice(0, -1)
    .map(band => `WHEN ${pct}<=${band.maxPercentage} THEN '${band.category}'`)
    .join(' ');
  return `CASE ${cases} ELSE '${bands[bands.length - 1].category}' END`;
}

/** Computes historical impact from indexed compact lap facts, without loading detailed session JSON. */
export function enrichBenchmarkDiffWithCompactImpact(diff: ReferenceBenchmarkDiff, db: DatabaseType): ReferenceBenchmarkDiff {
  const items = [...diff.added, ...diff.updated, ...diff.removed];
  let totalCategoryShifts = 0;
  for (const item of items) {
    const scope = benchmarkScope(item);
    const oldCategory = paceCategorySql(item.oldAlienSec);
    const newCategory = paceCategorySql(item.newAlienSec);
    const rows = db.prepare(`WITH scope AS (
        SELECT s.id session_id,s.session_name,s.session_type,s.timestamp,s.rowid session_order,d.driver_ordinal,coalesce(n.name,'') driver_name
        FROM sessions s JOIN session_drivers d ON d.session_id=s.id AND d.is_player_driver=1
        LEFT JOIN drivers n ON n.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
        WHERE ${scope.sql}
      ), rated AS (
        SELECT scope.*,l.lap_num lap_number,l.lap_ordinal,l.lap_time,${oldCategory} old_category,${newCategory} new_category
        FROM scope JOIN session_laps l ON l.session_id=scope.session_id AND l.driver_ordinal=scope.driver_ordinal
        WHERE l.is_valid=1 AND l.lap_time>0
      ), stats AS (
        SELECT (SELECT count(DISTINCT session_id) FROM scope) affected_sessions,count(*) affected_laps,
          sum(CASE WHEN old_category<>new_category THEN 1 ELSE 0 END) category_shifts_count FROM rated
      ), samples AS (
        SELECT * FROM rated WHERE old_category<>new_category
        ORDER BY timestamp ASC,session_order ASC,driver_ordinal ASC,lap_ordinal ASC LIMIT ?
      )
      SELECT stats.*,samples.session_id,samples.session_name,samples.session_type,samples.driver_name,samples.lap_number,
        samples.lap_time,samples.old_category,samples.new_category
      FROM stats LEFT JOIN samples ON 1=1
      ORDER BY samples.timestamp ASC,samples.session_order ASC,samples.driver_ordinal ASC,samples.lap_ordinal ASC`)
      .all(...scope.values, MAX_STORED_SAMPLE_SHIFTS) as CompactImpactLap[];
    const stats = rows[0];
    const categoryShifts = rows.filter(row => row.session_id !== null).map(row => ({
      driverName: row.driver_name || 'Driver', lapTimeSec: row.lap_time ?? 0, lapTimeString: formatTime(row.lap_time ?? 0),
      sessionId: row.session_id ?? '', sessionName: row.session_name || row.session_type || 'Session',
      lapNumber: row.lap_number ?? 0, oldCategory: row.old_category as PaceCategory, newCategory: row.new_category as PaceCategory,
    }));
    item.impact = { affectedSessionsCount: stats?.affected_sessions ?? 0, affectedLapsCount: stats?.affected_laps ?? 0,
      categoryShiftsCount: stats?.category_shifts_count ?? 0, categoryShifts };
    totalCategoryShifts += item.impact.categoryShiftsCount;
  }
  let totalAffectedSessions = 0;
  if (items.length) {
    const tracks = items.map(benchmarkTrackScope);
    const classes = items.map(item => sqlCarClassMatch(item.carClass));
    const where = tracks.map((track, index) => `(${track.sql} AND EXISTS (
      SELECT 1 FROM session_drivers d LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id WHERE d.session_id=s.id AND d.is_player_driver=1 AND ${classes[index].sql}
    ))`).join(' OR ');
    const values = tracks.flatMap((track, index) => [...track.values, ...classes[index].values]);
    totalAffectedSessions = (db.prepare(`SELECT count(*) affected FROM sessions s WHERE ${where}`).get(...values) as { affected: number }).affected;
  }
  return { ...diff, totalAffectedSessions, totalCategoryShifts, impactRule: BENCHMARK_IMPACT_RULE };
}
