import { findWorkerBootstrap, runWorkerOnce } from '../../core/workerThreads.js';
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
      const answer = await runWorkerOnce<Answer>(findWorkerBootstrap(import.meta.url, ['live', 'learning', 'readinessWorkerBootstrap.mjs']),
        filename, ['readiness', 'failed'], {
          timeoutMs: 15_000,
          timeoutError: () => new LearningReadinessError(503, 'Learning evidence check timed out. Try again after ingestion finishes.'),
          missingError: code => new LearningReadinessError(500, `Learning evidence reader exited without a report (${code})`),
          abort: { signal, error: () => new DOMException('Learning readiness cancelled', 'AbortError') },
        });
      if (answer.type === 'failed') throw new LearningReadinessError(500, answer.error);
      return answer.report;
    } finally { this.active = false; }
  }
}
