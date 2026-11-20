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
}

const SESSION_COLUMNS = `s.id sessionId, s.timestamp, s.session_type sessionType, s.layout_key layoutKey, d.driver_ordinal driverOrdinal,
  d.driver_class carClass, v.car_type carType
  FROM sessions s JOIN session_drivers d ON d.session_id = s.id AND d.is_player = 1
  LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id`;

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

/** The reference shortlist: the quickest drivers by usual lap time, overall and in each car. */
export const REFERENCE_OVERALL = 10;
export const REFERENCE_PER_CAR = 3;

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
      JOIN replay_driver_roster r ON r.filename = rec.recording_name AND LOWER(TRIM(r.driver_name)) = LOWER(TRIM(n.name))
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

const PASSES = `SELECT l.session_id sessionId, l.driver_ordinal driverOrdinal, l.driver_name driverName, l.car_type carType, l.is_player isPlayer,
      l.lap_ordinal lapOrdinal, p.*
    FROM lap l
    JOIN replay_corner_passes p ON p.filename = l.filename AND p.driver_slot = l.slot AND p.lap_number = l.lap_number`;

const IN_SESSIONS = 's.id IN (SELECT value FROM json_each($sessionIds))';

function passRows(db: DatabaseType, sql: string, scope: AnalysisPassScope, extra: Record<string, unknown> = {}): AnalysisPassRow[] {
  const { layoutKey, carClass, buildPrefix, sessionIds } = scope;
  const rows = db.prepare(sql).all({ sessionIds: JSON.stringify(sessionIds), layoutKey, carClass, buildPrefix, ...extra }) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    sessionId: row.sessionId as string, driverOrdinal: row.driverOrdinal as number, driverName: row.driverName as string, carType: (row.carType as string | null) ?? null,
    isPlayer: row.isPlayer === 1, lapOrdinal: row.lapOrdinal as number, pass: passFromRow(row as CornerPassRow),
  }));
}

/** The player's counted turn passes in the analysed sessions. */
export function listPlayerAnalysisPasses(db: DatabaseType, scope: AnalysisPassScope): AnalysisPassRow[] {
  return passRows(db, passQuery(`d.is_player = 1 AND ${IN_SESSIONS}`, PASSES), scope);
}

/**
 * The reference candidates' counted turn passes: other human drivers of the class at the layout, shortlisted by
 * overall lap time, not corner by corner (driver, 2026-11-20): the REFERENCE_OVERALL quickest by usual (median) lap
 * over at least `minLaps` counted laps, the REFERENCE_PER_CAR quickest in each car, and everyone in the analysed
 * sessions (the engine prefers a reference from the session). Reading every driver took most of the corner trends' time.
 */
export function listReferenceAnalysisPasses(db: DatabaseType, scope: AnalysisPassScope, minLaps: number): AnalysisPassRow[] {
  return passRows(db, passQuery('d.is_player = 0 AND d.is_human = 1', `,
    ranked AS (
      SELECT session_id, driver_ordinal, car_type, lap_time,
        ROW_NUMBER() OVER (PARTITION BY session_id, driver_ordinal ORDER BY lap_time) rn, COUNT(*) OVER (PARTITION BY session_id, driver_ordinal) n
      FROM lap WHERE lap_time > 0
    ),
    usual AS (
      SELECT session_id, driver_ordinal, car_type, AVG(lap_time) usual_time FROM ranked
      WHERE n >= $minLaps AND rn IN ((n + 1) / 2, (n + 2) / 2) GROUP BY session_id, driver_ordinal
    ),
    pick AS (
      SELECT session_id, driver_ordinal FROM (
        SELECT session_id, driver_ordinal, ROW_NUMBER() OVER (ORDER BY usual_time) overall,
          ROW_NUMBER() OVER (PARTITION BY car_type ORDER BY usual_time) in_car
        FROM usual
      ) WHERE overall <= $overall OR in_car <= $perCar
      UNION SELECT session_id, driver_ordinal FROM car WHERE session_id IN (SELECT value FROM json_each($sessionIds))
    )
    ${PASSES}
    JOIN pick k ON k.session_id = l.session_id AND k.driver_ordinal = l.driver_ordinal`),
  scope, { minLaps, overall: REFERENCE_OVERALL, perCar: REFERENCE_PER_CAR });
}
