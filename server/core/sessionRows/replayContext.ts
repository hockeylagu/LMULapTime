import type { Database } from 'better-sqlite3';
import type { ReplayContextDriver, ReplaySessionContext, ReplayTimingLap } from '../../replay/replayServiceTypes.js';
import { unpackFields, type Row } from './fields.js';
import { recordingLink } from './reader.js';
import { DRIVER_DICTIONARY_FIELDS, DRIVER_FIELDS, LAP_FIELDS } from './specs.js';

const driverFields = [...DRIVER_DICTIONARY_FIELDS, ...DRIVER_FIELDS].filter(field =>
  ['name', 'driverName', 'carType', 'carClass', 'bestLapTime', 'isPlayer'].includes(field.prop));
const lapFields = LAP_FIELDS.filter(field => ['lapNum', 'lapTime', 's1', 's2', 's3',
  'isValid', 'isPitStop', 'isOutLap', 'nonRepresentativeReason'].includes(field.prop));

/**
 * Read a replay's session context. Metadata needs every lap's compact timing/ordinal fields;
 * a trajectory needs the requested driver's history plus the player's metadata, and traffic needs no laps.
 */
export function readReplaySessionContext(
  db: Database, requestedId: string, laps: 'all' | 'none' | number,
): ReplaySessionContext | null {
  const id = requestedId;
  const row = db.prepare(`SELECT id,track_venue,track_course,track_length_meters,session_type,total_laps_count,
    player_driver_ordinal,has_duckdb_telemetry,duckdb_filename FROM sessions WHERE id=?`).get(id) as Row | undefined;
  if (!row) return null;
  const drivers = (db.prepare(`SELECT d.driver_ordinal,d.driver_name,d.best_lap_time,d.is_player,
      n.name,v.car_type,v.car_class
    FROM session_drivers d LEFT JOIN drivers n ON n.driver_id=d.driver_id
    LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id WHERE d.session_id=? ORDER BY d.driver_ordinal`)
    .all(id) as Row[]).map(driver => ({
      ...unpackFields(driver, driverFields), driverOrdinal: driver.driver_ordinal, laps: [],
    } as unknown as ReplayContextDriver));
  const playerOrdinal = typeof row.player_driver_ordinal === 'number' ? row.player_driver_ordinal : undefined;
  const playerDriver = playerOrdinal === undefined ? undefined : drivers.find(driver => driver.driverOrdinal === playerOrdinal);
  if (laps !== 'none' && drivers.length) {
    const ordinals = laps === 'all' ? null : [...new Set([laps, ...(playerDriver ? [playerDriver.driverOrdinal] : [])])];
    const lapRows = db.prepare(`SELECT driver_ordinal,lap_ordinal,${lapFields.map(field => field.col).join(',')}
      FROM session_laps WHERE session_id=? ${ordinals ? 'AND driver_ordinal IN (SELECT value FROM json_each(?))' : ''}
      ORDER BY driver_ordinal,lap_ordinal`).all(...(ordinals ? [id, JSON.stringify(ordinals)] : [id])) as Row[];
    const byOrdinal = new Map(drivers.map(driver => [driver.driverOrdinal, driver]));
    for (const lap of lapRows) byOrdinal.get(lap.driver_ordinal as number)?.laps.push({
      ...unpackFields(lap, lapFields), lapOrdinal: lap.lap_ordinal,
    } as ReplayTimingLap);
  }
  const recording = db.prepare('SELECT * FROM session_recordings WHERE session_id=?').get(id) as Row | undefined;
  return {
    id, trackVenue: row.track_venue as string, trackCourse: row.track_course as string,
    trackLengthMeters: row.track_length_meters as number | null, sessionType: row.session_type as ReplaySessionContext['sessionType'],
    totalLapsCount: row.total_laps_count as number, drivers, playerDriver,
    matchingReplayFile: recording ? recordingLink(recording, row) as ReplaySessionContext['matchingReplayFile'] : undefined,
  };
}
