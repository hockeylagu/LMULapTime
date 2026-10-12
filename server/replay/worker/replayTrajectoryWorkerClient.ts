import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReplayTrajectoryData } from '../../core/types.js';
import { ExtractReplayTrajectoryOptions, extractReplayTrajectory, extractReplayDriverTrajectories } from '../decode/replayTrajectory.js';
import { ReplayStreamProgress } from '../replayProgress.js';
import { ReplayDecodeError } from '../decode/replayDecodeError.js';
import type { ReplayDriverSave } from '../../core/replay/dbReplayDriverStore.js';

export interface StoredReplayDriver {
  driverSlot?: number;
  currentLap?: number;
}

export interface StoredReplayDrivers {
  drivers: Array<StoredReplayDriver & { driverSlotKey: number; isPrimary: boolean }>;
  failures: Array<{ driverSlotKey: number; isPrimary: boolean; message: string; code?: string }>;
}

export interface ReplayDriversSave extends Omit<ReplayDriverSave, 'filePath' | 'driverSlotKey' | 'isPrimary'> {
  driverSlots: number[];
  includePrimary: boolean;
  /** Preserve an existing default during upgrades instead of resolving today's player. */
  primarySlot?: number;
}

interface ReplaySaveHost {
  getDbPath(): string;
  replaceReplayDriverLaps(filename: string, filePath: string, mtime: number, size: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
}

type WorkerMessage =
  | { type: 'progress'; progress: ReplayStreamProgress }
  | { type: 'result'; trajectory: ReplayTrajectoryData }
  | { type: 'stored'; summary: StoredReplayDriver }
  | { type: 'storedDrivers'; summary: StoredReplayDrivers }
  | { type: 'error'; message: string; code?: string };

export interface ReplayWorkerClientOptions {
  workerPath?: string | URL;
}

/**
 * True when `message` is one our worker posted: an object whose `type` is one of `types`. Every worker
 * client reads its port through this. The port also carries messages that are not ours: under
 * `node --watch` (npm run dev), tsx posts { 'watch:import': [...] } for each module the worker loads.
 * Taken as an answer, that once failed every replay decode and lost every new session at startup.
 */
export function isWorkerMessage<T extends { type: string }>(message: unknown, types: ReadonlyArray<T['type']>): message is T {
  const type = (message as { type?: unknown } | null)?.type;
  return typeof type === 'string' && (types as ReadonlyArray<string>).includes(type);
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
  const result = yield* runReplayWorker(filePath, options, clientOptions);
  if (!('points' in result)) throw new Error('Replay worker returned a save instead of a trajectory');
  return result;
}

/** File-backed caches are written by the worker; private in-memory databases cannot be shared between threads. */
export async function* storeReplayTrajectoryInWorker(
  host: ReplaySaveHost,
  filePath: string,
  options: ExtractReplayTrajectoryOptions,
  save: Omit<ReplayDriverSave, 'filePath'>,
): AsyncGenerator<ReplayStreamProgress, StoredReplayDriver, void> {
  const dbPath = host.getDbPath();
  const fullResolution = { ...options, maxPoints: 0, allLaps: true };
  if (dbPath === ':memory:') {
    const progressList: ReplayStreamProgress[] = [];
    const trajectory = extractReplayTrajectory(filePath, {
      ...fullResolution,
      silent: true,
      onProgress: (progress) => progressList.push(progress),
    });
    for (const progress of progressList) {
      yield progress;
    }
    yield { stage: 'caching', stageDescription: 'Persisting trajectory cache', percent: 100, driverSlot: trajectory.driverSlot };
    host.replaceReplayDriverLaps(save.filename, filePath, save.mtime, save.size, save.driverSlotKey ?? trajectory.driverSlot ?? -1, trajectory, save.isPrimary);
    return { driverSlot: trajectory.driverSlot, currentLap: trajectory.currentLap };
  }
  const result = yield* runReplayWorker(filePath, fullResolution, {}, { ...save, filePath, dbPath: path.resolve(dbPath) });
  if ('points' in result || 'drivers' in result) throw new Error('Replay worker returned an unexpected save result');
  return result;
}

export async function* storeReplayDriversInWorker(
  host: ReplaySaveHost,
  filePath: string,
  options: Pick<ExtractReplayTrajectoryOptions, 'playerName'>,
  save: ReplayDriversSave,
): AsyncGenerator<ReplayStreamProgress, StoredReplayDrivers, void> {
  if (host.getDbPath() === ':memory:') {
    const summary: StoredReplayDrivers = { drivers: [], failures: [] };
    const progressList: ReplayStreamProgress[] = [];
    let first = true;
    const extraction = extractReplayDriverTrajectories(filePath, {
      ...options, driverSlot: save.primarySlot, driverSlots: save.driverSlots, includePrimary: save.includePrimary,
      allLaps: true, maxPoints: 0, silent: true,
      onProgress: progress => progressList.push(progress),
      onDriverError: (slot, error) => {
        summary.failures.push({ driverSlotKey: slot ?? -1, isPrimary: first && save.includePrimary,
          message: error instanceof Error ? error.message : String(error) });
        first = false;
      },
    });
    try {
      for (const trajectory of extraction) {
        for (const progress of progressList.splice(0)) yield progress;
        const isPrimary = first && save.includePrimary;
        first = false;
        const slot = trajectory.driverSlot ?? -1;
        try {
          host.replaceReplayDriverLaps(save.filename, filePath, save.mtime, save.size, slot, trajectory, isPrimary);
          summary.drivers.push({ driverSlotKey: slot, isPrimary, driverSlot: trajectory.driverSlot, currentLap: trajectory.currentLap });
          yield { stage: 'caching', stageDescription: 'Saved driver trajectory cache', percent: 100, driverSlot: slot, driverStored: true };
        } catch (error) {
          summary.failures.push({ driverSlotKey: slot, isPrimary, message: error instanceof Error ? error.message : String(error),
            ...(error instanceof ReplayDecodeError ? {} : { code: 'REPLAY_SAVE_FAILED' }) });
        }
      }
    } finally {
      extraction.return();
    }
    return summary;
  }
  const result = yield* runReplayWorker(filePath, { ...options, driverSlot: save.primarySlot, maxPoints: 0, allLaps: true }, {}, undefined,
    { ...save, filePath, dbPath: path.resolve(host.getDbPath()) });
  if (!('drivers' in result)) throw new Error('Replay worker did not return a replay-wide save');
  return result;
}

async function* runReplayWorker(
  filePath: string,
  options: ExtractReplayTrajectoryOptions,
  clientOptions: ReplayWorkerClientOptions,
  save?: ReplayDriverSave & { dbPath: string },
  batch?: ReplayDriversSave & { filePath: string; dbPath: string },
): AsyncGenerator<ReplayStreamProgress, ReplayTrajectoryData | StoredReplayDriver | StoredReplayDrivers, void> {
  const workerPath = clientOptions.workerPath || findWorkerBootstrap(import.meta.url, ['replay', 'worker', 'replayTrajectoryWorkerBootstrap.mjs']);
  const worker = new Worker(workerPath, {
    workerData: { filePath, options: { ...options, silent: true }, save, batch },
    ...(batch ? { resourceLimits: { maxOldGenerationSizeMb: 768 } } : {}),
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
  worker.on('message', (message: unknown) => {
    if (!isWorkerMessage<WorkerMessage>(message, ['progress', 'result', 'stored', 'storedDrivers', 'error'])) return;
    if (message.type === 'result' || message.type === 'stored' || message.type === 'storedDrivers') resultReceived = true;
    messages.push(message);
    wake();
  });
  worker.on('error', (error: Error) => {
    workerError = error;
    wake();
  });
  worker.on('exit', (code) => {
    if (!resultReceived) {
      workerError ??= new Error(`Replay trajectory worker exited with code ${code} before returning a result`);
      wake();
    }
  });

  try {
    while (true) {
      while (messages.length === 0 && !workerError) {
        await new Promise<void>((resolve) => { notify = resolve; });
      }
      // A worker can post its decoder error and exit before this consumer resumes.
      // Drain posted messages first so a rejected recording keeps its decoder failure classification.
      if (messages.length === 0 && workerError) throw workerError;

      const message = messages.shift()!;
      if (message.type === 'progress') {
        yield message.progress;
      } else if (message.type === 'result') {
        return message.trajectory;
      } else if (message.type === 'stored') {
        return message.summary;
      } else if (message.type === 'storedDrivers') {
        return message.summary;
      } else {
        // The decoder rejected the file. An exit, a crash or a system error (code) is not the file's fault.
        throw message.code ? Object.assign(new Error(message.message), { code: message.code }) : new ReplayDecodeError(message.message);
      }
    }
  } finally {
    // The worker exits by itself after posting its result; terminating also covers a consumer
    // that stops early or a worker that lingers, so no thread outlives its extraction.
    await worker.terminate();
  }
}
