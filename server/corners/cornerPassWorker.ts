import { parentPort, workerData } from 'node:worker_threads';
import { buildReplayCornerPasses, readSequenceLaps, type CornerPassInput, type SequenceLapInput } from './cornerPassBuild.js';

const port = parentPort;
if (!port) throw new Error('Corner pass worker requires a parent port');

const job = workerData as { kind: 'passes'; input: CornerPassInput } | { kind: 'sequenceLaps'; input: SequenceLapInput };
try {
  port.postMessage({ type: 'result', result: job.kind === 'passes' ? buildReplayCornerPasses(job.input) : readSequenceLaps(job.input) });
} catch (error) {
  port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
