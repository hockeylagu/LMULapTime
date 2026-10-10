import type { Database } from 'better-sqlite3';
import type { SessionProgressionPoint } from '../../../shared/types/index.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { computeTheoreticalBest, computeTheoreticalGap, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { normalizeCarClass } from '../../../shared/domain/paceCategory.js';
import { rateSessionCard } from './readTimePace.js';
import { readSessionCards } from './cards.js';
import { SETTINGS_FIELDS } from '../sessionRows/specs.js';
import { group } from '../sessionRows/reader.js';

export interface SessionQuery {
  track?: string; car?: string; carClass?: string; driver?: string; sessionType?: string;
  hideEmpty?: boolean; hasReplay?: boolean; search?: string; sort?: string;
  page?: number; pageSize?: number; from?: number; to?: number;
  playerCar?: string;
}

/** All values are parameters; only fixed SQL fragments enter the query. */
export function sessionWhere(options: SessionQuery): { sql: string; values: (string | number)[] } {
  const parts: string[] = []; const values: (string | number)[] = [];
  if (options.track && options.track !== 'All') {
    const layout = getCircuitSpecification(options.track).layoutKey;
    if (Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, layout)) { parts.push('s.layout_key = ?'); values.push(layout); }
    else { parts.push('(s.track_venue = ? OR trim(s.track_venue || \' - \' || s.track_course) = ? OR s.track_venue || \' (\' || s.track_course || \')\' = ?)'); values.push(options.track, options.track, options.track); }
  }
  if (options.sessionType && options.sessionType !== 'All') {
    const kind = options.sessionType.toLowerCase().trim();
    const namePrefix = kind === 'practice' ? 'p%' : kind === 'qualifying' ? 'q%' : kind === 'race' ? 'r%' : `${kind}%`;
    const nameContains = kind === 'practice' ? '%practice%' : kind === 'qualifying' ? '%qual%' : kind === 'race' ? '%race%' : `%${kind}%`;
    const typeValues = kind === 'qualifying' ? ['qualifying','qualify'] : [kind];
    parts.push(`(lower(s.session_type) IN (${typeValues.map(() => '?').join(',')}) OR lower(s.session_name) LIKE ? OR lower(s.session_name) LIKE ?)`);
    values.push(...typeValues, namePrefix, nameContains);
  }
  if (options.hideEmpty) parts.push('s.is_empty = 0');
  if (options.hasReplay) parts.push('s.recording_name IS NOT NULL');
  if (options.carClass && options.carClass !== 'All') { parts.push('EXISTS (SELECT 1 FROM session_drivers f WHERE f.session_id=s.id AND f.driver_class=?)'); values.push(normalizeCarClass(options.carClass)); }
  if (options.car && options.car !== 'All') { parts.push('EXISTS (SELECT 1 FROM session_drivers f WHERE f.session_id=s.id AND f.vehicle_id IN (SELECT vehicle_id FROM vehicles WHERE instr(lower(car_type),lower(?))>0))'); values.push(options.car); }
  if (options.playerCar && options.playerCar !== 'All') { parts.push('s.player_car_type=?'); values.push(options.playerCar); }
  if (options.driver && options.driver !== 'All') { parts.push('EXISTS (SELECT 1 FROM session_drivers f WHERE f.session_id=s.id AND f.driver_id IN (SELECT driver_id FROM drivers WHERE instr(lower(name),lower(?))>0))'); values.push(options.driver); }
  if (options.search?.trim()) {
    parts.push(`(instr(lower(s.track_venue),lower(?))>0 OR instr(lower(s.track_course),lower(?))>0 OR instr(lower(s.filename),lower(?))>0
      OR instr(lower(coalesce(s.player_car_type,'')),lower(?))>0 OR instr(lower(coalesce(s.player_driver_name,'')),lower(?))>0
      OR instr(lower(s.session_type),lower(?))>0 OR instr(lower(s.session_name),lower(?))>0
      OR instr(lower(coalesce(s.weather_info,'')),lower(?))>0)`);
    values.push(...Array<string>(8).fill(options.search.trim()));
  }
  if (options.from !== undefined && Number.isFinite(options.from)) { parts.push('s.timestamp >= ?'); values.push(options.from); }
  if (options.to !== undefined && Number.isFinite(options.to)) { parts.push('s.timestamp <= ?'); values.push(options.to); }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
}

