import { parentPort, workerData } from 'node:worker_threads';
import { ReplayTrajectoryData } from '../../../shared/types/index.js';
import { ExtractReplayTrajectoryOptions, extractReplayTrajectory, extractReplayDriverTrajectories } from '../decode/replayTrajectory.js';
import { ReplayStreamProgress } from '../replayProgress.js';
import Database from 'better-sqlite3';
import { replaceReplayDriverLaps, type ReplayDriverSave, type EncodedReplayLap } from '../../core/replay/dbReplayDriverStore.js';
import { compressTrajectory } from '../../core/replay/replayTrajectoryCodec.js';
import { withoutReplayFacts } from '../decode/replayFacts.js';
import type { StoredReplayDriver, StoredReplayDrivers, ReplayDriversSave } from './replayTrajectoryWorkerClient.js';

interface ReplayWorkerData {
  filePath: string;
  options: ExtractReplayTrajectoryOptions;
  save?: ReplayDriverSave & { dbPath: string };
  batch?: ReplayDriversSave & { filePath: string; dbPath: string };
}

type ReplayWorkerMessage =
  | { type: 'progress'; progress: ReplayStreamProgress }
  | { type: 'result'; trajectory: ReplayTrajectoryData }
  | { type: 'stored'; summary: StoredReplayDriver }
  | { type: 'storedDrivers'; summary: StoredReplayDrivers }
  | { type: 'error'; message: string; code?: string };

const port = parentPort;
const input = workerData as ReplayWorkerData;

if (!port) {
  throw new Error('Replay trajectory worker requires a parent port');
}

let saving = false;
try {
  if (input.batch) {
    saving = true;
    const batch = input.batch;
    const db = new Database(batch.dbPath, { fileMustExist: true, timeout: 5000 });
    const summary: StoredReplayDrivers = { drivers: [], failures: [] };
    let first = true;
    const encoded = new Map<number, EncodedReplayLap[]>();
    const failure = (slot: number | undefined, isPrimary: boolean, error: unknown, storage: boolean): void => {
      const code = (error as NodeJS.ErrnoException)?.code;
      summary.failures.push({ driverSlotKey: slot ?? -1, isPrimary,
        message: error instanceof Error ? error.message : String(error),
        ...(typeof code === 'string' ? { code } : storage ? { code: 'REPLAY_SAVE_FAILED' } : {}),
      });
    };
    try {
      if (db.pragma('journal_mode', { simple: true }) !== 'wal') throw new Error('Replay worker requires a WAL database');
      db.pragma('synchronous = NORMAL');
      saving = false;
      let total = new Set(batch.driverSlots).size + Number(batch.includePrimary);
      for (const trajectory of extractReplayDriverTrajectories(input.filePath, {
        ...input.options, driverSlots: batch.driverSlots, includePrimary: batch.includePrimary,
        silent: true,
        onProgress: progress => {
          if (progress.stage === 'metadata' && batch.includePrimary && progress.driverSlot !== undefined && batch.driverSlots.includes(progress.driverSlot)) total--;
          port.postMessage({ type: 'progress', progress } satisfies ReplayWorkerMessage);
        },
        onLapResult: lap => {
          try {
            const slot = lap.driverSlot ?? -1;
            let rows = encoded.get(slot);
            if (!rows) { rows = []; encoded.set(slot, rows); }
            rows.push({ lapKey: lap.currentLap ?? -1, pointsCount: lap.points.length,
              blob: compressTrajectory(withoutReplayFacts(lap, slot >= 0 ? slot : null)) });
            return { ...lap, points: lap.points.length > 1 ? [lap.points[0], lap.points[lap.points.length - 1]] : lap.points };
          } catch (error) {
            throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { code: 'REPLAY_SAVE_FAILED' });
          }
        },
        onDriverError: (slot, error) => {
          encoded.delete(slot ?? -1);
          failure(slot, first && batch.includePrimary, error, false);
          first = false;
        },
      })) {
        const isPrimary = first && batch.includePrimary;
        first = false;
        const slot = trajectory.driverSlot ?? -1;
        port.postMessage({ type: 'progress', progress: { stage: 'caching', stageDescription: 'Persisting driver trajectory cache',
          percent: 100, driverSlot: slot, driversDone: summary.drivers.length, driversTotal: total } } satisfies ReplayWorkerMessage);
        try {
          replaceReplayDriverLaps(db, { ...batch, driverSlotKey: slot, isPrimary }, trajectory, true, encoded.get(slot));
          summary.drivers.push({ driverSlotKey: slot, isPrimary, driverSlot: trajectory.driverSlot, currentLap: trajectory.currentLap });
          port.postMessage({ type: 'progress', progress: { stage: 'caching', stageDescription: 'Saved driver trajectory cache',
            percent: 100, driverSlot: slot, driverStored: true, driversDone: summary.drivers.length, driversTotal: total } } satisfies ReplayWorkerMessage);
        } catch (error) {
          failure(slot, isPrimary, error, true);
        } finally {
          encoded.delete(slot);
        }
      }
    } finally {
      db.close();
    }
    port.postMessage({ type: 'storedDrivers', summary } satisfies ReplayWorkerMessage);
  } else {
    const trajectory = extractReplayTrajectory(input.filePath, {
      ...input.options,
      silent: true,
      onProgress: (progress) => port.postMessage({ type: 'progress', progress } satisfies ReplayWorkerMessage),
    });
    if (input.save) {
      saving = true;
      port.postMessage({ type: 'progress', progress: { stage: 'caching', stageDescription: 'Persisting trajectory cache', percent: 100, driverSlot: trajectory.driverSlot } } satisfies ReplayWorkerMessage);
      // The coordinator owns schema initialization. This connection only writes an existing WAL cache.
      const db = new Database(input.save.dbPath, { fileMustExist: true, timeout: 5000 });
      try {
        if (db.pragma('journal_mode', { simple: true }) !== 'wal') throw new Error('Replay worker requires a WAL database');
        db.pragma('synchronous = NORMAL');
        replaceReplayDriverLaps(db, input.save, trajectory, true);
      } finally {
        db.close();
      }
      port.postMessage({ type: 'stored', summary: { driverSlot: trajectory.driverSlot, currentLap: trajectory.currentLap } } satisfies ReplayWorkerMessage);
    } else {
      port.postMessage({ type: 'result', trajectory } satisfies ReplayWorkerMessage);
    }
  }
} catch (error) {
  port.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    // A system error (the file locked or gone) is not the decoder rejecting the file.
    ...(typeof (error as NodeJS.ErrnoException)?.code === 'string' ? { code: (error as NodeJS.ErrnoException).code } : saving ? { code: 'REPLAY_SAVE_FAILED' } : {}),
  } satisfies ReplayWorkerMessage);
}
