import { parentPort, workerData } from 'node:worker_threads';
import { ReplayTrajectoryData } from '../../core/types.js';
import { ExtractReplayTrajectoryOptions, extractReplayTrajectory } from '../decode/replayTrajectory.js';
import { ReplayStreamProgress } from '../replayProgress.js';

interface ReplayWorkerData {
  filePath: string;
  options: ExtractReplayTrajectoryOptions;
}

type ReplayWorkerMessage =
  | { type: 'progress'; progress: ReplayStreamProgress }
  | { type: 'result'; trajectory: ReplayTrajectoryData }
  | { type: 'error'; message: string; code?: string };

const port = parentPort;
const input = workerData as ReplayWorkerData;

if (!port) {
  throw new Error('Replay trajectory worker requires a parent port');
}

try {
  const trajectory = extractReplayTrajectory(input.filePath, {
    ...input.options,
    silent: true,
    onProgress: (progress) => port.postMessage({ type: 'progress', progress } satisfies ReplayWorkerMessage),
  });
  port.postMessage({ type: 'result', trajectory } satisfies ReplayWorkerMessage);
} catch (error) {
  port.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    // A system error (the file locked or gone) is not the decoder rejecting the file.
    ...(typeof (error as NodeJS.ErrnoException)?.code === 'string' ? { code: (error as NodeJS.ErrnoException).code } : {}),
  } satisfies ReplayWorkerMessage);
}