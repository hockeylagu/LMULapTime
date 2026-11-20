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

/**
 * The counted turn passes for corner analyses, from current turn builds only (`buildPrefix`, as `layoutPassKey`
 * names them): the player's in the analysed sessions, and every other human driver's of the class in
 * any session at the layout (the reference candidates). Counted laps follow the corner card's `lapCounts` (dry racing
 * laps after the first); a car is its session driver matched by name in the replay's roster.
 */
export function listAnalysisPasses(db: DatabaseType, playerSessionIds: readonly string[], layoutKey: string, carClass: string, buildPrefix: string): AnalysisPassRow[] {
  const rows = db.prepare(`
    WITH car AS MATERIALIZED (
      SELECT s.id session_id, d.driver_ordinal, d.is_player, n.name driver_name, v.car_type, rec.recording_name filename, r.driver_slot slot
      FROM sessions s
      JOIN session_drivers d ON d.session_id = s.id AND d.driver_class = $carClass
      JOIN drivers n ON n.driver_id = d.driver_id
      LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
      JOIN session_recordings rec ON rec.session_id = s.id
      JOIN replay_corner_pass_builds b ON b.filename = rec.recording_name
      JOIN replay_driver_roster r ON r.filename = rec.recording_name AND LOWER(TRIM(r.driver_name)) = LOWER(TRIM(n.name))
      WHERE s.layout_key = $layoutKey AND substr(b.version_key, 1, length($buildPrefix) + 1) = $buildPrefix || '|'
        AND CASE WHEN d.is_player = 1 THEN s.id IN (SELECT value FROM json_each($sessionIds)) ELSE d.is_human = 1 END
    ),
    lap AS MATERIALIZED (
      SELECT c.*, sl.lap_number, sl.lap_ordinal
      FROM car c
      JOIN session_laps sl ON sl.session_id = c.session_id AND sl.driver_ordinal = c.driver_ordinal AND sl.lap_number > 1
      WHERE COALESCE(sl.is_valid, 1) = 1 AND COALESCE(sl.is_pit_stop, 0) = 0 AND COALESCE(sl.is_out_lap, 0) = 0
        AND COALESCE(sl.non_representative_reason, '') NOT IN ('contact', 'offPace') AND COALESCE(sl.condition_group, 'dry') = 'dry'
    )
    SELECT l.session_id sessionId, l.driver_ordinal driverOrdinal, l.driver_name driverName, l.car_type carType, l.is_player isPlayer, l.lap_ordinal lapOrdinal, p.*
    FROM lap l
    JOIN replay_corner_passes p ON p.filename = l.filename AND p.driver_slot = l.slot AND p.lap_number = l.lap_number
  `).all({ sessionIds: JSON.stringify(playerSessionIds), layoutKey, carClass, buildPrefix }) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    sessionId: row.sessionId as string, driverOrdinal: row.driverOrdinal as number, driverName: row.driverName as string, carType: (row.carType as string | null) ?? null,
    isPlayer: row.isPlayer === 1, lapOrdinal: row.lapOrdinal as number, pass: passFromRow(row as CornerPassRow),
  }));
}
