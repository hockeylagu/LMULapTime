import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import { AuditReadError } from './readPage.js';
import type { AuditPage, AuditReadRequest } from './readPage.js';

export type AuditPageReader = (request: AuditReadRequest) => Promise<AuditPage>;
type Answer = { type: 'page'; page: AuditPage } | { type: 'failed'; error: string; status: number };

/** Pages are bounded independently of capture; worker exit releases Windows native handles. */
export class LiveAuditReader {
  private active = 0;
  public async read(request: AuditReadRequest): Promise<AuditPage> {
    if (this.active >= 2) throw new AuditReadError(503, 'Strategy history readers are busy; retry shortly');
    this.active++;
    try {
      return await new Promise<AuditPage>((resolve, reject) => {
        const worker = new Worker(findWorkerBootstrap(import.meta.url, ['live', 'audit', 'readerWorkerBootstrap.mjs']), { workerData: request });
        let answer: Answer | null = null;
        let failure: Error | null = null;
        const timer = setTimeout(() => { failure = new AuditReadError(503, 'Strategy history read timed out'); void worker.terminate(); }, 10_000);
        timer.unref();
        worker.on('message', (message: unknown) => {
          if (isWorkerMessage<Answer>(message, ['page', 'failed'])) answer = message;
        });
        worker.on('error', error => { failure = error instanceof Error ? error : new Error(String(error)); });
        worker.on('exit', code => {
          clearTimeout(timer);
          if (failure) reject(failure);
          else if (answer?.type === 'page' && code === 0) resolve(answer.page);
          else if (answer?.type === 'failed') reject(new AuditReadError(answer.status, answer.error));
          else reject(new AuditReadError(500, `Strategy history reader exited without a result (${code})`));
        });
      });
    } finally { this.active--; }
  }
}
