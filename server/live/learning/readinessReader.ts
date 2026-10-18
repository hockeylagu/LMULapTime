import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { LiveLearningReadinessReport } from '../../../shared/types/liveLearning.js';

export class LearningReadinessError extends Error {
  public constructor(public readonly status: number, message: string) { super(message); }
}
export type ReadLearningReadiness = (filename: string, signal: AbortSignal) => Promise<LiveLearningReadinessReport>;
type Answer = { type: 'readiness'; report: LiveLearningReadinessReport } | { type: 'failed'; error: string };

/** No evaluation on the live thread, no raw-file reads, one bounded request, no persistent report cache. */
export class LearningReadinessReader {
  private active = false;
  public async read(filename: string, signal: AbortSignal): Promise<LiveLearningReadinessReport> {
    if (signal.aborted) throw new DOMException('Learning readiness cancelled', 'AbortError');
    if (this.active) throw new LearningReadinessError(503, 'Learning evidence is already being checked. Try again shortly.');
    this.active = true;
    try {
      return await new Promise<LiveLearningReadinessReport>((resolve, reject) => {
        const worker = new Worker(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'readinessWorkerBootstrap.mjs']), { workerData: filename });
        let answer: Answer | null = null;
        let failure: Error | null = null;
        const cancel = (): void => { failure = new DOMException('Learning readiness cancelled', 'AbortError'); void worker.terminate(); };
        const timer = setTimeout(() => {
          failure = new LearningReadinessError(503, 'Learning evidence check timed out. Try again after ingestion finishes.');
          void worker.terminate();
        }, 15_000);
        timer.unref();
        signal.addEventListener('abort', cancel, { once: true });
        worker.on('message', (message: unknown) => {
          if (isWorkerMessage<Answer>(message, ['readiness', 'failed'])) answer = message;
        });
        worker.on('error', error => { failure = error instanceof Error ? error : new Error(String(error)); });
        worker.on('exit', code => {
          clearTimeout(timer); signal.removeEventListener('abort', cancel);
          if (failure) reject(failure);
          else if (answer?.type === 'readiness' && code === 0) resolve(answer.report);
          else if (answer?.type === 'failed') reject(new LearningReadinessError(500, answer.error));
          else reject(new LearningReadinessError(500, `Learning evidence reader exited without a report (${code})`));
        });
      });
    } finally { this.active = false; }
  }
}
