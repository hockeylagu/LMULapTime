import { Database as DatabaseType } from 'better-sqlite3';
import zlib from 'zlib';

export const REPLAY_CACHE_VERSION = 'v3';
export const DUCKDB_TELEMETRY_CACHE_VERSION = 'v9';

// Replay JSON blobs (esp. full-resolution trajectories with thousands of points) are
// large and highly repetitive, so brotli gives a much better ratio than gzip for a
// one-time write / many-read cache like this.
export function compressJson(value: unknown): Buffer {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(value), 'utf8'), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
  });
}

export function decompressJson<T>(buf: Buffer): T {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')) as T;
}

export interface CacheStats {
  enabled: boolean;
  dbPath: string;
  sessionsCount: number;
  lastSyncedAt: string | null;
  dbSizeBytes: number;
  replaysCount: number;
  replayTrajectoriesCount: number;
  telemetryFilesCount: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  total: number;
  lastSyncedAt: string;
}

export interface ReplaySyncProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export interface ReplaySyncResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  lastSyncedAt: string;
  interrupted: boolean;
}

export function initDbSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_mtime INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      track_venue TEXT NOT NULL,
      track_course TEXT NOT NULL,
      session_type TEXT NOT NULL,
      session_name TEXT NOT NULL,
      player_driver_name TEXT,
      player_car_class TEXT,
      player_car_type TEXT,
      player_best_lap_time REAL,
      player_laps_count INTEGER,
      drivers_count INTEGER,
      metadata_json TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions(track_venue);

    CREATE TABLE IF NOT EXISTS reference_laptimes (
      key TEXT PRIMARY KEY,
      track_name TEXT NOT NULL,
      car_class TEXT NOT NULL,
      patch TEXT,
      target100_sec REAL NOT NULL,
      alien_sec REAL NOT NULL,
      competitive_sec REAL NOT NULL,
      good_sec REAL NOT NULL,
      good_midpack_sec REAL NOT NULL,
      midpack_sec REAL NOT NULL,
      midpack_tail_sec REAL NOT NULL,
      tail_ender_sec REAL NOT NULL,
      offline_sec REAL NOT NULL,
      fastest_car TEXT,
      record_laptime_sec REAL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ref_track_class ON reference_laptimes(track_name, car_class);

    CREATE TABLE IF NOT EXISTS cache_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_reports (
      cache_key TEXT PRIMARY KEY,
      replay_name TEXT NOT NULL,
      lap_number INTEGER NOT NULL,
      baseline_replay_name TEXT,
      baseline_lap_number INTEGER,
      model TEXT NOT NULL,
      prompt_version INTEGER NOT NULL,
      report_json TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_metadata (
      filename TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_mtime INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      parser_version TEXT NOT NULL,
      metadata_br BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_trajectories (
      filename TEXT NOT NULL,
      source_path TEXT,
      driver_slot INTEGER NOT NULL,
      lap_key INTEGER NOT NULL,
      file_mtime INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      parser_version TEXT NOT NULL,
      points_count INTEGER NOT NULL,
      trajectory_br BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (filename, driver_slot, lap_key)
    );

    CREATE TABLE IF NOT EXISTS telemetry_metadata (
      filename TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_mtime INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      track_name TEXT NOT NULL,
      session_type TEXT NOT NULL,
      session_timestamp TEXT NOT NULL,
      laps_count INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      matched_session_id TEXT,
      matched_replay_filename TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_lap_cache (
      filename TEXT NOT NULL,
      lap_number INTEGER NOT NULL,
      points_count INTEGER NOT NULL,
      telemetry_br BLOB NOT NULL,
      cache_version TEXT NOT NULL DEFAULT 'v1',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (filename, lap_number)
    );

    CREATE TABLE IF NOT EXISTS ingest_errors (
      source_type TEXT NOT NULL,
      source_path TEXT NOT NULL,
      error_message TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (source_type, source_path)
    );
  `);

  const telemetryCacheColumns = db.prepare('PRAGMA table_info(telemetry_lap_cache)').all() as Array<{ name: string }>;
  if (!telemetryCacheColumns.some(column => column.name === 'cache_version')) {
    db.exec("ALTER TABLE telemetry_lap_cache ADD COLUMN cache_version TEXT NOT NULL DEFAULT 'v1'");
  }
  const trajectoryColumns = db.prepare('PRAGMA table_info(replay_trajectories)').all() as Array<{ name: string }>;
  if (!trajectoryColumns.some(column => column.name === 'source_path')) {
    db.exec('ALTER TABLE replay_trajectories ADD COLUMN source_path TEXT');
  }
}
