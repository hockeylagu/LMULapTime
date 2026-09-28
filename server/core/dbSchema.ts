import { Database as DatabaseType } from 'better-sqlite3';
import zlib from 'zlib';

// Bumping REPLAY_CACHE_VERSION makes every replay on disk be decoded again (once per driver),
// and replays LMU has since deleted can never be: their rows are the only copy left. Only bump
// it when stored rows can no longer be read; a version whose rows the current code still reads
// correctly belongs in COMPATIBLE_REPLAY_CACHE_VERSIONS instead.
// v6: calibrated ambient temp formula, Virtual Energy (1/51), contact events (1/17), tyre compounds (1/16), removal of fake trackTemp
// v7: event classes read without the race-session bit (29), so practice / qualifying replays get
//     weather, tyre compounds, contacts, Virtual Energy and flags; penalties decoded from class 3.
// Garage state (inGarage, and inPit on the drive out of the garage) is recomputed on read from the
// pit events for every version (withGarageState, replayTrajectoryCodec.ts), so it needed no bump.
// If a later bump rewrites every stored row, deleted replays included, drop that adapter.
export const REPLAY_CACHE_VERSION = 'v7';
export const COMPATIBLE_REPLAY_CACHE_VERSIONS: ReadonlySet<string> = new Set([
  REPLAY_CACHE_VERSION,
  // Race replays match v7 except penalties; practice / qualifying rows lack the events above.
  'v6',
  'v5',
  // Written by an unreleased build that also stored each lap's edge samples (now derived from
  // the neighbouring lap rows on read); otherwise identical to v3.
  'v4',
  // Preserves full backwards compatibility with v3 cached trajectories and metadata (lossy 0.01s/0.01m/integer km/h)
  'v3',
]);

export function isCompatibleReplayCacheVersion(version: string): boolean {
  return COMPATIBLE_REPLAY_CACHE_VERSIONS.has(version);
}
// v10: pedals and tyre wear are scaled to percent once per channel, not per sample (v9 turned a
// pedal passing through 0-1 % into a 0-100 % spike).
// v11: the gear, ABS and TC state at the lap start is the last change before it, however long ago
// (v10 looked back 5 s for gear and 1 s for ABS/TC, and started a lap on a long straight in gear 1).
export const DUCKDB_TELEMETRY_CACHE_VERSION = 'v11';

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

export interface SessionSyncProgress {
  processed: number;
  total: number;
  currentFile: string;
  stage?: string;
  filePercent?: number;
}

export interface ReplaySyncProgress {
  processed: number;
  total: number;
  currentFile: string;
  stage?: string;
  filePercent?: number;
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

    -- The player's rival on a layout, per class (car_type '' ) or per car: a real driver about
    -- 0.3 s ahead, or a ghost time. A target stays until it is beaten or replaced, so the
    -- ended rows are the ladder the player climbed. User state, not a cache: never cleared.
    CREATE TABLE IF NOT EXISTS rival_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_key TEXT NOT NULL,
      car_class TEXT NOT NULL,
      car_type TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      driver_name TEXT,
      target_time REAL NOT NULL,
      start_time REAL NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      set_at INTEGER NOT NULL,
      ended_at INTEGER,
      beaten_time REAL,
      beaten_session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rival_targets_scope ON rival_targets(layout_key, car_class, car_type, status);

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

    -- Normalized replay facts (server/core/replay/dbReplayLapStore.ts): each fact once, at its own
    -- level (replay -> driver -> lap), instead of copied into every lap blob. Replay-wide conditions
    -- and events are keyed by time; a lap gets its conditions by joining on its time span.

    -- One row per replay whose replay-wide facts are stored, and the decode they came from.
    CREATE TABLE IF NOT EXISTS replay_facts (
      filename TEXT PRIMARY KEY,
      source_version TEXT NOT NULL,
      end_sec REAL NOT NULL,
      session_running_order TEXT,
      updated_at INTEGER NOT NULL
    );

