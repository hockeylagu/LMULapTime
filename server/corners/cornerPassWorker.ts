import { parentPort, workerData } from 'node:worker_threads';
import { buildReplayCornerPasses, type CornerPassInput } from './cornerPassBuild.js';

const port = parentPort;
if (!port) throw new Error('Corner pass worker requires a parent port');

try {
  port.postMessage({ type: 'result', passes: buildReplayCornerPasses(workerData as CornerPassInput) });
} catch (error) {
  port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
