import { Database as DatabaseType } from 'better-sqlite3';
import { passFromRow, type CornerPassRow } from './dbCornerPassStore.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';

/** One counted official turn pass of a car of the class at the layout, with its driver and lap. */
export interface AnalysisPassRow {
  sessionId: string;
  driverOrdinal: number;
  driverName: string;
  /** The session's car name for the driver, null when unknown. */
  carType: string | null;
  isPlayer: boolean;
  lapOrdinal: number;
  /** The driver's true pace in the session (s), for a target candidate; null for the player's rows. */
  paceSec: number | null;
  pass: CornerPass;
}

/** A session's layout and its player: whose laps, in which class and car, and when. */
export interface AnalysisSessionRow {
  sessionId: string;
  timestamp: number;
  sessionType: string;
  layoutKey: string;
  driverOrdinal: number;
  carClass: string;
  /** The player's car name, null when unknown. */
  carType: string | null;
  /** The player's fastest clean dry laps of the session, up to 3: how many, and their times added up (s); 0 without any. */
  fastestCount: number;
  fastestSumSec: number;
}

const SESSION_COLUMNS = `s.id sessionId, s.timestamp, s.session_type sessionType, s.layout_key layoutKey, d.driver_ordinal driverOrdinal,
  d.driver_class carClass, v.car_type carType, COALESCE(t.fastest_three_count, 0) fastestCount, COALESCE(t.fastest_three_time_sum, 0) fastestSumSec
  FROM sessions s JOIN session_drivers d ON d.session_id = s.id AND d.is_player = 1
  LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
  LEFT JOIN session_driver_condition_summaries t ON t.session_id = s.id AND t.driver_ordinal = d.driver_ordinal AND t.condition_group = 'dry'`;

export function getAnalysisSession(db: DatabaseType, sessionId: string): AnalysisSessionRow | null {
  return (db.prepare(`SELECT ${SESSION_COLUMNS} WHERE s.id = ?`).get(sessionId) as AnalysisSessionRow | undefined) ?? null;
}

/** The player's sessions of the class at the layout, oldest first: the habit history's sessions. */
export function listAnalysisSessions(db: DatabaseType, layoutKey: string, carClass: string): AnalysisSessionRow[] {
  return db.prepare(`SELECT ${SESSION_COLUMNS} WHERE s.layout_key = ? AND d.driver_class = ? ORDER BY s.timestamp, s.id`)
    .all(layoutKey, carClass) as AnalysisSessionRow[];
}

/** Which counted turn passes to read: the class at the layout, from current turn builds only (`layoutPassKey`). */
export interface AnalysisPassScope {
  layoutKey: string;
  carClass: string;
  buildPrefix: string;
  /** The analysed sessions. */
  sessionIds: readonly string[];
}

/**
 * The best true paces read as target candidates: the first with a usual through enough corners is the target, so a
 * quick driver with a broken replay does not leave the layout without one.
 */
export const TARGET_CANDIDATES = 3;

/**
 * Counted laps follow the corner card's `lapCounts` (dry racing laps after the first); a car is its session driver
 * matched by name in the replay's roster. `$driverWhere` picks the cars, `$select` reads the laps (`lap`).
 */
const passQuery = (driverWhere: string, select: string) => `
    WITH car AS MATERIALIZED (
      SELECT s.id session_id, d.driver_ordinal, d.is_player, n.name driver_name, v.car_type, rec.recording_name filename, r.driver_slot slot
      FROM sessions s
      JOIN session_drivers d ON d.session_id = s.id AND d.driver_class = $carClass
      JOIN drivers n ON n.driver_id = d.driver_id
      LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
      JOIN session_recordings rec ON rec.session_id = s.id
      JOIN replay_corner_pass_builds b ON b.filename = rec.recording_name
      JOIN replay_driver_roster r ON r.filename = rec.recording_name AND r.driver_name = n.normalized_name
      WHERE s.layout_key = $layoutKey AND substr(b.version_key, 1, length($buildPrefix) + 1) = $buildPrefix || '|' AND ${driverWhere}
    ),
    lap AS MATERIALIZED (
      SELECT c.*, sl.lap_number, sl.lap_ordinal, sl.lap_time
      FROM car c
      JOIN session_laps sl ON sl.session_id = c.session_id AND sl.driver_ordinal = c.driver_ordinal AND sl.lap_number > 1
      WHERE COALESCE(sl.is_valid, 1) = 1 AND COALESCE(sl.is_pit_stop, 0) = 0 AND COALESCE(sl.is_out_lap, 0) = 0
        AND COALESCE(sl.non_representative_reason, '') NOT IN ('contact', 'offPace') AND COALESCE(sl.condition_group, 'dry') = 'dry'
    )
    ${select}`;

