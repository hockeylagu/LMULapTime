import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, DriverData, LapData } from '../types.js';
import type { TrafficGap, LapTraffic } from '../../../shared/types/raceTraffic.js';
import { anyPresent, unpackFields, type Field, type Row } from './fields.js';
import {
  BEST_SESSION_LAP_FIELDS, CONDITION_FIELDS, DRIVER_DICTIONARY_FIELDS, DRIVER_FIELDS, EVENT_LISTS, LAP_FIELDS, RECORDING_FIELDS,
  SESSION_FIELDS, SETTINGS_FIELDS, TIRE_WEAR_FIELDS, WEATHER_FIELDS,
} from './specs.js';

/** The `sessions` columns that make up a session's own scalars (no JSON). */
export const SESSION_SCALAR_COLUMNS = `id, filename, file_path, timestamp, track_venue, track_course, session_type, session_name, drivers_count,
  player_driver_ordinal, ${[...SESSION_FIELDS, ...WEATHER_FIELDS, ...SETTINGS_FIELDS, ...BEST_SESSION_LAP_FIELDS].map(field => field.col).join(', ')}`;

/** A driver row with its dictionary text: the columns of `session_drivers` plus name, car_type, car_class and team_name. */
export const DRIVER_WITH_DICTIONARIES = `SELECT d.*, n.name AS name, v.car_type AS car_type, v.car_class AS car_class, t.name AS team_name
  FROM session_drivers d LEFT JOIN drivers n ON n.driver_id = d.driver_id LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
  LEFT JOIN teams t ON t.team_id = d.team_id`;

/** The object a group of columns describes, or undefined when all of them are NULL. */
export function group(row: Row, fields: readonly Field[]): Row | undefined {
  return anyPresent(row, fields) ? unpackFields(row, fields) : undefined;
}

function gapOf(row: Row, prefix: string): TrafficGap | null {
  const name = row[`${prefix}_name`], carClass = row[`${prefix}_class`], same = row[`${prefix}_same_class`], gap = row[`${prefix}_gap_sec`];
  if ([name, carClass, same, gap].every(value => value === null || value === undefined)) return null;
  const car: Row = {};
  if (name !== null) car.name = name;
  if (carClass !== null) car.carClass = carClass;
  if (same !== null) car.sameClass = same !== 0;
  const result: Row = { car };
  if (gap !== null) result.gapSec = gap;
  return result as unknown as TrafficGap;
}

function carOf(row: Row): Row {
  const car: Row = {};
  if (row.name !== null) car.name = row.name;
  if (row.car_class !== null) car.carClass = row.car_class;
  if (row.same_class !== null) car.sameClass = row.same_class !== 0;
  return car;
}

function lapOf(row: Row, passes: Row[], laps: LapData[]): void {
  const lap = unpackFields(row, LAP_FIELDS);
  const tireWear = group(row, TIRE_WEAR_FIELDS);
  if (tireWear) lap.tireWear = tireWear;
  const conditions = group(row, CONDITION_FIELDS);
  if (conditions) lap.conditions = conditions;
  if (row.traffic_present !== null) {
    const traffic: Row = { ahead: gapOf(row, 'ahead'), behind: gapOf(row, 'behind') };
    if (row.traffic_following !== null) traffic.following = row.traffic_following !== 0;
    if (row.traffic_pressured !== null) traffic.pressured = row.traffic_pressured !== 0;
    traffic.passed = passes.filter(pass => pass.direction === 'passed').map(carOf);
    traffic.passedBy = passes.filter(pass => pass.direction === 'passedBy').map(carOf);
    lap.traffic = traffic as unknown as LapTraffic;
  }
  laps.push(lap as unknown as LapData);
}

function groupBy<T extends Row>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = grouped.get(k);
    if (bucket) bucket.push(row); else grouped.set(k, [row]);
  }
  return grouped;
}

/** Fills the event lists of a driver and of its laps from the driver's event rows. */
function assignEvents(driver: DriverData, driverMask: number | null, lapMasks: Array<number | null>, events: Row[]): void {
  for (const list of EVENT_LISTS) {
    const ofKind = events.filter(event => event.kind === list.kind);
    const make = (event: Row) => unpackFields(event, list.fields);
    if (((driverMask ?? 0) & list.bit) !== 0) {
      driver[list.prop] = ofKind.filter(event => event.driver_seq !== null).sort((a, b) => (a.driver_seq as number) - (b.driver_seq as number)).map(make) as never;
    }
    driver.laps.forEach((lap, lapOrdinal) => {
      if (((lapMasks[lapOrdinal] ?? 0) & list.bit) === 0) return;
      lap[list.prop] = ofKind.filter(event => event.lap_ordinal === lapOrdinal).sort((a, b) => (a.lap_seq as number) - (b.lap_seq as number)).map(make) as never;
    });
  }
}

