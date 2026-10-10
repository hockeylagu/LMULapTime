import type { Database as DatabaseType } from 'better-sqlite3';
import { getMetadata, setMetadata } from '../dbMetadataStore.js';
import { NORMALIZED_SESSION_VERSION } from './schema.js';

export const SESSION_JSON_REMOVED_AT_KEY = 'session_json_removed_at';

/**
 * All column names to retain in `sessions_new`, ordered with hot history columns first.
 */
export const KEPT_SESSION_COLUMNS: readonly string[] = [
  'id', 'timestamp', 'layout_key', 'session_kind', 'session_type', 'session_name',
  'track_venue', 'track_course', 'recording_name', 'source_revision', 'projection_revision',
  'projection_version', 'normalized_version', 'player_driver_ordinal', 'primary_driver_ordinal',
  'is_empty', 'projection_error', 'player_driver_name', 'player_car_class', 'player_car_type',
  'player_best_lap_time', 'player_laps_count', 'drivers_count', 'filename', 'file_path',
  'file_mtime', 'file_size', 'updated_at', 'track_event', 'track_length_meters',
  'time_string', 'weather_info', 'game_version', 'total_laps_count', 'has_duckdb_telemetry',
  'duckdb_filename', 'weather_condition', 'weather_time_of_day', 'weather_string',
  'settings_mode_setting', 'settings_server_name', 'settings_damage_multiplier',
  'settings_fuel_multiplier', 'settings_tire_multiplier', 'settings_tire_warmers',
  'settings_fixed_setups', 'settings_free_settings', 'settings_fixed_upgrades',
  'settings_parc_ferme', 'settings_mech_fail_rate', 'settings_duration_minutes',
  'settings_race_laps', 'settings_race_time_minutes', 'settings_vehicles_allowed',
  'best_session_lap_driver', 'best_session_lap_car_type', 'best_session_lap_time',
  'best_session_lap_time_string',
] as const;

export const SESSION_TABLE_INDEX_DDL: readonly string[] = [
  'CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions(track_venue);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_ready ON sessions(projection_version, projection_revision, source_revision, normalized_version);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_layout_timestamp ON sessions(layout_key, timestamp DESC);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_layout_kind_timestamp ON sessions(layout_key, session_kind, timestamp DESC);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_recording ON sessions(recording_name);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_track_course ON sessions(track_venue, track_course);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);',
  'CREATE INDEX IF NOT EXISTS idx_sessions_file_mtime ON sessions(file_mtime);',
] as const;

export const SESSIONS_NEW_TABLE_DDL = `
  CREATE TABLE sessions_new (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    layout_key TEXT NOT NULL DEFAULT 'unknown',
    session_kind TEXT NOT NULL DEFAULT 'unknown',
    session_type TEXT NOT NULL,
    session_name TEXT NOT NULL,
    track_venue TEXT NOT NULL,
    track_course TEXT NOT NULL,
    recording_name TEXT,
    source_revision INTEGER NOT NULL DEFAULT 0,
    projection_revision INTEGER NOT NULL DEFAULT 0,
    projection_version INTEGER NOT NULL DEFAULT 0,
    normalized_version INTEGER NOT NULL DEFAULT 0,
    player_driver_ordinal INTEGER,
    primary_driver_ordinal INTEGER,
    is_empty INTEGER NOT NULL DEFAULT 1,
    projection_error TEXT,
    player_driver_name TEXT,
    player_car_class TEXT,
    player_car_type TEXT,
    player_best_lap_time REAL,
    player_laps_count INTEGER,
    drivers_count INTEGER,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_mtime INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    track_event TEXT,
    track_length_meters REAL,
    time_string TEXT,
    weather_info TEXT,
    game_version TEXT,
    total_laps_count INTEGER,
    has_duckdb_telemetry INTEGER,
    duckdb_filename TEXT,
    weather_condition TEXT,
    weather_time_of_day TEXT,
    weather_string TEXT,
    settings_mode_setting TEXT,
    settings_server_name TEXT,
    settings_damage_multiplier REAL,
    settings_fuel_multiplier REAL,
    settings_tire_multiplier REAL,
    settings_tire_warmers INTEGER,
    settings_fixed_setups INTEGER,
    settings_free_settings REAL,
    settings_fixed_upgrades INTEGER,
    settings_parc_ferme REAL,
    settings_mech_fail_rate REAL,
    settings_duration_minutes REAL,
    settings_race_laps REAL,
    settings_race_time_minutes REAL,
    settings_vehicles_allowed TEXT,
    best_session_lap_driver TEXT,
    best_session_lap_car_type TEXT,
    best_session_lap_time REAL,
    best_session_lap_time_string TEXT
  );
`;

/**
 * Returns true if the sessions table has already been rebuilt without the JSON columns.
 */
export function isSessionJsonRemoved(db: DatabaseType): boolean {
  return getMetadata(db, SESSION_JSON_REMOVED_AT_KEY) !== null;
}

/**
 * Checks whether sessions can be converted:
 * - conversion hasn't run yet
 * - all sessions have normalized_version === NORMALIZED_SESSION_VERSION
 */
