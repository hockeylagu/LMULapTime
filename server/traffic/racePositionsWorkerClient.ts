import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap } from '../replay/replayTrajectoryWorkerClient.js';
import type { StoredLapBlob } from './lapSamples.js';
import type { RacePositions } from './racePositions.js';

type WorkerMessage =
  | { type: 'result'; positions: RacePositions }
  | { type: 'error'; message: string };

const bootstrapPath = (): string => findWorkerBootstrap(import.meta.url, ['traffic', 'racePositionsWorkerBootstrap.mjs']);

/**
 * Builds a replay's race positions index on a worker thread: reading every stored lap of every
 * car and projecting it on the track takes seconds of CPU (about 8 s for a 25-lap, 30-car race),
 * which must not block the server.
 */
export function buildRacePositionsInWorker(
  laps: StoredLapBlob[],
  centerline: Array<[number, number]>,
  workerPath: string = bootstrapPath()
): Promise<RacePositions> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { laps, centerline } });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
      void worker.terminate();
    };
    worker.on('message', (message: WorkerMessage) => finish(() => (
      message.type === 'result' ? resolve(message.positions) : reject(new Error(message.message))
    )));
    worker.on('error', (error: Error) => finish(() => reject(error)));
    worker.on('exit', (code) => finish(() => reject(new Error(`Race positions worker exited with code ${code} before returning a result`))));
  });
}
