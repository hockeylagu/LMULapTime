import type { Database as DatabaseType } from 'better-sqlite3';
import type { Leaderboard, LeaderboardEntry, LeaderboardLap, LeaderboardLayout, LeaderboardLayoutClass } from '../../../shared/types/leaderboard.js';
import type { ReferenceLaptimeEntry } from '../types.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { normalizeCarClass } from '../../../shared/domain/paceCategory.js';
import { findLayoutBenchmark, type LeaderboardQuery } from '../../../shared/domain/leaderboard.js';

interface SummaryRow {
  session_id: string; timestamp: number; session_type: string; session_name: string; recording_name: string | null;
  driver_ordinal: number; driver_name: string; is_player: number; car_type: string;
  lap_ordinal: number | null; lap_number: number | null; lap_time: number | null; s1: number | null; s2: number | null; s3: number | null;
}
interface DriverFact {
  driver_name: string; is_player: number; best_lap_time: number; best_timestamp: number; best_lap: LeaderboardLap;
  best_s1: number | null; best_s2: number | null; best_s3: number | null; top3_average: number | null;
  representative_laps: number; sessions: number; last_driven: number;
}
const scopeSql = `s.layout_key=? AND d.driver_class=? AND (?='' OR lower(trim(v.car_type))=?)`;

function rankValues<T>(items: T[], get: (item: T) => number | null): Array<number | null> {
  const sorted = items.map(get).filter((value): value is number => value !== null).sort((a, b) => a - b);
  return items.map(item => { const value = get(item); return value === null ? null : sorted.indexOf(value) + 1; });
}

function queryBoardDriverFacts(db: DatabaseType, query: LeaderboardQuery): DriverFact[] {
  const className = normalizeCarClass(query.carClass);
  const carType = query.carType?.trim().toLowerCase() ?? '';
  const params = [query.layoutKey, className, carType, carType];
  // The window sees one per-session best contribution, not every lap. It only exists to choose a
  // deterministic winning locator; all leaderboard aggregates come from compact condition rows.
  const bestRows = db.prepare(`WITH ranked AS (
      SELECT s.id session_id,s.timestamp,s.session_type,s.session_name,s.recording_name,
        d.driver_ordinal,coalesce(n.name,'') driver_name,d.is_player_driver is_player,coalesce(v.car_type,'') car_type,c.best_lap_ordinal lap_ordinal,
        l.lap_num lap_number,c.best_lap_time lap_time,l.s1,l.s2,l.s3,
        row_number() OVER (PARTITION BY coalesce(n.name,'') ORDER BY c.best_lap_time,s.timestamp,s.id,d.driver_ordinal,c.best_lap_ordinal) best_rank
      FROM session_driver_condition_summaries c JOIN session_drivers d
        ON d.session_id=c.session_id AND d.driver_ordinal=c.driver_ordinal
      LEFT JOIN drivers n ON n.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN sessions s ON s.id=d.session_id
      LEFT JOIN session_laps l ON l.session_id=c.session_id AND l.driver_ordinal=c.driver_ordinal AND l.lap_ordinal=c.best_lap_ordinal
      WHERE ${scopeSql} AND c.condition_group='dry' AND c.best_lap_time IS NOT NULL AND d.is_human=1
    ) SELECT * FROM ranked WHERE best_rank=1`).all(...params) as SummaryRow[];
  const facts = db.prepare(`WITH eligible AS (
      SELECT s.id,s.timestamp,d.driver_ordinal,coalesce(n.name,'') driver_name,d.is_player_driver is_player,c.clean_count,c.best_s1,c.best_s2,c.best_s3,
        c.fastest_three_count,c.fastest_three_time_sum,c.best_lap_time
      FROM session_driver_condition_summaries c JOIN session_drivers d
        ON d.session_id=c.session_id AND d.driver_ordinal=c.driver_ordinal
      LEFT JOIN drivers n ON n.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN sessions s ON s.id=d.session_id
      WHERE ${scopeSql} AND c.condition_group='dry' AND c.best_lap_time IS NOT NULL AND d.is_human=1
    ), top3 AS (
      SELECT driver_name,min(fastest_three_time_sum/3.0) average FROM eligible WHERE fastest_three_count=3 GROUP BY driver_name
    )
    SELECT e.driver_name,max(e.is_player) is_player,min(e.best_lap_time) best_lap_time,
      min(e.best_s1) best_s1,min(e.best_s2) best_s2,min(e.best_s3) best_s3,
      sum(e.clean_count) representative_laps,count(DISTINCT e.id) sessions,max(e.timestamp) last_driven,t.average top3_average
    FROM eligible e LEFT JOIN top3 t ON t.driver_name=e.driver_name GROUP BY e.driver_name ORDER BY min(e.timestamp),e.driver_name`)
    .all(...params) as Array<Omit<DriverFact, 'best_timestamp' | 'best_lap'>>;
  const bestByDriver = new Map<string, { timestamp: number; lap: LeaderboardLap }>();
  for (const row of bestRows) {
    if (row.lap_ordinal === null || row.lap_number === null || row.lap_time === null) continue;
    bestByDriver.set(row.driver_name, { timestamp: row.timestamp, lap: { sessionId: row.session_id, sessionName: row.session_name,
      sessionType: row.session_type, timestamp: row.timestamp, driverOrdinal: row.driver_ordinal, lapOrdinal: row.lap_ordinal,
      lapNum: row.lap_number, lapTime: row.lap_time, s1: row.s1, s2: row.s2, s3: row.s3, carType: row.car_type,
      telemetryAvailable: row.recording_name !== null } });
  }
  return facts.map(fact => {
    const best = bestByDriver.get(fact.driver_name);
    if (!best) throw new Error(`Missing best leaderboard lap for ${fact.driver_name}`);
    return { ...fact, best_timestamp: best.timestamp, best_lap: best.lap };
  });
}

