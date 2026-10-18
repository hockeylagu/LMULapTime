import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { LiveEvidenceReadRequest, LiveEvidenceWorkerResult, LiveLapEvidence } from '../../../shared/types/liveEvidence.js';
import { LiveEvidenceReadError } from './readError.js';

/** Independent readers cannot backlog the recorder. Exiting releases native DuckDB handles on Windows. */
export class LiveEvidenceReader {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  /** Two reads run at once; a few more wait their turn (a lap compare), the rest are told to retry. */
  public async read(request: LiveEvidenceReadRequest): Promise<LiveLapEvidence> {
    if (this.active < 2) this.active++;
    else if (this.waiting.length < 2) await new Promise<void>(resolve => this.waiting.push(resolve));
    else throw new LiveEvidenceReadError('busy', 'Several live evidence reads are already waiting; retry shortly');
    try {
      return await new Promise<LiveLapEvidence>((resolve, reject) => {
        const worker = new Worker(findWorkerBootstrap(import.meta.url, ['live', 'capture', 'evidenceReaderWorkerBootstrap.mjs']), { workerData: request });
        let result: LiveEvidenceWorkerResult | null = null;
        let failure: Error | null = null;
        const timer = setTimeout(() => { failure = new LiveEvidenceReadError('busy', 'Live evidence read timed out'); void worker.terminate(); }, 10_000);
        timer.unref();
        worker.on('message', (message: unknown) => {
          if (isWorkerMessage<LiveEvidenceWorkerResult>(message, ['evidence', 'failed'])) result = message;
        });
        worker.on('error', error => { failure = error instanceof Error ? error : new Error(String(error)); });
        worker.on('exit', code => {
          clearTimeout(timer);
          if (failure) reject(failure);
          else if (result?.type === 'evidence' && code === 0) resolve(result.evidence);
          else if (result?.type === 'failed') reject(new LiveEvidenceReadError(result.reason, result.error));
          else reject(new LiveEvidenceReadError('failed', `Live evidence worker exited without a result (${code})`));
        });
      });
    } finally {
      // A finished read hands its slot straight to the next waiting one.
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
}
