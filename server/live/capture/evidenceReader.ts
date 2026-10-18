import { findWorkerBootstrap, runWorkerOnce } from '../../core/workerThreads.js';
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
      const answer = await runWorkerOnce<LiveEvidenceWorkerResult>(
        findWorkerBootstrap(import.meta.url, ['live', 'capture', 'evidenceReaderWorkerBootstrap.mjs']), request, ['evidence', 'failed'], {
          timeoutMs: 10_000,
          timeoutError: () => new LiveEvidenceReadError('busy', 'Live evidence read timed out'),
          missingError: code => new LiveEvidenceReadError('failed', `Live evidence worker exited without a result (${code})`),
        });
      if (answer.type === 'failed') throw new LiveEvidenceReadError(answer.reason, answer.error);
      return answer.evidence;
    } finally {
      // A finished read hands its slot straight to the next waiting one.
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
}