function entriesFromFacts(facts: DriverFact[]): LeaderboardEntry[] {
  const ordered = facts.map(fact => ({ fact, best: fact.best_lap, bestS1: fact.best_s1, bestS2: fact.best_s2, bestS3: fact.best_s3,
    top3: fact.top3_average === null ? null : Number(fact.top3_average.toFixed(3)) }));
  ordered.sort((a, b) => a.best.lapTime - b.best.lapTime || a.best.timestamp - b.best.timestamp);
  const ranks = [rankValues(ordered, row => row.bestS1), rankValues(ordered, row => row.bestS2), rankValues(ordered, row => row.bestS3), rankValues(ordered, row => row.top3)];
  const leader = ordered[0]?.best.lapTime ?? 0;
  return ordered.map(({ fact, best, bestS1, bestS2, bestS3, top3 }, index) => ({ driverName: fact.driver_name, isPlayer: Boolean(fact.is_player),
    rank: index + 1, bestLap: best, bestS1, bestS2, bestS3, s1Rank: ranks[0][index], s2Rank: ranks[1][index], s3Rank: ranks[2][index],
    theoreticalBest: bestS1 !== null && bestS2 !== null && bestS3 !== null ? Number((bestS1 + bestS2 + bestS3).toFixed(3)) : null,
    top3Average: top3, top3AverageRank: ranks[3][index], gapToLeader: Number((best.lapTime - leader).toFixed(3)),
    representativeLaps: fact.representative_laps, sessions: fact.sessions, lastDriven: fact.last_driven }));
}

export function queryCompactLeaderboard(db: DatabaseType, query: LeaderboardQuery, benchmarks: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[] = []): Leaderboard {
  const carClass = normalizeCarClass(query.carClass);
  const carType = query.carType?.trim() || null;
  const entries = query.layoutKey === 'unknown' ? [] : entriesFromFacts(queryBoardDriverFacts(db, query));
  const spec = getCircuitSpecification(query.layoutKey);
  return { layoutKey: query.layoutKey, layoutName: spec.layoutName || spec.officialName, carClass,
    scope: carType ? 'car' : 'class', carType, entries, player: entries.find(entry => entry.isPlayer) ?? null,
    benchmark: findLayoutBenchmark(benchmarks, query.layoutKey, carClass) };
}

