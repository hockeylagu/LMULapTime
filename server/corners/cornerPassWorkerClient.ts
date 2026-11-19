import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { CornerPassInput, CornerPassResult, SequenceLapInput } from './cornerPassBuild.js';
import type { SequenceLap } from '../../shared/domain/cornerSequences/sequenceMap.js';

type WorkerMessage<T> =
  | { type: 'result'; result: T }
  | { type: 'error'; message: string };

const bootstrapPath = (): string => findWorkerBootstrap(import.meta.url, ['corners', 'cornerPassWorkerBootstrap.mjs']);

function runJob<T>(job: { kind: string; input: unknown }, workerPath: string | URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: job });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
      void worker.terminate();
    };
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<WorkerMessage<T>>(message, ['result', 'error'])) return;
      finish(() => (message.type === 'result' ? resolve(message.result) : reject(new Error(message.message))));
    });
    worker.on('error', (error: Error) => finish(() => reject(error)));
    worker.on('exit', (code) => finish(() => reject(new Error(`Corner pass worker exited with code ${code} before returning a result`))));
  });
}

/**
 * Builds a replay's corner passes and sequence passes on a worker thread: every stored lap of every car is decoded
 * at full rate and placed on the centre line, tens of seconds of CPU on a long race.
 */
export function buildCornerPassesInWorker(input: CornerPassInput, workerPath: string | URL = bootstrapPath()): Promise<CornerPassResult> {
  return runJob({ kind: 'passes', input }, workerPath);
}

/** Reads a sequence map's laps on a worker thread (each lap decoded and placed on the centre line). */
export function readSequenceLapsInWorker(input: SequenceLapInput, workerPath: string | URL = bootstrapPath()): Promise<SequenceLap[]> {
  return runJob({ kind: 'sequenceLaps', input }, workerPath);
}
