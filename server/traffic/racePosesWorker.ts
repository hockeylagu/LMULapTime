import { parentPort, workerData } from 'node:worker_threads';
import { resampleLapPoses } from './racePoses.js';

interface RacePosesWorkerData {
  laps: Array<{ key: string; blob: Uint8Array }>;
  hz: number;
}

const port = parentPort;
if (!port) throw new Error('Race poses worker requires a parent port');

const input = workerData as RacePosesWorkerData;
try {
  const poses = input.laps.map(lap => ({ key: lap.key, ...resampleLapPoses(lap.blob, input.hz) }));
  port.postMessage({ type: 'result', poses }, poses.map(pose => pose.data.buffer as ArrayBuffer));
} catch (error) {
  port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