    -- One row per driver per lap: the lap's timing facts. start_sec / end_sec are the replay times
    -- of the lap's first and last stored sample (null when the lap's points are not stored).
    CREATE TABLE IF NOT EXISTS replay_laps (
      filename TEXT NOT NULL,
      driver_slot INTEGER NOT NULL,
      lap_number INTEGER NOT NULL,
      start_sec REAL,
      end_sec REAL,
      lap_time_sec REAL,
      s1_sec REAL,
      s2_sec REAL,
      s3_sec REAL,
      lap_dist_m REAL,
      is_outlap INTEGER,
      is_valid INTEGER,
      is_best INTEGER,
      start_frame INTEGER,
      end_frame INTEGER,
      source_version TEXT NOT NULL,
      PRIMARY KEY (filename, driver_slot, lap_number)
    );
    CREATE INDEX IF NOT EXISTS idx_replay_laps_time ON replay_laps(filename, start_sec);

    -- Replay-wide conditions over time, one row per change: weather (rain 0-255 as decoded, ambient
    -- °C) and the track flag packet (slot 255, the same for every car). Null = not recorded yet.
    CREATE TABLE IF NOT EXISTS replay_conditions (
      filename TEXT NOT NULL,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      rain INTEGER,
      ambient_c REAL,
      flag_state INTEGER,
      -- Raw bytes 1 and 2 of the flag packet, meaning unconfirmed (docs/VCR_ANALYSIS.md 2.6).
      sector_mask INTEGER,
      driver_flag INTEGER,
      PRIMARY KEY (filename, start_sec)
    );

    -- Events of one car at one moment: 'pit', 'contact', 'penalty_given', 'penalty_served'. seq is
    -- the event's place in the decoded array, so the arrays rebuild in their original order; detail
    -- holds the fields without a column, as JSON.
    CREATE TABLE IF NOT EXISTS replay_driver_events (
      filename TEXT NOT NULL,
      kind TEXT NOT NULL,
      seq INTEGER NOT NULL,
      driver_slot INTEGER NOT NULL,
      time_sec REAL NOT NULL,
      code INTEGER,
      value REAL,
      other_slot INTEGER,
      detail TEXT,
      PRIMARY KEY (filename, kind, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_replay_driver_events_slot ON replay_driver_events(filename, driver_slot, time_sec);

    -- The running order over the replay (P1 first), only where it changes.
    CREATE TABLE IF NOT EXISTS replay_running_order (
      filename TEXT NOT NULL,
      time_sec REAL NOT NULL,
      order_json TEXT NOT NULL,
      PRIMARY KEY (filename, time_sec)
    );

    -- Recreated on every start so a changed definition reaches existing databases. The lower bound
    -- (the row holding at the lap's start) keeps the join an index range: without it every lap
    -- scans all earlier rows, 0.7 s on a 6,000-row replay.
    DROP VIEW IF EXISTS replay_lap_conditions;
    CREATE VIEW replay_lap_conditions AS
    SELECT l.filename, l.driver_slot, l.lap_number,
           MAX(c.rain) AS max_rain,
           (SELECT c2.rain FROM replay_conditions c2
             WHERE c2.filename = l.filename AND c2.start_sec <= l.start_sec
             ORDER BY c2.start_sec DESC LIMIT 1) AS rain_at_start,
           MIN(c.ambient_c) AS min_ambient_c,
           MAX(CASE WHEN c.flag_state IN (3, 4, 5, 6) THEN 1 ELSE 0 END) AS full_course_yellow
    FROM replay_laps l
    JOIN replay_conditions c
      ON c.filename = l.filename
     AND c.start_sec >= COALESCE((SELECT MAX(c3.start_sec) FROM replay_conditions c3
                                   WHERE c3.filename = l.filename AND c3.start_sec <= l.start_sec), l.start_sec)
     AND c.start_sec < l.end_sec AND c.end_sec > l.start_sec
    GROUP BY l.filename, l.driver_slot, l.lap_number;

    -- Every car's low-rate track position through a replay, built from its stored laps (the
    -- signature says which), to find who was close to whom and where.
    CREATE TABLE IF NOT EXISTS replay_race_positions (
      filename TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      positions_br BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_trajectory_defaults (
      filename TEXT NOT NULL,
      driver_slot INTEGER NOT NULL,
      default_lap_key INTEGER,
      resolved_driver_slot INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (filename, driver_slot)
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

    -- The outcome of decoding one driver of a replay file, for that file version and parser version:
    -- a driver already stored or that failed is not decoded again until either changes.
    CREATE TABLE IF NOT EXISTS replay_ingest_drivers (
      filename TEXT NOT NULL,
      driver_slot INTEGER NOT NULL,
      file_mtime INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      parser_version TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      attempted_at INTEGER NOT NULL,
      PRIMARY KEY (filename, driver_slot)
    );

    -- Session -> replay links withdrawn because the replay fails the matching rules. The session row
    -- no longer names the replay; previous_link_json keeps what it held, so a withdrawal can be undone.
    CREATE TABLE IF NOT EXISTS rejected_replay_links (
      session_id TEXT NOT NULL,
      replay_filename TEXT NOT NULL,
      reason TEXT NOT NULL,
      previous_link_json TEXT NOT NULL,
      rejected_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, replay_filename)
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