export function querySessionPage(db: Database, options: SessionQuery) {
  const page = Math.max(1, options.page ?? 1); const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const where = sessionWhere(options);
  const targets: Array<{ layout_key: string; car_class: string; target100_sec: number }> = [];
  if (options.sort === 'pace-asc' || options.sort === 'pace-desc') {
    const refs = db.prepare('SELECT track_name,car_class,data_json FROM reference_laptimes ORDER BY track_name,car_class').all() as Array<{ track_name: string; car_class: string; data_json: string }>;
    for (const ref of refs) {
      const layoutKey = getCircuitSpecification(ref.track_name).layoutKey;
      const entry = JSON.parse(ref.data_json) as { target100Sec?: number };
      if (layoutKey !== 'unknown' && entry.target100Sec && entry.target100Sec > 0) {
        targets.push({ layout_key: layoutKey, car_class: normalizeCarClass(ref.car_class), target100_sec: entry.target100Sec });
      }
    }
  }
  const paceSort = options.sort === 'pace-asc' || options.sort === 'pace-desc';
  const targetCte = targets.length ? `WITH benchmark_targets(layout_key,car_class,target100_sec) AS (VALUES ${targets.map(() => '(?,?,?)').join(',')})` : paceSort ? 'WITH benchmark_targets(layout_key,car_class,target100_sec) AS (SELECT NULL,NULL,NULL WHERE 0)' : '';
  const targetValues = targets.flatMap(target => [target.layout_key, target.car_class, target.target100_sec]);
  const paceJoin = paceSort ? `LEFT JOIN session_drivers pace_driver ON pace_driver.session_id=s.id AND pace_driver.is_player_driver=1
    LEFT JOIN benchmark_targets bt ON bt.layout_key=s.layout_key AND bt.car_class=pace_driver.driver_class` : '';
  const positionJoin = options.sort === 'pos-asc' ? 'LEFT JOIN session_drivers player_row ON player_row.session_id=s.id AND player_row.driver_ordinal=s.player_driver_ordinal' : '';
  const paceExpr = "CASE WHEN pace_driver.best_lap_is_wet=0 AND pace_driver.best_lap_time>0 AND bt.target100_sec>0 THEN pace_driver.best_lap_time*100.0/bt.target100_sec END";
  const order = options.sort === 'date-asc' ? 's.timestamp ASC,s.id ASC' : options.sort === 'pos-asc'
    ? "coalesce(player_row.position,9999) ASC,s.timestamp DESC,s.id DESC"
    : options.sort === 'lap-asc' ? "coalesce(s.player_best_lap_time,999999999) ASC,s.timestamp DESC,s.id DESC" : 's.timestamp DESC,s.id DESC';
  const finalOrder = paceSort ? `${paceExpr} IS NULL ASC,${paceExpr} ${options.sort === 'pace-asc' ? 'ASC' : 'DESC'},s.timestamp DESC,s.id DESC` : order;
  return db.transaction(() => {
    const total = (db.prepare(`SELECT count(*) n FROM sessions s ${where.sql}`).get(...where.values) as { n: number }).n;
    const rows = db.prepare(`${targetCte} SELECT s.id FROM sessions s ${paceJoin} ${positionJoin} ${where.sql} ORDER BY ${finalOrder} LIMIT ? OFFSET ?`)
      .all(...targetValues,...where.values,pageSize,(page-1)*pageSize) as Array<{id: string}>;
    return { sessions: readSessionCards(db, rows.map(row => row.id)).map(rateSessionCard), total, page, pageSize };
  })();
}

