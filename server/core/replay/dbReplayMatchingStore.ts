import type { Database } from 'better-sqlite3';
import type { ReplayMetadata } from '../types.js';
import type { ReplayFileEntry } from '../../sessions/sessionXmlTypes.js';
import { replayIndexEntryFromStored, REPLAY_MATCH_WINDOW_MS, type ReplayMatchTarget } from '../../sessions/replayMatching.js';
import { getStoredReplayFileInfo } from './dbReplayMetadataStore.js';

export const REPLAY_MATCHING_PROJECTION_VERSION = 1;

/** Compact persistent matching facts avoid hydrating every compressed replay roster at startup. */
export function writeReplayMatchingFacts(db: Database, filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void {
  const entry = replayIndexEntryFromStored({ filename, file_path: filePath, file_mtime: mtime, file_size: size, metadata });
  const start = mtime - Math.round((entry.durationSec || 0) * 1000);
  db.prepare('UPDATE replay_metadata SET matching_json=?,recording_start_ms=?,matching_version=? WHERE filename=?')
    .run(JSON.stringify(entry), start, REPLAY_MATCHING_PROJECTION_VERSION, filename);
}

export function initReplayMatchingSchema(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(replay_metadata)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'matching_json')) db.exec('ALTER TABLE replay_metadata ADD COLUMN matching_json TEXT');
  if (!columns.some(column => column.name === 'recording_start_ms')) db.exec('ALTER TABLE replay_metadata ADD COLUMN recording_start_ms INTEGER');
  if (!columns.some(column => column.name === 'matching_version')) db.exec('ALTER TABLE replay_metadata ADD COLUMN matching_version INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_replay_matching_end ON replay_metadata(file_mtime);
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
        writeReplayMatchingFacts(db, filename, stored.file_path, stored.file_mtime, stored.file_size, stored.metadata);
      }
    })();
  }
}

interface MatchingRow { filename: string; file_path: string; file_mtime: number; file_size: number; matching_json: string; }
function entry(row: MatchingRow): ReplayFileEntry {
  // Archive renames update authoritative identity columns; compact facts need no blob rewrite.
  return { ...JSON.parse(row.matching_json) as ReplayFileEntry, name: row.filename, path: row.file_path,
    mtime: row.file_mtime, sizeBytes: row.file_size };
}
const columns = 'filename,file_path,file_mtime,file_size,matching_json';

export function getReplayMatchingEntry(db: Database, filename: string): ReplayFileEntry | undefined {
  const row = db.prepare(`SELECT ${columns} FROM replay_metadata WHERE filename=?`).get(filename) as MatchingRow | undefined;
  return row ? entry(row) : undefined;
}

/** Replays whose recording span [start, end] overlaps [fromMs, toMs]. */
export function getReplayMatchingEntriesOverlapping(db: Database, fromMs: number, toMs: number): ReplayFileEntry[] {
  const rows = db.prepare(`SELECT ${columns} FROM replay_metadata
    WHERE file_mtime >= ? AND coalesce(recording_start_ms, file_mtime) <= ? ORDER BY file_mtime DESC,rowid`).all(fromMs, toMs);
  return (rows as MatchingRow[]).map(entry);
}

export function getReplayMatchingEntries(db: Database, target?: ReplayMatchTarget): ReplayFileEntry[] {
  const rows = target ? db.prepare(`SELECT ${columns} FROM replay_metadata
    WHERE file_mtime BETWEEN ? AND ? OR recording_start_ms BETWEEN ? AND ? ORDER BY file_mtime DESC,rowid`)
    .all(target.xmlFileMtimeMs - REPLAY_MATCH_WINDOW_MS, target.xmlFileMtimeMs + REPLAY_MATCH_WINDOW_MS,
      target.sessionTimestampMs - REPLAY_MATCH_WINDOW_MS, target.sessionTimestampMs + REPLAY_MATCH_WINDOW_MS) :
    db.prepare(`SELECT ${columns} FROM replay_metadata ORDER BY file_mtime DESC,rowid`).all();
  return (rows as MatchingRow[]).map(entry);
}
