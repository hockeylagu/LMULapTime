import type { DetailedSession } from '../types.js';
import type { Field, Row } from './fields.js';
import {
  BEST_SESSION_LAP_FIELDS, CONDITION_FIELDS, DRIVER_ALL_FIELDS, EVENT_LISTS, LAP_FIELDS, READ_TIME_DRIVER_PROPS, READ_TIME_LAP_PROPS,
  LINK_TELEMETRY_FIELDS, RECORDING_FIELDS, SESSION_FIELDS, SETTINGS_FIELDS, TIRE_WEAR_FIELDS, WEATHER_FIELDS,
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

function canonicalLap(lap: Row): void {
  for (const prop of READ_TIME_LAP_PROPS) delete lap[prop];
  delete lap.lapOrdinal;
  dropNulls(lap, LAP_FIELDS);
  dropNulls(lap.tireWear as Row | undefined, TIRE_WEAR_FIELDS);
  dropNulls(lap.conditions as Row | undefined, CONDITION_FIELDS);
  const traffic = lap.traffic as Row | undefined;
  if (traffic && traffic.pressured === null) delete traffic.pressured;
  canonicalEvents(lap);
}

function canonicalEvents(owner: Row): void {
  for (const list of EVENT_LISTS) {
    const events = owner[list.prop];
    if (Array.isArray(events)) for (const event of events) dropNulls(event as Row, list.fields);
  }
}

function canonicalDriver(driver: Row): void {
  for (const prop of READ_TIME_DRIVER_PROPS) delete driver[prop];
  delete driver.driverOrdinal;
  dropNulls(driver, DRIVER_ALL_FIELDS);
  canonicalEvents(driver);
  const laps = driver.laps;
  if (Array.isArray(laps)) for (const lap of laps) canonicalLap(lap as Row);
}

/**
 * The session's main DuckDB file lives on the session alone. Rows stored before the session carried it
 * (116 of 992 in the local cache) hold it on the replay link only: the session takes the link's values
 * when it has none, so the link and the session agree again. The writer and the canonical form both use it.
 */
export function sessionTelemetry(session: { hasDuckDbTelemetry?: boolean; duckdbFilename?: string | null; matchingReplayFile?: { hasDuckDbTelemetry?: boolean | null; duckdbFilename?: string | null } | null }):
  { hasDuckDbTelemetry: boolean | undefined; duckdbFilename: string | undefined } {
  const link = session.matchingReplayFile;
  const duckdbFilename = session.duckdbFilename || (typeof link?.duckdbFilename === 'string' && link.duckdbFilename ? link.duckdbFilename : undefined);
  const hasDuckDbTelemetry = session.hasDuckDbTelemetry || link?.hasDuckDbTelemetry === true ? true : session.hasDuckDbTelemetry;
  return { hasDuckDbTelemetry: hasDuckDbTelemetry ?? undefined, duckdbFilename };
}

function liftLinkTelemetry(copy: Row): void {
  const lifted = sessionTelemetry(copy as Parameters<typeof sessionTelemetry>[0]);
  if (lifted.duckdbFilename !== undefined) copy.duckdbFilename = lifted.duckdbFilename;
  if (lifted.hasDuckDbTelemetry !== undefined && lifted.hasDuckDbTelemetry !== null) copy.hasDuckDbTelemetry = lifted.hasDuckDbTelemetry;
}

/**
 * The form of a session that normalized rows keep: what the stored JSON holds minus what is filled at
 * read time (pace ratings, pit service, hydrated ordinals), and optional nulls as absent properties.
 */
export function canonicalSession(session: DetailedSession): DetailedSession {
  const copy = JSON.parse(JSON.stringify(session)) as Row;
  liftLinkTelemetry(copy);
  dropNulls(copy, SESSION_FIELDS);
  dropNulls(copy.weather as Row | undefined, WEATHER_FIELDS);
  dropNulls(copy.settings as Row | undefined, SETTINGS_FIELDS);
  dropNulls(copy.bestSessionLap as Row | undefined, BEST_SESSION_LAP_FIELDS);
  dropNulls(copy.matchingReplayFile as Row | undefined, RECORDING_FIELDS);
  dropNulls(copy.matchingReplayFile as Row | undefined, LINK_TELEMETRY_FIELDS);
  if (copy.playerDriver) canonicalDriver(copy.playerDriver as Row);
  if (Array.isArray(copy.drivers)) for (const driver of copy.drivers) canonicalDriver(driver as Row);
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
