import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { LapPoses } from './racePoses.js';

export type KeyedLapPoses = LapPoses & { key: string };

type WorkerMessage =
  | { type: 'result'; poses: KeyedLapPoses[] }
  | { type: 'error'; message: string };

const bootstrapPath = (): string => findWorkerBootstrap(import.meta.url, ['traffic', 'racePosesWorkerBootstrap.mjs']);

/**
 * Resamples stored laps for the race replay on a worker thread: decoding a window's laps (about 70
 * at Le Mans) takes around a second of CPU, which must not block the server.
 */
export function resampleLapsInWorker(
  laps: Array<{ key: string; blob: Uint8Array }>,
  hz: number,
  workerPath: string | URL = bootstrapPath()
): Promise<KeyedLapPoses[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { laps, hz } });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
      void worker.terminate();
    };
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<WorkerMessage>(message, ['result', 'error'])) return;
      finish(() => (message.type === 'result' ? resolve(message.poses) : reject(new Error(message.message))));
    });
    worker.on('error', (error: Error) => finish(() => reject(error)));
    worker.on('exit', (code) => finish(() => reject(new Error(`Race poses worker exited with code ${code} before returning a result`))));
  });
}
