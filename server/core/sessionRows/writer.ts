import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import type { DetailedSession, DriverData, LapData } from '../types.js';
import type { TrafficCar, TrafficGap } from '../../../shared/types/raceTraffic.js';
import type { SessionDriverProjection, SessionLapProjection, SessionSummaryProjection } from '../../../shared/types/sessionSummaries.js';
import { buildSessionSummaryProjection } from '../../../shared/domain/sessionSummaries/index.js';
import { insertSql, packFields, type Field, type Row, type SqlValue } from './fields.js';
import { DRIVER_DERIVED_DEFS, LAP_DERIVED_DEFS, SESSION_ROW_TABLES, derivedNames } from './schema.js';
import {
  BEST_SESSION_LAP_FIELDS, CONDITION_FIELDS, DRIVER_FIELDS, EVENT_COLUMNS, EVENT_LISTS, LAP_FIELDS, RECORDING_FIELDS,
  SESSION_FIELDS, SETTINGS_FIELDS, TIRE_WEAR_FIELDS, WEATHER_FIELDS,
} from './specs.js';
import { Dictionaries } from './dictionaries.js';
import { sessionTelemetry } from './canonical.js';

type Params = Record<string, SqlValue>;

const columnsOf = (fields: readonly Field[]) => fields.map(field => field.col);
const flag = (value: boolean): number => Number(value);

