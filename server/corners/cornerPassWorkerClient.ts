import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { CornerPassInput } from './cornerPassBuild.js';
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';

type WorkerMessage =
  | { type: 'result'; passes: CornerPass[] }
  | { type: 'error'; message: string };

const bootstrapPath = (): string => findWorkerBootstrap(import.meta.url, ['corners', 'cornerPassWorkerBootstrap.mjs']);

/**
 * Builds a replay's corner passes on a worker thread: every stored lap of every car is decoded at
 * full rate and placed on the centre line, tens of seconds of CPU on a long race.
 */
export function buildCornerPassesInWorker(input: CornerPassInput, workerPath: string | URL = bootstrapPath()): Promise<CornerPass[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: input });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
      void worker.terminate();
    };
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<WorkerMessage>(message, ['result', 'error'])) return;
      finish(() => (message.type === 'result' ? resolve(message.passes) : reject(new Error(message.message))));
    });
    worker.on('error', (error: Error) => finish(() => reject(error)));
    worker.on('exit', (code) => finish(() => reject(new Error(`Corner pass worker exited with code ${code} before returning a result`))));
  });
}