interface ProgressionRow {
  id: string; timestamp: number; track_venue: string; track_course: string; session_type: string; session_name: string;
  time_string: string; driver_name: string; car_type: string; car_class: string; declared_laps_count:number; clean_laps_count: number;
  best_lap_time: number|null; best_s1: number|null; best_s2: number|null; best_s3: number|null;
  average_lap_time: number|null; top_three_average: number|null; consistency_score: number|null;
  weather_info: string|null; has_lap_rows:number;
}

/** Explicitly paginated raw points: clients must request more, rather than assume a truncated history is complete. */
export function queryProgression(db: Database, options: SessionQuery) {
  const where = sessionWhere({...options,driver:undefined});
  const pageSize = Math.min(500, Math.max(1, options.pageSize ?? 200)); const page = Math.max(1, options.page ?? 1);
  const driver = options.driver && options.driver !== 'All' ? options.driver.toLowerCase() : null;
  const join = `LEFT JOIN session_drivers d ON d.session_id=s.id AND d.driver_ordinal=coalesce(
    (SELECT x.driver_ordinal FROM session_drivers x JOIN drivers xn ON xn.driver_id=x.driver_id WHERE x.session_id=s.id AND lower(xn.name)=? ORDER BY x.driver_ordinal LIMIT 1),
    CASE WHEN ? IS NULL THEN s.primary_driver_ordinal ELSE 0 END)
    LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id`;
  const total = (db.prepare(`SELECT count(*) n FROM sessions s ${join} ${where.sql}`).get(driver,driver,...where.values) as {n:number}).n;
  const rows = db.prepare(`SELECT s.id,s.timestamp,s.track_venue,s.track_course,s.session_type,s.session_name,
    a.time_string,s.weather_info,${SETTINGS_FIELDS.map(field => `s.${field.col}`).join(',')},
    dn.name driver_name,v.car_type,d.driver_class car_class,coalesce(d.laps_count,0) declared_laps_count,d.clean_laps_count,
    d.best_lap_time,d.best_s1,d.best_s2,d.best_s3,d.clean_average_lap_time average_lap_time,d.top_three_average,d.consistency_score,
    EXISTS(SELECT 1 FROM session_laps l WHERE l.session_id=s.id AND l.driver_ordinal=d.driver_ordinal) has_lap_rows
    FROM sessions s ${join} JOIN session_summary_facts a ON a.session_id=s.id ${where.sql}
    ORDER BY s.timestamp ASC,s.id ASC LIMIT ? OFFSET ?`).all(driver,driver,...where.values,pageSize,(page-1)*pageSize) as Array<ProgressionRow & Record<string, unknown>>;
  const points: SessionProgressionPoint[] = rows.map(r => {
    const theoreticalBest=computeTheoreticalBest(r.best_s1,r.best_s2,r.best_s3);
    return {sessionId:r.id,timestamp:r.timestamp,dateString:r.time_string,sessionType:r.session_type,sessionName:r.session_name,
      trackVenue:r.track_venue,trackCourse:r.track_course,displayTrack:getDisplayTrackName(r.track_venue,r.track_course),
      weatherInfo:r.weather_info ?? undefined, settings:group(r,SETTINGS_FIELDS) as SessionProgressionPoint['settings'] | undefined,
      carType:r.car_type || 'Unknown Car',carClass:r.car_class || 'General',driverName:r.driver_name || 'Unknown',bestLapTime:r.best_lap_time ?? null,bestS1:r.best_s1 ?? null,bestS2:r.best_s2 ?? null,bestS3:r.best_s3 ?? null,
      theoreticalBest,theoreticalGap:computeTheoreticalGap(r.best_lap_time,theoreticalBest),cleanLapsCount:r.clean_laps_count ?? 0,
      totalLapsCount:r.declared_laps_count ?? 0,avgLapTime:r.has_lap_rows ? r.average_lap_time : null,top3AvgLapTime:r.top_three_average ?? null,consistencyScore:r.consistency_score ?? null};
  });
  return {points,total,page,pageSize};
}
