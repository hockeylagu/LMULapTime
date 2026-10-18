import { findWorkerBootstrap, runWorkerOnce } from '../../core/workerThreads.js';
import type { StoredLearningEvent } from '../../../shared/types/liveLearning.js';
import type { LearningReadRequest } from './readEvents.js';

type Answer = { type: 'events'; events: StoredLearningEvent[] } | { type: 'failed'; error: string };

/** Serial coordinator owns concurrency; wait for actual worker exit to release native DuckDB handles. */
export async function readLearningEventsInWorker(request: LearningReadRequest): Promise<StoredLearningEvent[]> {
  const answer = await runWorkerOnce<Answer>(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'readerWorkerBootstrap.mjs']),
    request, ['events', 'failed'], {
      timeoutMs: 30_000,
      timeoutError: () => new Error('Learning evidence read timed out'),
      missingError: code => new Error(`Learning reader exited without evidence (${code})`),
    });
  if (answer.type === 'failed') throw new Error(answer.error);
  return answer.events;
}
