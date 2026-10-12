import type { DetailedSession } from '../../../shared/types/index.js';
import type { Field, Row } from './fields.js';
import {
  BEST_SESSION_LAP_FIELDS, CONDITION_FIELDS, DRIVER_ALL_FIELDS, EVENT_LISTS, LAP_FIELDS, READ_TIME_DRIVER_PROPS, READ_TIME_LAP_PROPS,
  RECORDING_FIELDS, SESSION_FIELDS, SETTINGS_FIELDS, TIRE_WEAR_FIELDS, WEATHER_FIELDS,
} from './specs.js';

/**
 * An optional property holds a value or is absent: an explicit null reads back as absent. A text
 * column keeps a number as its text (old parsers wrote the game version as a number).
 */
function dropNulls(object: Row | undefined, fields: readonly Field[]): void {
  if (!object || typeof object !== 'object') return;
  for (const field of fields) {
    const value = object[field.prop];
    if (value === null && !field.nullable) delete object[field.prop];
    else if (field.kind === 'text' && typeof value === 'number') object[field.prop] = String(value);
  }
}

function canonicalLap(lap: Row, ordinal: number): void {
  for (const prop of READ_TIME_LAP_PROPS) delete lap[prop];
  lap.lapOrdinal = ordinal;
  dropNulls(lap, LAP_FIELDS);
  dropNulls(lap.tireWear as Row | undefined, TIRE_WEAR_FIELDS);
  dropNulls(lap.conditions as Row | undefined, CONDITION_FIELDS);
  const traffic = lap.traffic as Row | undefined;
  if (traffic && traffic.pressured === null) delete traffic.pressured;
}

function canonicalEvents(owner: Row): void {
  for (const list of EVENT_LISTS) {
    const events = owner[list.prop];
    if (Array.isArray(events)) for (const event of events) dropNulls(event as Row, list.fields);
  }
}

function canonicalDriver(driver: Row, ordinal: number): void {
  for (const prop of READ_TIME_DRIVER_PROPS) delete driver[prop];
  driver.driverOrdinal = ordinal;
  delete driver.driverName;
  dropNulls(driver, DRIVER_ALL_FIELDS);
  canonicalEvents(driver);
  const laps = driver.laps;
  if (Array.isArray(laps)) laps.forEach((lap, index) => canonicalLap(lap as Row, index));
}

/**
 * The form of a session that normalized rows keep: what the stored JSON holds minus what is filled at
 * read time (pace ratings, pit service, hydrated driver and lap ordinals), and optional nulls as absent properties.
 */
export function canonicalSession(session: DetailedSession): DetailedSession {
  const copy = JSON.parse(JSON.stringify(session)) as Row;
  dropNulls(copy, SESSION_FIELDS);
  dropNulls(copy.weather as Row | undefined, WEATHER_FIELDS);
  dropNulls(copy.settings as Row | undefined, SETTINGS_FIELDS);
  dropNulls(copy.bestSessionLap as Row | undefined, BEST_SESSION_LAP_FIELDS);
  dropNulls(copy.matchingReplayFile as Row | undefined, RECORDING_FIELDS);
  const drivers = Array.isArray(copy.drivers) ? copy.drivers as Row[] : [];
  const player = copy.playerDriver as Row | undefined;
  const playerKey = player ? JSON.stringify(player) : null;
  const playerIndex = player ? drivers.findIndex(driver => JSON.stringify(driver) === playerKey) : -1;
  drivers.forEach((driver, index) => canonicalDriver(driver, index));
  if (player) canonicalDriver(player, playerIndex);
  return copy as unknown as DetailedSession;
}

/** The paths where two values differ (a missing key and an undefined value are the same). */
export function diffValues(expected: unknown, actual: unknown, limit = 50, path = '$', out: string[] = []): string[] {
  if (out.length >= limit) return out;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.push(`${path}: length ${expected.length} vs ${actual.length}`);
    for (let index = 0; index < Math.min(expected.length, actual.length); index++) diffValues(expected[index], actual[index], limit, `${path}[${index}]`, out);
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    const a = expected as Row, b = actual as Row;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === undefined && b[key] === undefined) continue;
      diffValues(a[key], b[key], limit, `${path}.${key}`, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${path}: ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`);
  return out;
}
