import { findWorkerBootstrap, runWorkerOnce } from '../../core/workerThreads.js';
import type { AutomaticLearningState } from '../../../shared/domain/learning/automatic.js';

type Answer = { type: 'models'; state: AutomaticLearningState } | { type: 'failed'; error: string };
/** One off-track evaluation; completion waits for worker exit, including cancellation. */
export async function readAutomaticLearning(filename: string, signal: AbortSignal): Promise<AutomaticLearningState> {
  const answer = await runWorkerOnce<Answer>(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'automaticWorkerBootstrap.mjs']),
    filename, ['models', 'failed'], {
      timeoutMs: 15_000,
      timeoutError: () => new Error('Automatic learning timed out'),
      missingError: code => new Error(`Automatic learning exited without a result (${code})`),
      abort: { signal, error: () => new DOMException('Automatic learning cancelled', 'AbortError') },
    });
  if (answer.type === 'failed') throw new Error(answer.error);
  return answer.state;
}
