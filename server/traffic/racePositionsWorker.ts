import { parentPort, workerData } from 'node:worker_threads';
import { buildRacePositions, StoredLapBlob } from './lapSamples.js';

interface RacePositionsWorkerData {
  laps: StoredLapBlob[];
  centerline: Array<[number, number]>;
}

const port = parentPort;
if (!port) throw new Error('Race positions worker requires a parent port');

const input = workerData as RacePositionsWorkerData;
try {
  port.postMessage({ type: 'result', positions: buildRacePositions(input.laps, input.centerline) });
} catch (error) {
  port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