export function canConvertSessions(db: DatabaseType): {
  canConvert: boolean;
  totalCount: number;
  unverifiedCount: number;
  unverifiedIds: string[];
} {
  const total = (db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count;
  const unverifiedRows = db.prepare(
    'SELECT id FROM sessions WHERE normalized_version != ? LIMIT 50'
  ).all(NORMALIZED_SESSION_VERSION) as Array<{ id: string }>;
  const unverifiedCount = (db.prepare(
    'SELECT COUNT(*) AS count FROM sessions WHERE normalized_version != ?'
  ).get(NORMALIZED_SESSION_VERSION) as { count: number }).count;

  return {
    canConvert: unverifiedCount === 0,
    totalCount: total,
    unverifiedCount,
    unverifiedIds: unverifiedRows.map(r => r.id),
  };
}

function escapeSqlString(str: string): string {
  return str.replace(/\\/g, '/').replace(/'/g, "''");
}

/**
 * Copies id, data_json, metadata_json to a sidecar database using ATTACH.
 * Returns the count of copied rows.
 */
export function backupSessionsJsonToSidecar(db: DatabaseType, sidecarPath: string): number {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name)
  );
  if (!columns.has('data_json')) return 0;

  const escaped = escapeSqlString(sidecarPath);
  db.exec(`ATTACH DATABASE '${escaped}' AS sidecar;`);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sidecar.sessions_json (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        metadata_json TEXT
      );
    `);
    const hasMetadata = columns.has('metadata_json');
    const selectSql = hasMetadata
      ? 'SELECT id, data_json, metadata_json FROM sessions WHERE data_json IS NOT NULL'
      : 'SELECT id, data_json, NULL AS metadata_json FROM sessions WHERE data_json IS NOT NULL';
    const result = db.prepare(`
      INSERT OR REPLACE INTO sidecar.sessions_json (id, data_json, metadata_json)
      ${selectSql};
    `).run();
    return result.changes;
  } finally {
    db.exec('DETACH DATABASE sidecar;');
  }
}

/**
 * Rebuilds the `sessions` table without `metadata_json`, `data_json`, and `summary_json`.
 * All operations run inside an atomic transaction.
 */
export function rebuildSessionsTableWithoutJson(db: DatabaseType): void {
  if (isSessionJsonRemoved(db)) return;

  const check = canConvertSessions(db);
  if (!check.canConvert) {
    throw new Error(`Cannot rebuild sessions table: ${check.unverifiedCount} session(s) not verified`);
  }

  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name)
  );
  if (!existingCols.has('data_json') && !existingCols.has('metadata_json')) {
    setMetadata(db, SESSION_JSON_REMOVED_AT_KEY, Date.now().toString());
    return;
  }

  const colsToCopy = KEPT_SESSION_COLUMNS.filter(col => existingCols.has(col));
  const colsJoined = colsToCopy.join(', ');

  db.transaction(() => {
    db.exec(SESSIONS_NEW_TABLE_DDL);
    db.exec(`INSERT INTO sessions_new (${colsJoined}) SELECT ${colsJoined} FROM sessions;`);
    db.exec('DROP TABLE sessions;');
    db.exec('ALTER TABLE sessions_new RENAME TO sessions;');
    for (const indexSql of SESSION_TABLE_INDEX_DDL) {
      db.exec(indexSql);
    }
    setMetadata(db, SESSION_JSON_REMOVED_AT_KEY, Date.now().toString());
  })();
}

/**
 * Coordinates the one-time Phase 3b conversion:
 * 1. Checks prerequisites (normalized verification).
 * 2. Backs up JSON columns to sidecar database.
 * 3. Rebuilds `sessions` table without JSON columns in a single transaction.
 */
export function convertSessionsToNormalizedStorage(db: DatabaseType, sidecarPath: string): {
  converted: boolean;
  rowsBackedUp: number;
} {
  if (isSessionJsonRemoved(db)) {
    return { converted: false, rowsBackedUp: 0 };
  }
  const check = canConvertSessions(db);
  if (!check.canConvert) {
    throw new Error(
      `Cannot convert sessions to normalized storage: ${check.unverifiedCount} session(s) not verified. IDs: ${check.unverifiedIds.slice(0, 5).join(', ')}`
    );
  }
  const rowsBackedUp = backupSessionsJsonToSidecar(db, sidecarPath);
  rebuildSessionsTableWithoutJson(db);
  return { converted: true, rowsBackedUp };
}

/**
 * Rollback helper: restores `data_json` and `metadata_json` from the sidecar database
 * and clears the `session_json_removed_at` metadata key.
 */
export function restoreSessionsJsonFromSidecar(db: DatabaseType, sidecarPath: string): number {
  const escaped = escapeSqlString(sidecarPath);
  db.exec(`ATTACH DATABASE '${escaped}' AS sidecar;`);
  try {
    const existingCols = new Set(
      (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name)
    );
    if (!existingCols.has('data_json')) {
      db.exec('ALTER TABLE sessions ADD COLUMN data_json TEXT;');
    }
    if (!existingCols.has('metadata_json')) {
      db.exec('ALTER TABLE sessions ADD COLUMN metadata_json TEXT;');
    }
    if (!existingCols.has('summary_json')) {
      db.exec('ALTER TABLE sessions ADD COLUMN summary_json TEXT;');
    }

    const result = db.prepare(`
      UPDATE sessions SET
        data_json = (SELECT s.data_json FROM sidecar.sessions_json s WHERE s.id = sessions.id),
        metadata_json = (SELECT COALESCE(s.metadata_json, s.data_json) FROM sidecar.sessions_json s WHERE s.id = sessions.id)
      WHERE EXISTS (SELECT 1 FROM sidecar.sessions_json s WHERE s.id = sessions.id);
    `).run();

    db.prepare('DELETE FROM cache_metadata WHERE key = ?').run(SESSION_JSON_REMOVED_AT_KEY);
    return result.changes;
  } finally {
    db.exec('DETACH DATABASE sidecar;');
  }
}
