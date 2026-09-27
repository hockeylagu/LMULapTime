import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayMetadata, SessionMetadata } from './types.js';
import { getStoredReplayFileInfo, StoredReplayFileInfo } from './dbReplayMetadataStore.js';

// A replay's rows are keyed by its filename, but a filename does not name one recording: LMU can
// write a new recording under a name already in the cache (a restarted practice keeps its file, a
// counter can start over). The stored rows may be the only copy of the older recording, so before a
// different recording takes the name, the stored one is renamed, never overwritten.

// Same start within this margin: the same recording saved again (e.g. a partial file, then the whole).
export const SAME_RECORDING_START_TOLERANCE_MS = 60_000;

interface RecordingFacts {
  mtime: number;
  size: number;
  metadata: ReplayMetadata;
}

function sceneOf(metadata: ReplayMetadata): string | undefined {
  return metadata.sceneDesc || metadata.eventInfo?.sceneDesc || undefined;
}

// A replay is saved when its recording ends, so its start is the mtime minus the recorded duration.
function recordingStartMs(recording: RecordingFacts): number {
  return recording.mtime - Math.round((recording.metadata.durationSec ?? 0) * 1000);
}

/** True when `next` is the stored recording saved again rather than another recording under its name. */
export function isSameRecording(stored: StoredReplayFileInfo, next: RecordingFacts): boolean {
  if (stored.file_mtime === next.mtime && stored.file_size === next.size) return true;
  const storedScene = sceneOf(stored.metadata);
  const nextScene = sceneOf(next.metadata);
  if (storedScene && nextScene && storedScene !== nextScene) return false;
  const storedStart = recordingStartMs({ mtime: stored.file_mtime, size: stored.file_size, metadata: stored.metadata });
  return Math.abs(storedStart - recordingStartMs(next)) <= SAME_RECORDING_START_TOLERANCE_MS;
}

/** "Spa P1 80.Vcr" saved at 2026-08-28T19:29:31Z -> "Spa P1 80 @2026-08-28T19-29-31Z.Vcr". */
export function archivedReplayName(filename: string, mtime: number): string {
  const stamp = new Date(mtime).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
  return `${filename.replace(/\.vcr$/i, '')} @${stamp}.Vcr`;
}

function freeReplayName(db: DatabaseType, candidate: string): string {
  const taken = db.prepare('SELECT 1 FROM replay_metadata WHERE filename = ?');
  if (!taken.get(candidate)) return candidate;
  for (let n = 2; ; n++) {
    const numbered = candidate.replace(/\.Vcr$/, ` (${n}).Vcr`);
    if (!taken.get(numbered)) return numbered;
  }
}

/**
 * Renames every row of a stored replay, and every reference to it, to `newName` in one transaction.
 * Its file_path moves to the new name too, which is not on disk: readers then treat it as a replay
 * LMU has deleted and serve it from the stored rows.
 */
function renameStoredReplay(db: DatabaseType, filename: string, storedPath: string, newName: string): void {
  const newPath = path.join(path.dirname(storedPath), newName);
  db.transaction(() => {
    db.prepare('UPDATE replay_metadata SET filename = ?, file_path = ? WHERE filename = ?').run(newName, newPath, filename);
    db.prepare('UPDATE replay_trajectories SET filename = ?, source_path = ? WHERE filename = ?').run(newName, newPath, filename);
    db.prepare('UPDATE replay_trajectory_defaults SET filename = ? WHERE filename = ?').run(newName, filename);
    db.prepare('UPDATE telemetry_metadata SET matched_replay_filename = ? WHERE matched_replay_filename = ?').run(newName, filename);
    db.prepare('UPDATE ai_reports SET replay_name = ? WHERE replay_name = ?').run(newName, filename);
    db.prepare('UPDATE ai_reports SET baseline_replay_name = ? WHERE baseline_replay_name = ?').run(newName, filename);
    db.prepare('UPDATE rejected_replay_links SET replay_filename = ? WHERE replay_filename = ?').run(newName, filename);

    // The sessions matched to the stored recording keep it under its new name.
    const linked = db.prepare(
      "SELECT id, metadata_json, data_json FROM sessions WHERE json_extract(metadata_json, '$.matchingReplayFile.name') = ?"
    ).all(filename) as Array<{ id: string; metadata_json: string; data_json: string }>;
    const update = db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?');
    for (const row of linked) {
      const meta = JSON.parse(row.metadata_json) as SessionMetadata;
      const data = JSON.parse(row.data_json) as SessionMetadata;
      for (const session of [meta, data]) {
        if (session.matchingReplayFile) session.matchingReplayFile = { ...session.matchingReplayFile, name: newName, path: newPath };
      }
      update.run(JSON.stringify(meta), JSON.stringify(data), Date.now(), row.id);
    }
  })();
}

/**
 * Called before `filename` is stored as the recording described by `next`: when the stored rows
 * under that name hold a different recording, they are renamed out of the way. Returns the name
 * the stored recording now has, or null when there was nothing to move.
 */
export function archiveReplacedRecording(db: DatabaseType, filename: string, next: RecordingFacts): string | null {
  const stored = getStoredReplayFileInfo(db, filename);
  if (!stored || isSameRecording(stored, next)) return null;
  const newName = freeReplayName(db, archivedReplayName(filename, stored.file_mtime));
  renameStoredReplay(db, filename, stored.file_path, newName);
  return newName;
}