/** The session's own scalars, weather, settings and best lap from a row of SESSION_SCALAR_COLUMNS. */
export function sessionScalars(row: Row): Row {
  const session: Row = {
    id: row.id, filename: row.filename, filePath: row.file_path, timestamp: row.timestamp, trackVenue: row.track_venue,
    trackCourse: row.track_course, sessionType: row.session_type, sessionName: row.session_name, driversCount: row.drivers_count,
  };
  unpackFields(row, SESSION_FIELDS, session);
  const weather = group(row, WEATHER_FIELDS);
  if (weather) session.weather = weather;
  const settings = group(row, SETTINGS_FIELDS);
  if (settings) session.settings = settings;
  const best = group(row, BEST_SESSION_LAP_FIELDS);
  if (best) session.bestSessionLap = best;
  return session;
}

/**
 * The replay link of a session: its recording row, and the session's main DuckDB file, which is stored
 * once on the session and mirrored here (a link carries the attachment of the session it belongs to).
 */
export function recordingLink(recording: Row, sessionRow: Row): Row {
  const link = unpackFields(recording, RECORDING_FIELDS);
  const filename = sessionRow.duckdb_filename;
  if (sessionRow.has_duckdb_telemetry === 1 || typeof filename === 'string') link.hasDuckDbTelemetry = true;
  if (typeof filename === 'string') link.duckdbFilename = filename;
  return link;
}

/** A driver's scalars from a row of DRIVER_WITH_DICTIONARIES (no laps, no events). */
export function driverScalars(row: Row): DriverData {
  const driver = unpackFields(row, DRIVER_DICTIONARY_FIELDS);
  unpackFields(row, DRIVER_FIELDS, driver);
  return driver as unknown as DriverData;
}

/** Assembles the session from its rows, or null when there is no such session. */
export function readSession(db: DatabaseType, id: string): DetailedSession | null {
  const row = db.prepare(`SELECT ${SESSION_SCALAR_COLUMNS} FROM sessions WHERE id = ?`).get(id) as Row | undefined;
  if (!row) return null;
  const session = sessionScalars(row);

  const recording = db.prepare('SELECT * FROM session_recordings WHERE session_id = ?').get(id) as Row | undefined;
  if (recording) session.matchingReplayFile = recordingLink(recording, row);

  const driverRows = db.prepare(`${DRIVER_WITH_DICTIONARIES} WHERE d.session_id = ? ORDER BY d.driver_ordinal`).all(id) as Row[];
  const lapRows = groupBy(db.prepare('SELECT * FROM session_laps WHERE session_id = ? ORDER BY driver_ordinal, lap_ordinal').all(id) as Row[], lap => String(lap.driver_ordinal));
  const passRows = groupBy(db.prepare('SELECT * FROM session_lap_passes WHERE session_id = ? ORDER BY driver_ordinal, lap_ordinal, direction, seq').all(id) as Row[],
    pass => `${pass.driver_ordinal}:${pass.lap_ordinal}`);
  const eventRows = groupBy(db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY driver_ordinal, seq').all(id) as Row[], event => String(event.driver_ordinal));

  const drivers = driverRows.map((driverRow): DriverData => {
    const ordinal = driverRow.driver_ordinal as number;
    const driver = driverScalars(driverRow);
    const laps: LapData[] = [];
    const lapMasks: Array<number | null> = [];
    for (const lapRow of lapRows.get(String(ordinal)) ?? []) {
      lapOf(lapRow, passRows.get(`${ordinal}:${lapRow.lap_ordinal}`) ?? [], laps);
      lapMasks.push(lapRow.lists_mask as number | null);
    }
    driver.laps = laps;
    assignEvents(driver, driverRow.lists_mask as number | null, lapMasks, eventRows.get(String(ordinal)) ?? []);
    return driver;
  });
  session.drivers = drivers;
  const playerOrdinal = row.player_driver_ordinal;
  if (typeof playerOrdinal === 'number' && drivers[playerOrdinal]) session.playerDriver = drivers[playerOrdinal];
  return session as unknown as DetailedSession;
}
