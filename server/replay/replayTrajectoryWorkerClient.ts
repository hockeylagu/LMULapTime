import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReplayTrajectoryData } from '../core/types.js';
import { ExtractReplayTrajectoryOptions } from './replayTrajectory.js';
import { ReplayStreamProgress } from './replayProgress.js';

type WorkerMessage =
  | { type: 'progress'; progress: ReplayStreamProgress }
  | { type: 'result'; trajectory: ReplayTrajectoryData }
  | { type: 'error'; message: string };

export interface ReplayWorkerClientOptions {
  workerPath?: string | URL;
}

/**
 * The path of a worker's .mjs bootstrap, `serverRelativePath` under server/. Next to the calling
 * module when it runs from a file; otherwise (bundled or transformed, as under the test runner)
 * found by walking up from the entry script and the working directory.
 */
export function findWorkerBootstrap(moduleUrl: string, serverRelativePath: string[]): string {
  const url = new URL(moduleUrl);
  const fileName = serverRelativePath[serverRelativePath.length - 1];
  if (url.protocol === 'file:') {
    return fileURLToPath(new URL(`./${fileName}`, url));
  }

  const startingDirectories = [path.dirname(path.resolve(process.argv[1] || '.')), process.cwd()];
  for (const startingDirectory of startingDirectories) {
    let directory = startingDirectory;
    while (true) {
      const candidate = path.join(directory, 'server', ...serverRelativePath);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  throw new Error(`Unable to locate worker bootstrap ${fileName}`);
}

export async function* extractReplayTrajectoryInWorker(
  filePath: string,
  options: ExtractReplayTrajectoryOptions,
  clientOptions: ReplayWorkerClientOptions = {}
): AsyncGenerator<ReplayStreamProgress, ReplayTrajectoryData, void> {
  const workerPath = clientOptions.workerPath || findWorkerBootstrap(import.meta.url, ['replay', 'replayTrajectoryWorkerBootstrap.mjs']);
  const worker = new Worker(workerPath, {
    workerData: { filePath, options: { ...options, silent: true } },
  });
  const messages: WorkerMessage[] = [];
  let notify: (() => void) | undefined;
  let workerError: Error | undefined;
  let resultReceived = false;

  const wake = (): void => {
    const waiting = notify;
    notify = undefined;
    waiting?.();
  };
  worker.on('message', (message: WorkerMessage) => {
    if (message.type === 'result') resultReceived = true;
    messages.push(message);
    wake();
  });
  worker.on('error', (error: Error) => {
    workerError = error;
    wake();
  });
  worker.on('exit', (code) => {
    if (!resultReceived) {
      workerError = new Error(`Replay trajectory worker exited with code ${code} before returning a result`);
      wake();
    }
  });

  try {
    while (true) {
      while (messages.length === 0 && !workerError) {
        await new Promise<void>((resolve) => { notify = resolve; });
      }
      if (workerError) throw workerError;

      const message = messages.shift()!;
      if (message.type === 'progress') {
        yield message.progress;
      } else if (message.type === 'result') {
        return message.trajectory;
      } else {
        throw new Error(message.message);
      }
    }
  } finally {
    // The worker exits by itself after posting its result; terminating also covers a consumer
    // that stops early or a worker that lingers, so no thread outlives its extraction.
    void worker.terminate();
  }
}