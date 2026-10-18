import { parentPort, workerData } from 'node:worker_threads';
import { AuditReadError, readAuditPage } from './readPage.js';
import type { AuditReadRequest } from './readPage.js';
if (!parentPort) throw new Error('Strategy history reader requires a worker');
try { parentPort.postMessage({ type: 'page', page: await readAuditPage(workerData as AuditReadRequest) }); }
catch (error) {
  parentPort.postMessage({ type: 'failed', error: error instanceof Error ? error.message : String(error),
    status: error instanceof AuditReadError ? error.status : 409 });
} finally { parentPort.close(); }
