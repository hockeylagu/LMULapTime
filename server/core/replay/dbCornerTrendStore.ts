import { Database as DatabaseType } from 'better-sqlite3';
import type { PassKind } from './dbCornerPassStore.js';
import { SHORTLIST_LAPS } from './dbCornerAnalysisStore.js';

/** The class reference shortlist: the quickest drivers by usual lap time, overall and in each car. */
export const REFERENCE_OVERALL = 10;
export const REFERENCE_PER_CAR = 3;

/** Which stored passes a layout's corner trends read: the pass tables and the build they must come from. */
export interface CornerTrendScope {
  layoutKey: string;
  carClass: string;
  /** The player's car model (lower case), '' for any; the class reference reads every model. */
  carType: string;
  kind: PassKind;
  /** The start every current build's key shares (`layoutPassKey`). */
  buildPrefix: string;
  /** Sequences only: `|class:mapKey|`, the class's current map as a build key names it; '' for official turns. */
  mapMarker: string;
  /** Counted laps a reference candidate needs for a usual lap time (`minTrendPasses`). */
  minLaps: number;
}

/** One of the player's sessions of the class at the layout, and the pass build of its replay (null: none). */
export interface CornerTrendSessionRow {
  sessionId: string;
  timestamp: number;
  sessionType: string;
  sessionName: string;
  carType: string;
  filename: string | null;
  current: boolean;
}

/** A counted pass: a dry racing lap after the first, its session's flags (the corner card's `lapCounts`). */
export interface CornerTrendPassRow {
  sessionId: string;
  driverOrdinal: number;
  isPlayer: boolean;
  segment: number;
  durationMs: number;
}

const TABLES: Record<PassKind, { passes: string; builds: string }> = {
  turns: { passes: 'replay_corner_passes', builds: 'replay_corner_pass_builds' },
  sequences: { passes: 'replay_sequence_passes', builds: 'replay_sequence_pass_builds' },
};

const CURRENT_BUILD = `substr(b.version_key, 1, length($buildPrefix) + 1) = $buildPrefix || '|'
  AND ($mapMarker = '' OR instr(b.version_key || '|', $mapMarker) > 0)`;

const params = (scope: CornerTrendScope) => ({
  layoutKey: scope.layoutKey, carClass: scope.carClass, carType: scope.carType, buildPrefix: scope.buildPrefix, mapMarker: scope.mapMarker,
});

/** The player's sessions of the class (and model) at the layout, oldest first, with whether their passes are current. */
export function listCornerTrendSessions(db: DatabaseType, scope: CornerTrendScope): CornerTrendSessionRow[] {
  const rows = db.prepare(`
    SELECT s.id sessionId, s.timestamp, s.session_type sessionType, s.session_name sessionName, coalesce(v.car_type, '') carType,
      rec.recording_name filename, b.version_key IS NOT NULL AND ${CURRENT_BUILD} current
    FROM sessions s
    JOIN session_drivers d ON d.session_id = s.id AND d.is_player = 1 AND d.driver_class = $carClass
    LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
    LEFT JOIN session_recordings rec ON rec.session_id = s.id
    LEFT JOIN ${TABLES[scope.kind].builds} b ON b.filename = rec.recording_name
    WHERE s.layout_key = $layoutKey AND ($carType = '' OR d.vehicle_id IN (SELECT vehicle_id FROM vehicles WHERE car_model = $carType))
    ORDER BY s.timestamp, s.id
  `).all(params(scope)) as Array<Omit<CornerTrendSessionRow, 'current'> & { current: number | null }>;
  return rows.map(row => ({ ...row, current: row.current === 1 }));
}

/**
 * The counted passes of the class at the layout, from current builds only: the player's (of the model, when one is
 * picked) and the class reference candidates': other human drivers (any model), shortlisted by usual (median) lap time
 * over at least `minLaps` counted laps (REFERENCE_OVERALL quickest, REFERENCE_PER_CAR
 * per car; driver, 2026-11-20: lap time is good enough. Against every driver, 440 of 465 corner references stayed,
 * the rest slower by a median 0.02 s, at most 0.08 s). A car is its session driver
 * matched by name in the replay's roster, as the sequence maps match them.
 */
