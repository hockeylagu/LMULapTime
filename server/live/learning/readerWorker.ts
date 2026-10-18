import { parentPort, workerData } from 'node:worker_threads';
import { readLearningEvents } from './readEvents.js';
import type { LearningReadRequest } from './readEvents.js';
if (!parentPort) throw new Error('Learning reader requires a worker');
try { parentPort.postMessage({ type: 'events', events: await readLearningEvents(workerData as LearningReadRequest) }); }
catch (error) { parentPort.postMessage({ type: 'failed', error: error instanceof Error ? error.message : String(error) }); }
finally { parentPort.close(); }
