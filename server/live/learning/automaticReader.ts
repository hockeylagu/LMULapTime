import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { AutomaticLearningState } from '../../../shared/domain/learning/automatic.js';

type Answer = { type: 'models'; state: AutomaticLearningState } | { type: 'failed'; error: string };
/** One off-track evaluation; completion waits for worker exit, including cancellation. */
export function readAutomaticLearning(filename: string, signal: AbortSignal): Promise<AutomaticLearningState> {
  if (signal.aborted) return Promise.reject(new DOMException('Automatic learning cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'automaticWorkerBootstrap.mjs']), { workerData: filename });
    let answer: Answer | null = null;
    let failure: Error | null = null;
    const cancel = (): void => { failure = new DOMException('Automatic learning cancelled', 'AbortError'); void worker.terminate(); };
    const timer = setTimeout(() => { failure = new Error('Automatic learning timed out'); void worker.terminate(); }, 15_000);
    timer.unref(); signal.addEventListener('abort', cancel, { once: true });
    worker.on('message', (message: unknown) => { if (isWorkerMessage<Answer>(message, ['models', 'failed'])) answer = message; });
    worker.on('error', error => { failure = error instanceof Error ? error : new Error(String(error)); });
    worker.on('exit', code => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (failure) reject(failure);
      else if (answer?.type === 'models' && code === 0) resolve(answer.state);
      else reject(new Error(answer?.type === 'failed' ? answer.error : `Automatic learning exited without a result (${code})`));
    });
  });
}