/** Key-order independent text of a value: two events are the same event when their keys are equal. */
export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Row).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableKey(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The index of the driver whose copy is the session's playerDriver, or null when there is no player
 * driver or no driver matches it (the round trip then reports the mismatch instead of inventing one).
 */
export function playerDriverOrdinal(session: DetailedSession): number | null {
  const player = session.playerDriver;
  if (!player) return null;
  const sameName = session.drivers.map((driver, index) => ({ driver, index })).filter(({ driver }) => driver.name === player.name);
  if (sameName.length === 0) return null;
  const key = stableKey(player);
  return (sameName.find(({ driver }) => stableKey(driver) === key) ?? sameName.find(({ driver }) => driver.isPlayer) ?? sameName[0]).index;
}

function listsMask(source: DriverData | LapData): number | null {
  let mask = 0;
  for (const list of EVENT_LISTS) if (Array.isArray(source[list.prop])) mask |= list.bit;
  return mask === 0 ? null : mask;
}

function carParams(prefix: string, gap: TrafficGap | null | undefined): Params {
  return {
    [`${prefix}_name`]: gap?.car?.name ?? null, [`${prefix}_class`]: gap?.car?.carClass ?? null,
    [`${prefix}_same_class`]: typeof gap?.car?.sameClass === 'boolean' ? Number(gap.car.sameClass) : null,
    [`${prefix}_gap_sec`]: typeof gap?.gapSec === 'number' && Number.isFinite(gap.gapSec) ? gap.gapSec : null,
  };
}

/** The clean-lap figures a driver row carries; NULL for a driver the projection does not know. */
function driverDerived(derived: SessionDriverProjection | undefined): Params {
  return {
    is_human: derived ? flag(derived.isHuman) : null, is_player_driver: derived ? flag(derived.isPlayer) : null,
    driver_class: derived?.carClass ?? null, completed_laps_count: derived?.lapsCount ?? null,
    clean_laps_count: derived?.cleanLapsCount ?? null, driving_time_sum: derived?.drivingTimeSum ?? null,
    pit_count: derived?.pitCount ?? null, max_speed: derived?.maxSpeed ?? null, best_lap_ordinal: derived?.bestLapOrdinal ?? null,
    best_lap_number: derived?.bestLapNumber ?? null, clean_average_lap_time: derived?.averageLapTime ?? null,
    top_three_average: derived?.topThreeAverage ?? null, consistency_score: derived?.consistencyScore ?? null,
    best_lap_is_wet: derived ? flag(derived.bestLapWet) : null,
  };
}

/** The eligibility flags a lap row carries. */
function lapDerived(derived: SessionLapProjection | undefined): Params {
  return {
    condition_group: derived?.conditionGroup ?? null, is_clean: derived ? flag(derived.isClean) : null,
    is_representative: derived ? flag(derived.isRepresentative) : null, is_human: derived ? flag(derived.isHuman) : null,
    leaderboard_eligible: derived ? flag(derived.leaderboardEligible) : null,
  };
}

function lapParams(base: Params, lap: LapData, derived: SessionLapProjection | undefined): Params {
  packFields(base, lap as unknown as Row, LAP_FIELDS);
  packFields(base, lap.tireWear as unknown as Row | undefined, TIRE_WEAR_FIELDS);
  packFields(base, lap.conditions as unknown as Row | undefined, CONDITION_FIELDS);
  const traffic = lap.traffic;
  base.traffic_present = traffic ? 1 : null;
  base.traffic_following = typeof traffic?.following === 'boolean' ? Number(traffic.following) : null;
  base.traffic_pressured = typeof traffic?.pressured === 'boolean' ? Number(traffic.pressured) : null;
  Object.assign(base, carParams('ahead', traffic?.ahead), carParams('behind', traffic?.behind));
  base.lists_mask = listsMask(lap);
  Object.assign(base, lapDerived(derived));
  return base;
}

interface Statements {
  update: Statement; recording: Statement; driver: Statement; lap: Statement; pass: Statement; event: Statement;
  dictionaries: Dictionaries;
}

function prepare(db: DatabaseType): Statements {
  const sessionColumns = [...SESSION_FIELDS, ...WEATHER_FIELDS, ...SETTINGS_FIELDS, ...BEST_SESSION_LAP_FIELDS].map(field => field.col);
  const trafficColumns = ['traffic_present', 'traffic_following', 'traffic_pressured',
    ...['ahead', 'behind'].flatMap(side => ['name', 'class', 'same_class', 'gap_sec'].map(part => `${side}_${part}`))];
  return {
    update: db.prepare(`UPDATE sessions SET ${[...sessionColumns, 'player_driver_ordinal'].map(column => `${column}=@${column}`).join(', ')} WHERE id=@id`),
    recording: db.prepare(insertSql('session_recordings', ['session_id', ...columnsOf(RECORDING_FIELDS)])),
    driver: db.prepare(insertSql('session_drivers', ['session_id', 'driver_ordinal', 'driver_id', 'vehicle_id', 'team_id',
      ...columnsOf(DRIVER_FIELDS), 'lists_mask', ...derivedNames(DRIVER_DERIVED_DEFS)])),
    lap: db.prepare(insertSql('session_laps', ['session_id', 'driver_ordinal', 'lap_ordinal', ...columnsOf(LAP_FIELDS),
      ...columnsOf(TIRE_WEAR_FIELDS), ...columnsOf(CONDITION_FIELDS), ...trafficColumns, 'lists_mask', ...derivedNames(LAP_DERIVED_DEFS)])),
    pass: db.prepare(insertSql('session_lap_passes', ['session_id', 'driver_ordinal', 'lap_ordinal', 'direction', 'seq', 'name', 'car_class', 'same_class'])),
    event: db.prepare(insertSql('session_events', ['session_id', 'driver_ordinal', 'seq', 'kind', 'driver_seq', 'lap_ordinal', 'lap_seq', ...columnsOf(EVENT_COLUMNS)])),
    dictionaries: new Dictionaries(db),
  };
}

function writePasses(statements: Statements, sessionId: string, driverOrdinal: number, lapOrdinal: number, lap: LapData): void {
  for (const direction of ['passed', 'passedBy'] as const) {
    const cars: TrafficCar[] = lap.traffic?.[direction] ?? [];
    cars.forEach((car, seq) => statements.pass.run({
      session_id: sessionId, driver_ordinal: driverOrdinal, lap_ordinal: lapOrdinal, direction, seq,
      name: car.name ?? null, car_class: car.carClass ?? null, same_class: typeof car.sameClass === 'boolean' ? Number(car.sameClass) : null,
    }));
  }
}

/**
 * A driver's events once: every entry of the driver lists is a row; a lap event is the row of the
 * driver entry it equals, so it only adds its place in the lap's list. A lap event with no equal
 * driver entry gets a row of its own (driver_seq NULL).
 */
function writeEvents(statements: Statements, sessionId: string, driverOrdinal: number, driver: DriverData): void {
  const blank: Params = Object.fromEntries(EVENT_COLUMNS.map(field => [field.col, null]));
  let seq = 0;
  const unclaimed = new Map<string, Array<{ row: Params }>>();
  const rows: Params[] = [];
  const addRow = (kind: string, event: Row, fields: readonly Field[], driverSeq: number | null): Params => {
    const row: Params = { ...blank, session_id: sessionId, driver_ordinal: driverOrdinal, seq: seq++, kind, driver_seq: driverSeq, lap_ordinal: null, lap_seq: null };
    packFields(row, event, fields);
    rows.push(row);
    return row;
  };
  for (const list of EVENT_LISTS) {
    const events = driver[list.prop];
    if (!Array.isArray(events)) continue;
    events.forEach((event, index) => {
      const row = addRow(list.kind, event as unknown as Row, list.fields, index);
      const key = `${list.kind}|${stableKey(event)}`;
      const queue = unclaimed.get(key);
      if (queue) queue.push({ row }); else unclaimed.set(key, [{ row }]);
    });
  }
  driver.laps.forEach((lap, lapOrdinal) => {
    for (const list of EVENT_LISTS) {
      const events = lap[list.prop];
      if (!Array.isArray(events)) continue;
      events.forEach((event, lapSeq) => {
        const claimed = unclaimed.get(`${list.kind}|${stableKey(event)}`)?.shift();
        const row = claimed?.row ?? addRow(list.kind, event as unknown as Row, list.fields, null);
        row.lap_ordinal = lapOrdinal;
        row.lap_seq = lapSeq;
      });
    }
  });
  for (const row of rows) statements.event.run(row);
}

/** The projection's laps by driver, each list indexed by lap ordinal. */
function lapsByDriver(projection: SessionSummaryProjection): Map<number, SessionLapProjection[]> {
  const grouped = new Map<number, SessionLapProjection[]>();
  for (const lap of projection.laps) {
    const list = grouped.get(lap.driverOrdinal) ?? [];
    list[lap.lapOrdinal] = lap;
    grouped.set(lap.driverOrdinal, list);
  }
  return grouped;
}

/**
 * Replaces every normalized row of a session in one transaction. The `sessions` row must exist. The
 * derived columns (clean-lap figures, lap eligibility) come from the session's projection, which a
 * caller that already built it passes in.
 */
export function writeSessionRows(db: DatabaseType, session: DetailedSession, projection: SessionSummaryProjection = buildSessionSummaryProjection(session, 0)): void {
  const derivedLaps = lapsByDriver(projection);
  db.transaction(() => {
    const statements = prepare(db);
    for (const table of SESSION_ROW_TABLES) db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(session.id);

    const params: Params = { id: session.id };
    packFields(params, session as unknown as Row, SESSION_FIELDS);
    const telemetry = sessionTelemetry(session);
    params.has_duckdb_telemetry = telemetry.hasDuckDbTelemetry === undefined ? null : Number(telemetry.hasDuckDbTelemetry);
    params.duckdb_filename = telemetry.duckdbFilename ?? null;
    packFields(params, session.weather as unknown as Row | undefined, WEATHER_FIELDS);
    packFields(params, session.settings as unknown as Row | undefined, SETTINGS_FIELDS);
    packFields(params, session.bestSessionLap as unknown as Row | undefined, BEST_SESSION_LAP_FIELDS);
    params.player_driver_ordinal = playerDriverOrdinal(session);
    const updated = statements.update.run(params);
    if (updated.changes === 0) throw new Error(`Cannot write rows of unknown session ${session.id}`);

    if (session.matchingReplayFile) {
      const recording: Params = { session_id: session.id };
      packFields(recording, session.matchingReplayFile as unknown as Row, RECORDING_FIELDS);
      statements.recording.run(recording);
    }
    session.drivers.forEach((driver, driverOrdinal) => {
      const row: Params = {
        session_id: session.id, driver_ordinal: driverOrdinal, driver_id: statements.dictionaries.driver(driver.name),
        vehicle_id: statements.dictionaries.vehicle(driver.carType, driver.carClass), team_id: statements.dictionaries.team(driver.teamName),
      };
      packFields(row, driver as unknown as Row, DRIVER_FIELDS);
      row.lists_mask = listsMask(driver);
      Object.assign(row, driverDerived(projection.drivers[driverOrdinal]));
      statements.driver.run(row);
      const lapDerivations = derivedLaps.get(driverOrdinal) ?? [];
      driver.laps.forEach((lap, lapOrdinal) => {
        statements.lap.run(lapParams({ session_id: session.id, driver_ordinal: driverOrdinal, lap_ordinal: lapOrdinal }, lap, lapDerivations[lapOrdinal]));
        writePasses(statements, session.id, driverOrdinal, lapOrdinal, lap);
      });
      writeEvents(statements, session.id, driverOrdinal, driver);
    });
  })();
}

/** Empties the derived columns of a session's rows: a session whose summaries could not be built contributes to no aggregate. */
export function clearDerivedColumns(db: DatabaseType, sessionId: string): void {
  db.prepare(`UPDATE session_drivers SET ${derivedNames(DRIVER_DERIVED_DEFS).map(column => `${column} = NULL`).join(', ')} WHERE session_id = ?`).run(sessionId);
  db.prepare(`UPDATE session_laps SET ${derivedNames(LAP_DERIVED_DEFS).map(column => `${column} = NULL`).join(', ')} WHERE session_id = ?`).run(sessionId);
}

/** Updates only the derived projection columns of a session's drivers and laps. */
export function updateDerivedColumns(db: DatabaseType, sessionId: string, projection: SessionSummaryProjection): void {
  const driverStmt = db.prepare(`UPDATE session_drivers SET
    ${derivedNames(DRIVER_DERIVED_DEFS).map(col => `${col} = @${col}`).join(', ')}
    WHERE session_id = @session_id AND driver_ordinal = @driver_ordinal`);
  const lapStmt = db.prepare(`UPDATE session_laps SET
    ${derivedNames(LAP_DERIVED_DEFS).map(col => `${col} = @${col}`).join(', ')}
    WHERE session_id = @session_id AND driver_ordinal = @driver_ordinal AND lap_ordinal = @lap_ordinal`);

  projection.drivers.forEach((driver, driverOrdinal) => {
    driverStmt.run({ session_id: sessionId, driver_ordinal: driverOrdinal, ...driverDerived(driver) });
  });
  for (const lap of projection.laps) {
    lapStmt.run({ session_id: sessionId, driver_ordinal: lap.driverOrdinal, lap_ordinal: lap.lapOrdinal, ...lapDerived(lap) });
  }
}