interface LayoutContribution {
  layout_key: string; track_venue: string; track_course: string; timestamp: number; session_order: number;
  driver_name: string; car_type: string; car_class: string; is_player: number; best_lap_time: number;
}
export function queryCompactLeaderboardLayouts(db: DatabaseType): LeaderboardLayout[] {
  const rows = db.prepare(`SELECT s.layout_key,s.track_venue,s.track_course,s.timestamp,s.rowid session_order,coalesce(n.name,'') driver_name,coalesce(v.car_type,'') car_type,d.driver_class car_class,d.is_player_driver is_player,c.best_lap_time
    FROM session_driver_condition_summaries c JOIN sessions s ON s.id=c.session_id
    JOIN session_drivers d ON d.session_id=c.session_id AND d.driver_ordinal=c.driver_ordinal
    LEFT JOIN drivers n ON n.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    WHERE s.layout_key<>'unknown' AND c.condition_group='dry' AND c.best_lap_time IS NOT NULL AND d.is_human=1
    ORDER BY s.timestamp ASC,session_order ASC,coalesce(n.name,'') ASC`).all() as LayoutContribution[];
  interface DriverSummary { best: number; isPlayer: boolean; last: number; lastCar: string; }
  interface ClassSummary { drivers: Map<string, DriverSummary>; playerLast: number; playerCar: string; }
  interface LayoutSummary { trackName: string; last: number; lastClass: string; classes: Map<string, ClassSummary>; }
  const layouts = new Map<string, LayoutSummary>();
  for (const row of rows) {
    let layout = layouts.get(row.layout_key);
    if (!layout) { layout = { trackName: '', last: 0, lastClass: '', classes: new Map() }; layouts.set(row.layout_key, layout); }
    let cls = layout.classes.get(row.car_class);
    if (!cls) { cls = { drivers: new Map(), playerLast: 0, playerCar: '' }; layout.classes.set(row.car_class, cls); }
    const driver = cls.drivers.get(row.driver_name);
    if (!driver) cls.drivers.set(row.driver_name, { best: row.best_lap_time, isPlayer: Boolean(row.is_player), last: row.timestamp, lastCar: row.car_type });
    else { driver.best = Math.min(driver.best, row.best_lap_time); driver.isPlayer ||= Boolean(row.is_player); driver.last = row.timestamp; driver.lastCar = row.car_type; }
    if (row.is_player) {
      cls.playerLast = row.timestamp; cls.playerCar = row.car_type;
      layout.last = row.timestamp; layout.lastClass = row.car_class;
      layout.trackName = getDisplayTrackName(row.track_venue, row.track_course);
    }
  }
  const result: LeaderboardLayout[] = [];
  for (const [layoutKey, layout] of layouts) {
    const classes: LeaderboardLayoutClass[] = [];
    for (const [carClass, cls] of layout.classes) {
      if (!cls.playerLast) continue;
      const drivers = [...cls.drivers.values()].sort((a, b) => a.best - b.best);
      const player = drivers.find(driver => driver.isPlayer);
      classes.push({ carClass, lastDriven: cls.playerLast, lastCarType: cls.playerCar,
        playerBest: player?.best ?? null, playerRank: player ? drivers.map(driver => driver.best).indexOf(player.best) + 1 : null,
        fieldSize: drivers.length });
    }
    if (!classes.length) continue;
    classes.sort((a, b) => b.lastDriven - a.lastDriven);
    const spec = getCircuitSpecification(layoutKey);
    result.push({ layoutKey, layoutName: spec.layoutName || spec.officialName, trackName: layout.trackName,
      circuitName: spec.officialName || layout.trackName, countryCode: spec.countryCode, flagEmoji: spec.flagEmoji,
      lastDriven: layout.last, lastCarClass: layout.lastClass, classes });
  }
  return result.sort((a, b) => b.lastDriven - a.lastDriven);
}

export function queryCompactPlayerSessionBests(db: DatabaseType, query: LeaderboardQuery): Array<{ sessionId: string; sessionName: string; timestamp: number; best: number }> {
  if (query.layoutKey === 'unknown') return [];
  const carType = query.carType?.trim().toLowerCase() ?? '';
  return db.prepare(`SELECT s.id sessionId,s.session_name sessionName,s.timestamp,c.best_lap_time best
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    JOIN session_driver_condition_summaries c ON c.session_id=d.session_id AND c.driver_ordinal=d.driver_ordinal
    WHERE s.layout_key=? AND d.driver_class=? AND d.is_player_driver=1 AND (?='' OR lower(trim(v.car_type))=?)
      AND c.condition_group='dry' AND c.best_lap_time IS NOT NULL
    ORDER BY s.timestamp ASC,s.id ASC`).all(query.layoutKey, normalizeCarClass(query.carClass), carType, carType) as Array<{ sessionId: string; sessionName: string; timestamp: number; best: number }>;
}
