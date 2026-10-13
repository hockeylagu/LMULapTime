import type { Database } from 'better-sqlite3';
import { getStoredReplayFileInfo } from './dbReplayMetadataStore.js';
import { REPLAY_MATCHING_PROJECTION_VERSION, writeReplayMatchingFacts } from './dbReplayMatchingStore.js';

export function initReplayMatchingSchema(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(replay_metadata)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'matching_json')) db.exec('ALTER TABLE replay_metadata ADD COLUMN matching_json TEXT');
  if (!columns.some(column => column.name === 'recording_start_ms')) db.exec('ALTER TABLE replay_metadata ADD COLUMN recording_start_ms INTEGER');
  if (!columns.some(column => column.name === 'matching_version')) db.exec('ALTER TABLE replay_metadata ADD COLUMN matching_version INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_replay_matching_end ON replay_metadata(file_mtime_ms);
    CREATE INDEX IF NOT EXISTS idx_replay_matching_start ON replay_metadata(recording_start_ms);
    CREATE INDEX IF NOT EXISTS idx_replay_metadata_updated ON replay_metadata(updated_at);`);
  // One-time additive migration from authoritative retained metadata, never the source VCR.
  const pending = db.prepare('SELECT filename FROM replay_metadata WHERE matching_json IS NULL OR matching_version != ? LIMIT 50');
  while (true) {
    const batch = pending.all(REPLAY_MATCHING_PROJECTION_VERSION) as Array<{ filename: string }>;
    if (!batch.length) break;
    db.transaction(() => {
      for (const { filename } of batch) {
        const stored = getStoredReplayFileInfo(db, filename)!;
        writeReplayMatchingFacts(db, filename, stored.file_path, stored.file_mtime_ms, stored.file_size_bytes, stored.metadata);
      }
    })();
  }
}
