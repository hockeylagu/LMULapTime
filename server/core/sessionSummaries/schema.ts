import type { Database as DatabaseType } from 'better-sqlite3';
import { initSessionAggregateSchema } from './aggregateStore.js';

export function initSessionSummarySchema(db: DatabaseType): void {
  initSessionAggregateSchema(db);
  const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  const addColumn = (name: string, ddl: string) => { if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${ddl}`); };
  addColumn('layout_key', 'layout_key TEXT NOT NULL DEFAULT \'unknown\'');
  addColumn('source_revision', 'source_revision INTEGER NOT NULL DEFAULT 0');
  addColumn('projection_revision', 'projection_revision INTEGER NOT NULL DEFAULT 0');
  addColumn('projection_version', 'projection_version INTEGER NOT NULL DEFAULT 0');
  addColumn('summary_json', 'summary_json TEXT');
  addColumn('recording_name', 'recording_name TEXT');
  addColumn('session_kind', 'session_kind TEXT NOT NULL DEFAULT \'unknown\'');
  addColumn('primary_driver_ordinal', 'primary_driver_ordinal INTEGER');
  addColumn('is_empty', 'is_empty INTEGER NOT NULL DEFAULT 1');
  addColumn('projection_error', 'projection_error TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_metadata(matched_session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_layout_timestamp ON sessions(layout_key, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_layout_kind_timestamp ON sessions(layout_key, session_kind, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_recording ON sessions(recording_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_track_course ON sessions(track_venue, track_course);
    -- Reconciliation candidates (dbReconciliationStore): changed rows and XML end times near a replay.
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_file_mtime ON sessions(file_mtime);
    CREATE TABLE IF NOT EXISTS session_driver_condition_summaries (
      session_id TEXT NOT NULL, driver_ordinal INTEGER NOT NULL, condition_group TEXT NOT NULL,
      clean_count INTEGER NOT NULL, clean_time_sum REAL NOT NULL, clean_time_square_sum REAL NOT NULL,
      best_lap_ordinal INTEGER, best_lap_time REAL, best_s1 REAL, best_s2 REAL, best_s3 REAL,
      fastest_three_count INTEGER NOT NULL, fastest_three_time_sum REAL NOT NULL,
      PRIMARY KEY(session_id, driver_ordinal, condition_group)
    );
  `);
}
