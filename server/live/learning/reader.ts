import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { StoredLearningEvent } from '../../../shared/types/liveLearning.js';
import type { LearningReadRequest } from './readEvents.js';

/** Serial coordinator owns concurrency; wait for actual worker exit to release native DuckDB handles. */
export function readLearningEventsInWorker(request: LearningReadRequest): Promise<StoredLearningEvent[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'readerWorkerBootstrap.mjs']), { workerData: request });
    let events: StoredLearningEvent[] | null = null;
    let failure: Error | null = null;
    const timer = setTimeout(() => { failure = new Error('Learning evidence read timed out'); void worker.terminate(); }, 30_000);
    timer.unref();
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<{ type: 'events'; events: StoredLearningEvent[] } | { type: 'failed'; error: string }>(message, ['events', 'failed'])) return;
      if (message.type === 'events') events = message.events;
      else failure = new Error(message.error);
    });
    worker.on('error', error => { failure = error instanceof Error ? error : new Error(String(error)); });
    worker.on('exit', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (events !== null && code === 0) resolve(events);
      else reject(new Error(`Learning reader exited without evidence (${code})`));
    });
  });
}
