import type { Database as DatabaseType } from 'better-sqlite3';
import { columnDefinitions, type Field } from './fields.js';
import {
  BEST_SESSION_LAP_FIELDS, CONDITION_FIELDS, DRIVER_FIELDS, EVENT_COLUMNS, LAP_FIELDS, RECORDING_FIELDS,
  SESSION_FIELDS, SETTINGS_FIELDS, TIRE_WEAR_FIELDS, WEATHER_FIELDS,
} from './specs.js';

/**
 * Version of the normalized rows. Bump it when a table, a column or an assembly rule changes: every
 * session whose rows carry another version is written and verified again by the backfill.
 */
export const NORMALIZED_SESSION_VERSION = 2;

/** Columns added to `sessions` for the session's own scalars (the others already existed). */
export const SESSION_ROW_FIELDS: readonly Field[] = [
  ...SESSION_FIELDS, ...WEATHER_FIELDS, ...SETTINGS_FIELDS, ...BEST_SESSION_LAP_FIELDS,
];

/** Traffic columns of a lap: the nearest car ahead and behind, and the flags. */
export const TRAFFIC_COLUMNS = [
  'traffic_present INTEGER', 'traffic_following INTEGER', 'traffic_pressured INTEGER',
  'ahead_name TEXT', 'ahead_class TEXT', 'ahead_same_class INTEGER', 'ahead_gap_sec REAL',
  'behind_name TEXT', 'behind_class TEXT', 'behind_same_class INTEGER', 'behind_gap_sec REAL',
].join(', ');

export const SESSION_ROW_TABLES = ['session_recordings', 'session_drivers', 'session_laps', 'session_lap_passes', 'session_events'] as const;

/** Dictionaries shared by every session: exact driver names, vehicles (raw XML car type and class) and teams. */
export const SESSION_DICTIONARY_TABLES = ['drivers', 'vehicles', 'teams'] as const;

/**
 * Facts derived from a session's laps (shared/domain/sessionSummaries), written with the rows by the
 * projection. A driver row carries its clean-lap figures, a lap row its eligibility flags.
 */
export const DRIVER_DERIVED_DEFS = [
  'is_human INTEGER', 'is_player_driver INTEGER', 'driver_class TEXT', 'completed_laps_count INTEGER', 'clean_laps_count INTEGER',
  'driving_time_sum REAL', 'pit_count INTEGER', 'max_speed REAL', 'best_lap_ordinal INTEGER', 'best_lap_number INTEGER',
  'clean_average_lap_time REAL', 'top_three_average REAL', 'consistency_score REAL', 'best_lap_is_wet INTEGER',
] as const;
export const LAP_DERIVED_DEFS = [
  'condition_group TEXT', 'is_clean INTEGER', 'is_representative INTEGER', 'is_human INTEGER', 'leaderboard_eligible INTEGER',
] as const;
export const DRIVER_DERIVED_COLUMNS = DRIVER_DERIVED_DEFS.join(', ');
export const LAP_DERIVED_COLUMNS = LAP_DERIVED_DEFS.join(', ');
/** The column names of a list of definitions. */
export const derivedNames = (defs: readonly string[]): string[] => defs.map(def => def.split(' ')[0]);

/**
 * Tables of the layout before dictionaries and merged summaries (normalized version 1). They hold only
 * rows rebuilt from the session JSON, so they are dropped and the backfill writes them again.
 */
