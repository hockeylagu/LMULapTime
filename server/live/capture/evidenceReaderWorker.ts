import { parentPort, workerData } from 'node:worker_threads';
import type { LiveEvidenceReadRequest, LiveEvidenceWorkerResult } from '../../../shared/types/liveEvidence.js';
import { readLiveRecording } from './readRecording.js';
import { LiveEvidenceReadError } from './readError.js';

if (!parentPort) throw new Error('Live evidence reader requires a worker port');
const port = parentPort;
try {
  const evidence = await readLiveRecording(workerData as LiveEvidenceReadRequest);
  port.postMessage({ type: 'evidence', evidence } satisfies LiveEvidenceWorkerResult);
} catch (error: unknown) {
  port.postMessage({ type: 'failed', reason: error instanceof LiveEvidenceReadError ? error.reason : 'failed',
    error: error instanceof Error ? error.message : String(error) } satisfies LiveEvidenceWorkerResult);
} finally { port.close(); }
