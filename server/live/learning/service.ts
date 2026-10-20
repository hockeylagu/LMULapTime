import type { Database } from 'better-sqlite3';
import { buildLearningExamples } from '../../../shared/domain/learning/examples.js';
import type { StoredLearningEvent } from '../../../shared/types/liveLearning.js';
import { getLiveCaptureIndexRows } from '../../core/live/dbLiveCaptureStore.js';
import { getLearningSource, replaceLearningExamples, setLearningSource } from '../../core/live/dbLiveLearningStore.js';
import { readLearningEventsInWorker } from './reader.js';
import type { LearningReadRequest } from './readEvents.js';
import { learningProjectionInputs } from './inputs.js';

/** Rebuild compact projections after reconciliation, serially and off track. No model is enabled here. */
export async function refreshLiveLearning(db: Database, directory: string, sessionLoaded: () => boolean,
  read: (request: LearningReadRequest) => Promise<StoredLearningEvent[]> = readLearningEventsInWorker): Promise<number> {
  let rebuilt = 0;
  for (const entry of getLiveCaptureIndexRows(db)) {
    if (sessionLoaded() || rebuilt >= 4) break;
    const manifest = entry.manifest;
    if (entry.matchStatus !== 'verified' || !manifest.sessionId || manifest.status === 'recording') continue;
    const inputs = learningProjectionInputs(db, entry);
    if (!inputs) { setLearningSource(db, manifest.recordingId, '', 'stale', 'Capture ownership is no longer unique/current'); continue; }
    const { signature, laps } = inputs;
    const previous = getLearningSource(db, manifest.recordingId);
    if (previous?.signature === signature && previous.state === 'ready') continue;
    if (previous?.signature === signature && previous.state === 'failed' && Date.now() - previous.updated_at < 60_000) continue;
    setLearningSource(db, manifest.recordingId, signature, 'stale');
    if (!entry.available) continue;
    rebuilt++;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Captures rebuild one at a time: each reads a large recording and writes SQLite.
      const events = await read({ directory, manifest });
      if (sessionLoaded()) break;
      const current = getLiveCaptureIndexRows(db).find(item => item.manifest.recordingId === manifest.recordingId);
      if (!current?.available || learningProjectionInputs(db, current)?.signature !== signature) continue;
      replaceLearningExamples(db, manifest.recordingId, signature, buildLearningExamples(manifest, entry.matchVersion, laps, events));
    } catch (error) {
      setLearningSource(db, manifest.recordingId, signature, 'failed', error instanceof Error ? error.message : String(error));
    }
  }
  return rebuilt;
}