/** The passes of the laps in `from` (`lap l`, or the laps joined to a shortlist), with the driver's true pace from `pace`. */
const passes = (from: string, pace = 'NULL') => `SELECT l.session_id sessionId, l.driver_ordinal driverOrdinal, l.driver_name driverName, l.car_type carType,
      l.is_player isPlayer, l.lap_ordinal lapOrdinal, ${pace} paceSec, p.*
    FROM ${from}
    JOIN replay_corner_passes p ON p.filename = l.filename AND p.driver_slot = l.slot AND p.lap_number = l.lap_number`;

/**
 * The shortlist's laps, the shortlist first (CROSS JOIN keeps SQLite's order): joined from the laps, SQLite read every
 * candidate's passes before dropping the drivers left out (Daytona GT3, 2026-11-20: 46 -> 29 ms, the same rows).
 */
export const SHORTLIST_LAPS = 'pick k CROSS JOIN lap l ON l.session_id = k.session_id AND l.driver_ordinal = k.driver_ordinal';

const IN_SESSIONS = 's.id IN (SELECT value FROM json_each($sessionIds))';
const OTHER_HUMANS = 'd.is_player = 0 AND d.is_human = 1';

/** The target candidates of the cars in `lap`: each with at least `$minLaps` counted laps and a true pace over 3 laps. */
const PACED = `paced AS (
      SELECT l.session_id, l.driver_ordinal, l.car_type, t.fastest_three_time_sum / 3.0 pace
      FROM lap l
      JOIN session_driver_condition_summaries t ON t.session_id = l.session_id AND t.driver_ordinal = l.driver_ordinal
        AND t.condition_group = 'dry' AND t.fastest_three_count = 3
      GROUP BY l.session_id, l.driver_ordinal HAVING COUNT(DISTINCT l.lap_number) >= $minLaps
    )`;

function passRows(db: DatabaseType, sql: string, params: Record<string, unknown>): AnalysisPassRow[] {
  const rows = db.prepare(sql).all(params) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    sessionId: row.sessionId as string, driverOrdinal: row.driverOrdinal as number, driverName: row.driverName as string, carType: (row.carType as string | null) ?? null,
    isPlayer: row.isPlayer === 1, lapOrdinal: row.lapOrdinal as number, paceSec: (row.paceSec as number | null) ?? null, pass: passFromRow(row as CornerPassRow),
  }));
}

/** The player's counted turn passes in the analysed sessions. */
export function listPlayerAnalysisPasses(db: DatabaseType, scope: AnalysisPassScope): AnalysisPassRow[] {
  const { layoutKey, carClass, buildPrefix, sessionIds } = scope;
  return passRows(db, passQuery(`d.is_player = 1 AND ${IN_SESSIONS}`, passes('lap l')), { layoutKey, carClass, buildPrefix, sessionIds: JSON.stringify(sessionIds) });
}

/**
 * The counted turn passes of the layout's target candidates, the same for every session (driver, 2026-11-20: one
 * fixed target per layout and class, so sessions compare). Other human drivers of the class with at least `minLaps`
 * counted laps, by true pace (the leaderboard's: the average of the 3 fastest clean dry laps of the session): the
 * TARGET_CANDIDATES best overall, and the best in each car for the same-car check. Each row carries that pace.
 */
export function listReferenceAnalysisPasses(db: DatabaseType, scope: Omit<AnalysisPassScope, 'sessionIds'>, minLaps: number): AnalysisPassRow[] {
  const { layoutKey, carClass, buildPrefix } = scope;
  return passRows(db, passQuery(OTHER_HUMANS, `, ${PACED},
    pick AS (
      SELECT session_id, driver_ordinal, pace FROM (
        SELECT session_id, driver_ordinal, pace, ROW_NUMBER() OVER (ORDER BY pace, session_id, driver_ordinal) overall,
          ROW_NUMBER() OVER (PARTITION BY car_type ORDER BY pace, session_id, driver_ordinal) in_car
        FROM paced
      ) WHERE overall <= $targets OR in_car = 1
    )
    ${passes(SHORTLIST_LAPS, 'k.pace')}`), { layoutKey, carClass, buildPrefix, minLaps, targets: TARGET_CANDIDATES });
}