export function listCornerTrendPasses(db: DatabaseType, scope: CornerTrendScope): CornerTrendPassRow[] {
  const { passes, builds } = TABLES[scope.kind];
  const rows = db.prepare(`
    WITH car AS MATERIALIZED (
      SELECT s.id session_id, d.driver_ordinal, d.is_player, v.car_type, rec.recording_name filename, r.driver_slot slot
      FROM sessions s
      JOIN session_drivers d ON d.session_id = s.id AND d.driver_class = $carClass
      LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
      JOIN drivers n ON n.driver_id = d.driver_id
      JOIN session_recordings rec ON rec.session_id = s.id
      JOIN ${builds} b ON b.filename = rec.recording_name
      JOIN replay_driver_roster r ON r.filename = rec.recording_name AND r.driver_name = n.normalized_name
      WHERE s.layout_key = $layoutKey AND ${CURRENT_BUILD}
        AND CASE WHEN d.is_player = 1 THEN $carType = '' OR d.vehicle_id IN (SELECT vehicle_id FROM vehicles WHERE car_model = $carType) ELSE d.is_human = 1 END
    ),
    -- The counted laps first, once per lap: read per pass, the lap flags took 3.5 times as long (Le Mans, 2026-11-19).
    lap AS MATERIALIZED (
      SELECT c.session_id, c.driver_ordinal, c.is_player, c.car_type, c.filename, c.slot, sl.lap_number, sl.lap_time
      FROM car c
      JOIN session_laps sl ON sl.session_id = c.session_id AND sl.driver_ordinal = c.driver_ordinal AND sl.lap_number > 1
      WHERE COALESCE(sl.is_valid, 1) = 1 AND COALESCE(sl.is_pit_stop, 0) = 0 AND COALESCE(sl.is_out_lap, 0) = 0
        AND COALESCE(sl.non_representative_reason, '') NOT IN ('contact', 'offPace') AND COALESCE(sl.condition_group, 'dry') = 'dry'
    ),
    ranked AS (
      SELECT session_id, driver_ordinal, car_type, lap_time,
        ROW_NUMBER() OVER (PARTITION BY session_id, driver_ordinal ORDER BY lap_time) rn, COUNT(*) OVER (PARTITION BY session_id, driver_ordinal) n
      FROM lap WHERE is_player = 0 AND lap_time > 0
    ),
    usual AS (
      SELECT session_id, driver_ordinal, car_type, AVG(lap_time) usual_time FROM ranked
      WHERE n >= $minLaps AND rn IN ((n + 1) / 2, (n + 2) / 2) GROUP BY session_id, driver_ordinal
    ),
    pick AS (
      SELECT session_id, driver_ordinal FROM (
        SELECT session_id, driver_ordinal, ROW_NUMBER() OVER (ORDER BY usual_time, session_id, driver_ordinal) overall,
          ROW_NUMBER() OVER (PARTITION BY car_type ORDER BY usual_time, session_id, driver_ordinal) in_car
        FROM usual
      ) WHERE overall <= $overall OR in_car <= $perCar
      UNION ALL SELECT session_id, driver_ordinal FROM car WHERE is_player = 1
    )
    SELECT l.session_id sessionId, l.driver_ordinal driverOrdinal, l.is_player isPlayer, p.segment, p.duration_ms durationMs
    FROM ${SHORTLIST_LAPS}
    JOIN ${passes} p ON p.filename = l.filename AND p.driver_slot = l.slot AND p.lap_number = l.lap_number
  `).all({ ...params(scope), minLaps: scope.minLaps, overall: REFERENCE_OVERALL, perCar: REFERENCE_PER_CAR }) as Array<Omit<CornerTrendPassRow, 'isPlayer'> & { isPlayer: number }>;
  return rows.map(row => ({ ...row, isPlayer: row.isPlayer === 1 }));
}
