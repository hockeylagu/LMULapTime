import type { Database } from 'better-sqlite3';
import type { ReplayMetadata } from '../../../shared/types/index.js';
import type { ReplayFileEntry } from '../../sessions/sessionXmlTypes.js';
import { replayIndexEntryFromStored, REPLAY_MATCH_WINDOW_MS, type ReplayMatchTarget } from '../../sessions/replayMatching.js';

export const REPLAY_MATCHING_PROJECTION_VERSION = 2;

/** Compact persistent matching facts avoid hydrating every compressed replay roster at startup. */
export function writeReplayMatchingFacts(db: Database, filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, metadata: ReplayMetadata): void {
  const entry = replayIndexEntryFromStored({ filename, file_path: filePath, file_mtime_ms: mtimeMs, file_size_bytes: fileSizeBytes, metadata });
  const start = mtimeMs - Math.round((entry.durationSec || 0) * 1000);
  db.prepare('UPDATE replay_metadata SET matching_json=?,recording_start_ms=?,matching_version=? WHERE filename=?')
    .run(JSON.stringify(entry), start, REPLAY_MATCHING_PROJECTION_VERSION, filename);
}

interface MatchingRow { filename: string; file_path: string; file_mtime_ms: number; file_size_bytes: number; matching_json: string; }
function entry(row: MatchingRow): ReplayFileEntry {
  // Archive renames update authoritative identity columns; compact facts need no blob rewrite.
  return { ...JSON.parse(row.matching_json) as ReplayFileEntry, name: row.filename, path: row.file_path,
    mtimeMs: row.file_mtime_ms, fileSizeBytes: row.file_size_bytes };
}
const columns = 'filename,file_path,file_mtime_ms,file_size_bytes,matching_json';

export function getReplayMatchingEntry(db: Database, filename: string): ReplayFileEntry | undefined {
  const row = db.prepare(`SELECT ${columns} FROM replay_metadata WHERE filename=?`).get(filename) as MatchingRow | undefined;
  return row ? entry(row) : undefined;
}

/** Replays whose recording span [start, end] overlaps [fromMs, toMs]. */
export function getReplayMatchingEntriesOverlapping(db: Database, fromMs: number, toMs: number): ReplayFileEntry[] {
  const rows = db.prepare(`SELECT ${columns} FROM replay_metadata
    WHERE file_mtime_ms >= ? AND coalesce(recording_start_ms, file_mtime_ms) <= ? ORDER BY file_mtime_ms DESC,rowid`).all(fromMs, toMs);
  return (rows as MatchingRow[]).map(entry);
}

export function getReplayMatchingEntries(db: Database, target?: ReplayMatchTarget): ReplayFileEntry[] {
  const rows = target ? db.prepare(`SELECT ${columns} FROM replay_metadata
    WHERE file_mtime_ms BETWEEN ? AND ? OR recording_start_ms BETWEEN ? AND ? ORDER BY file_mtime_ms DESC,rowid`)
    .all(target.xmlFileMtimeMs - REPLAY_MATCH_WINDOW_MS, target.xmlFileMtimeMs + REPLAY_MATCH_WINDOW_MS,
      target.sessionTimestampMs - REPLAY_MATCH_WINDOW_MS, target.sessionTimestampMs + REPLAY_MATCH_WINDOW_MS) :
    db.prepare(`SELECT ${columns} FROM replay_metadata ORDER BY file_mtime_ms DESC,rowid`).all();
  return (rows as MatchingRow[]).map(entry);
}