function dropVersionOneLayout(db: DatabaseType): void {
  const driverColumns = db.prepare('PRAGMA table_info(session_drivers)').all() as Array<{ name: string }>;
  if (driverColumns.length > 0 && !driverColumns.some(column => column.name === 'driver_id')) {
    for (const table of SESSION_ROW_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec('UPDATE sessions SET normalized_version = 0 WHERE normalized_version != 0');
  }
  db.exec('DROP TABLE IF EXISTS session_driver_summaries; DROP TABLE IF EXISTS session_lap_index;');
}

/** Creates the normalized session tables and the new `sessions` columns. Safe to run on every start. */
export function initSessionRowsSchema(db: DatabaseType): void {
  const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  const addColumn = (name: string, type: string) => { if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`); };
  for (const field of SESSION_ROW_FIELDS) addColumn(field.col, field.kind === 'text' ? 'TEXT' : field.kind === 'real' ? 'REAL' : 'INTEGER');
  addColumn('player_driver_ordinal', 'INTEGER');
  addColumn('normalized_version', 'INTEGER NOT NULL DEFAULT 0');
  dropVersionOneLayout(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_recordings (
      session_id TEXT NOT NULL PRIMARY KEY, ${columnDefinitions(RECORDING_FIELDS)}
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_session_recordings_name ON session_recordings(recording_name);
    CREATE TABLE IF NOT EXISTS drivers (
      driver_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, normalized_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drivers_normalized_name ON drivers(normalized_name);
    CREATE TABLE IF NOT EXISTS vehicles (
      vehicle_id INTEGER PRIMARY KEY, car_type TEXT, car_class TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique ON vehicles(ifnull(car_type, char(0)), ifnull(car_class, char(0)));
    CREATE TABLE IF NOT EXISTS teams (
      team_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS session_drivers (
      session_id TEXT NOT NULL, driver_ordinal INTEGER NOT NULL, driver_id INTEGER, vehicle_id INTEGER, team_id INTEGER,
      ${columnDefinitions(DRIVER_FIELDS)}, lists_mask INTEGER, ${DRIVER_DERIVED_COLUMNS},
      PRIMARY KEY(session_id, driver_ordinal)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS session_laps (
      session_id TEXT NOT NULL, driver_ordinal INTEGER NOT NULL, lap_ordinal INTEGER NOT NULL,
      ${columnDefinitions(LAP_FIELDS)}, ${columnDefinitions(TIRE_WEAR_FIELDS)}, ${columnDefinitions(CONDITION_FIELDS)},
      ${TRAFFIC_COLUMNS}, lists_mask INTEGER, ${LAP_DERIVED_COLUMNS},
      PRIMARY KEY(session_id, driver_ordinal, lap_ordinal)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_session_lap_board ON session_laps(condition_group, leaderboard_eligible, lap_time);
    CREATE INDEX IF NOT EXISTS idx_session_lap_valid_best ON session_laps(lap_time, session_id, driver_ordinal, lap_ordinal)
      WHERE is_valid=1 AND lap_time>0;
    CREATE INDEX IF NOT EXISTS idx_session_lap_board_best ON session_laps(lap_time, session_id, driver_ordinal, lap_ordinal)
      WHERE leaderboard_eligible=1 AND lap_time>0;
    CREATE INDEX IF NOT EXISTS idx_session_lap_number ON session_laps(session_id, driver_ordinal, lap_num);
    CREATE TABLE IF NOT EXISTS session_lap_passes (
      session_id TEXT NOT NULL, driver_ordinal INTEGER NOT NULL, lap_ordinal INTEGER NOT NULL,
      direction TEXT NOT NULL, seq INTEGER NOT NULL, name TEXT, car_class TEXT, same_class INTEGER,
      PRIMARY KEY(session_id, driver_ordinal, lap_ordinal, direction, seq)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS session_events (
      session_id TEXT NOT NULL, driver_ordinal INTEGER NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL,
      driver_seq INTEGER, lap_ordinal INTEGER, lap_seq INTEGER, ${columnDefinitions(EVENT_COLUMNS)},
      PRIMARY KEY(session_id, driver_ordinal, seq)
    ) WITHOUT ROWID;
    -- Covering index of the readiness gate (isSessionSummaryReady): it never reads a session row.
    DROP INDEX IF EXISTS idx_sessions_projection;
    DROP INDEX IF EXISTS idx_sessions_normalized;
    CREATE INDEX IF NOT EXISTS idx_sessions_ready ON sessions(projection_version, projection_revision, source_revision, normalized_version);
  `);
}
