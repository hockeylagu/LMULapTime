import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../shared/types/index.js';
import { ExtractReplayTrajectoryOptions, extractReplayTrajectory, extractReplayDriverTrajectories } from '../decode/replayTrajectory.js';
import { ReplayStreamProgress } from '../replayProgress.js';
import { ReplayDecodeError } from '../decode/replayDecodeError.js';
import type { ReplayDriverSave } from '../../core/replay/dbReplayDriverStore.js';
import { REPLAY_CACHE_VERSION } from '../../core/dbSchema.js';
import type { ReplayDriverIngest } from '../../core/replay/dbReplayIngestStore.js';
import { isReplayDriverSettled } from '../../core/replay/dbReplayIngestStore.js';
import { resolveReplayPrimarySlot } from '../decode/replayParser.js';

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
  replaceReplayDriverLaps(filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
  getReplayDriverIngest(filename: string, driverSlot: number): ReplayDriverIngest | null;
  hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtimeMs: number, fileSizeBytes: number, filePath?: string): boolean;
  getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtimeMs: number, fileSizeBytes: number, filePath?: string): ReplayTrajectoryData | null;
  getReplayMetadataCache(filename: string, mtimeMs: number, fileSizeBytes: number, filePath?: string): ReplayMetadata | null;
  promoteReplayPrimary(filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, driverSlotKey: number): boolean;
}

interface ReplaySaveQueue {
  locked: boolean;
  waiting: Array<ReplaySaveWaiter>;
}

interface ReplaySaveFailure { message: string; code?: string }
interface ReplaySaveWaiter {
  granted: boolean;
  resolve: () => void;
  canceled: boolean;
  previousFailures?: Map<number, ReplaySaveFailure>;
}
interface ReplaySaveLease {
  release: (failures?: Map<number, ReplaySaveFailure>) => void;
  waited: boolean;
  previousFailures?: Map<number, ReplaySaveFailure>;
}

const replaySaveQueues = new Map<string, ReplaySaveQueue>();

/** Serialize file-backed saves for one recording version so a request and scan cannot race a slot replacement. */
async function* acquireReplaySaveLease(key: string): AsyncGenerator<ReplayStreamProgress, ReplaySaveLease, void> {
  let queue = replaySaveQueues.get(key);
  if (!queue) {
    queue = { locked: false, waiting: [] };
    replaySaveQueues.set(key, queue);
  }
  const owner: ReplaySaveWaiter = { granted: !queue.locked, resolve: (): void => undefined, canceled: false };
  const waited = !owner.granted;
  if (!owner.granted) {
    owner.resolve = () => { owner.granted = true; };
    queue.waiting.push(owner);
  } else {
    queue.locked = true;
  }
  const release = (failures?: Map<number, ReplaySaveFailure>): void => {
    if (!owner.granted) {
      owner.canceled = true;
      queue!.waiting = queue!.waiting.filter(waiter => waiter !== owner);
      if (!queue!.locked && queue!.waiting.length === 0) replaySaveQueues.delete(key);
      return;
    }
    let granted = queue!.waiting.shift();
    while (granted?.canceled) granted = queue!.waiting.shift();
    if (granted) {
      granted.previousFailures = new Map([...(owner.previousFailures ?? []), ...(failures ?? [])]);
      granted.resolve();
    }
    else {
      queue!.locked = false;
      replaySaveQueues.delete(key);
    }
  };
  let handedOff = false;
  try {
    while (!owner.granted) {
      await Promise.race([new Promise<void>(resolve => { owner.resolve = () => { owner.granted = true; resolve(); }; }), new Promise<void>(resolve => setTimeout(resolve, 100))]);
      if (!owner.granted) yield { stage: 'caching', stageDescription: 'Waiting for another decode of this replay', percent: 0 };
    }
    handedOff = true;
    return { release, waited, previousFailures: owner.previousFailures };
  } finally {
    if (!handedOff) release();
  }
}

function replaySaveKey(dbPath: string, filePath: string, filename: string, mtimeMs: number, fileSizeBytes: number): string {
  return `${path.resolve(dbPath)}\0${path.resolve(filePath)}\0${filename}\0${mtimeMs}\0${fileSizeBytes}\0${REPLAY_CACHE_VERSION}`;
}

function storedDriver(host: ReplaySaveHost, filename: string, filePath: string, driverSlot: number, mtimeMs: number, fileSizeBytes: number): boolean {
  const ingest = host.getReplayDriverIngest(filename, driverSlot);
  return ingest?.status === 'stored' && ingest.mtimeMs === mtimeMs && ingest.fileSizeBytes === fileSizeBytes &&
    ingest.parserVersion === REPLAY_CACHE_VERSION && host.hasValidReplayTrajectoryCache(filename, driverSlot, -1, mtimeMs, fileSizeBytes, filePath);
}

function saveFailure(error: unknown): ReplaySaveFailure {
  const code = (error as NodeJS.ErrnoException)?.code;
  return { message: error instanceof Error ? error.message : String(error), ...(typeof code === 'string' ? { code } : {}) };
}

function failureError(failure: ReplaySaveFailure): Error {
  return failure.code ? Object.assign(new Error(failure.message), { code: failure.code }) : new ReplayDecodeError(failure.message);
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
    host.replaceReplayDriverLaps(save.filename, filePath, save.mtimeMs, save.fileSizeBytes, save.driverSlotKey ?? trajectory.driverSlot ?? -1, trajectory, save.isPrimary);
    return { driverSlot: trajectory.driverSlot, currentLap: trajectory.currentLap };
  }
  const lease = yield* acquireReplaySaveLease(replaySaveKey(dbPath, filePath, save.filename, save.mtimeMs, save.fileSizeBytes));
  const leaseFailures = new Map<number, ReplaySaveFailure>();
  try {
    const slot = save.driverSlotKey ?? options.driverSlot ?? -1;
    const previousFailure = lease.previousFailures?.get(slot);
    if (lease.waited && previousFailure) {
      leaseFailures.set(slot, previousFailure);
      throw failureError(previousFailure);
    }
    if (lease.waited) {
      const attempt = host.getReplayDriverIngest(save.filename, slot);
      if (storedDriver(host, save.filename, filePath, slot, save.mtimeMs, save.fileSizeBytes) &&
          (!save.isPrimary || host.promoteReplayPrimary(save.filename, filePath, save.mtimeMs, save.fileSizeBytes, slot))) {
        const cached = host.getReplayTrajectoryCache(save.filename, slot, -1, save.mtimeMs, save.fileSizeBytes, filePath);
        return { driverSlot: cached?.driverSlot ?? (slot >= 0 ? slot : undefined), currentLap: cached?.currentLap };
      }
      if (attempt && isReplayDriverSettled(attempt, save.mtimeMs, save.fileSizeBytes) && attempt.status !== 'stored') {
        const failure = attempt.status === 'failed'
          ? new ReplayDecodeError(attempt.error ?? `Replay driver ${slot} could not be decoded`)
          : Object.assign(new Error(attempt.error ?? `Replay driver ${slot} save was interrupted`), { code: 'REPLAY_SAVE_FAILED' });
        leaseFailures.set(slot, saveFailure(failure));
        throw failure;
      }
    }
    try {
      const result = yield* runReplayWorker(filePath, fullResolution, {}, { ...save, filePath, dbPath: path.resolve(dbPath) });
      if ('points' in result || 'drivers' in result) throw new Error('Replay worker returned an unexpected save result');
      return result;
    } catch (error) {
      leaseFailures.set(slot, saveFailure(error));
      throw error;
    }
  } finally {
    lease.release(leaseFailures);
  }
}

export async function* storeReplayDriversInWorker(
  host: ReplaySaveHost,
  filePath: string,
  options: Pick<ExtractReplayTrajectoryOptions, 'playerName'>,
  save: ReplayDriversSave,
): AsyncGenerator<ReplayStreamProgress, StoredReplayDrivers, void> {
  if (save.includePrimary && save.primarySlot === undefined) {
    const metadata = host.getReplayMetadataCache(save.filename, save.mtimeMs, save.fileSizeBytes, filePath);
    const primarySlot = metadata ? resolveReplayPrimarySlot(metadata, options.playerName) : undefined;
    save = { ...save, primarySlot, includePrimary: primarySlot !== undefined };
  }
  if (!save.includePrimary && save.driverSlots.length === 0) return { drivers: [], failures: [] };
  if (host.getDbPath() === ':memory:') {
    const summary: StoredReplayDrivers = { drivers: [], failures: [] };
    if (save.includePrimary && save.primarySlot !== undefined &&
        host.promoteReplayPrimary(save.filename, filePath, save.mtimeMs, save.fileSizeBytes, save.primarySlot)) {
      summary.drivers.push({ driverSlotKey: save.primarySlot, driverSlot: save.primarySlot, isPrimary: true,
        currentLap: host.getReplayTrajectoryCache(save.filename, save.primarySlot, -1, save.mtimeMs, save.fileSizeBytes, filePath)?.currentLap });
      save = { ...save, includePrimary: false, driverSlots: save.driverSlots.filter(slot => slot !== save.primarySlot) };
      if (save.driverSlots.length === 0) return summary;
    }
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
          host.replaceReplayDriverLaps(save.filename, filePath, save.mtimeMs, save.fileSizeBytes, slot, trajectory, isPrimary);
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
  const dbPath = host.getDbPath();
  const lease = yield* acquireReplaySaveLease(replaySaveKey(dbPath, filePath, save.filename, save.mtimeMs, save.fileSizeBytes));
  const leaseFailures = new Map<number, ReplaySaveFailure>();
  try {
    const priorFailures = [...(lease.previousFailures ?? [])].filter(([slot]) => save.driverSlots.includes(slot) || save.includePrimary && slot === save.primarySlot);
    for (const [slot, failure] of priorFailures) leaseFailures.set(slot, failure);
    const knownPrimary = save.primarySlot;
    const primaryCanBeSkipped = save.includePrimary && knownPrimary !== undefined && !leaseFailures.has(knownPrimary) &&
      host.promoteReplayPrimary(save.filename, filePath, save.mtimeMs, save.fileSizeBytes, knownPrimary);
    const skipPrimary = primaryCanBeSkipped ? knownPrimary : undefined;
    const failedSlots = new Set(priorFailures.map(([slot]) => slot));
    const skippedSlots = lease.waited ? [...new Set(save.driverSlots)].filter(slot => slot !== skipPrimary && !failedSlots.has(slot) && storedDriver(host, save.filename, filePath, slot, save.mtimeMs, save.fileSizeBytes)) : [];
    const driverSlots = [...new Set(save.driverSlots)].filter(slot => slot !== skipPrimary && !failedSlots.has(slot) && (!lease.waited || !storedDriver(host, save.filename, filePath, slot, save.mtimeMs, save.fileSizeBytes)));
    const primaryPreviouslyFailed = failedSlots.has(save.primarySlot ?? -1);
    const includePrimary = save.includePrimary && !primaryCanBeSkipped && !primaryPreviouslyFailed;
    if (driverSlots.length === 0 && !includePrimary) {
      const drivers = [...new Set([...skippedSlots, ...(skipPrimary !== undefined ? [skipPrimary] : [])])];
      return { drivers: drivers.map(driverSlotKey => ({ driverSlotKey, isPrimary: driverSlotKey === knownPrimary,
        driverSlot: driverSlotKey >= 0 ? driverSlotKey : undefined,
        currentLap: host.getReplayTrajectoryCache(save.filename, driverSlotKey, -1, save.mtimeMs, save.fileSizeBytes, filePath)?.currentLap })),
        failures: priorFailures.map(([driverSlotKey, failure]) => ({ driverSlotKey, isPrimary: driverSlotKey === knownPrimary, ...failure })) };
    }
    let result: StoredReplayDrivers;
    try {
      const workerResult = yield* runReplayWorker(filePath, { ...options, driverSlot: save.primarySlot, maxPoints: 0, allLaps: true }, {}, undefined,
        { ...save, driverSlots, includePrimary, filePath, dbPath: path.resolve(dbPath) });
      if (!('drivers' in workerResult)) throw new Error('Replay worker did not return a replay-wide save');
      result = workerResult;
      for (const failure of result.failures) leaseFailures.set(failure.driverSlotKey, { message: failure.message, ...(failure.code ? { code: failure.code } : {}) });
    } catch (error) {
      const failure = saveFailure(error);
      for (const slot of [...driverSlots, ...(includePrimary ? [save.primarySlot ?? -1] : [])]) leaseFailures.set(slot, failure);
      throw error;
    }
    for (const driverSlotKey of [...skippedSlots, ...(skipPrimary !== undefined ? [skipPrimary] : [])]) {
      if (result.drivers.some(driver => driver.driverSlotKey === driverSlotKey)) continue;
      result.drivers.push({ driverSlotKey, isPrimary: driverSlotKey === knownPrimary,
        driverSlot: driverSlotKey >= 0 ? driverSlotKey : undefined,
        currentLap: host.getReplayTrajectoryCache(save.filename, driverSlotKey, -1, save.mtimeMs, save.fileSizeBytes, filePath)?.currentLap });
    }
    for (const [driverSlotKey, failure] of priorFailures) {
      if (result.failures.some(existing => existing.driverSlotKey === driverSlotKey)) continue;
      result.failures.push({ driverSlotKey, isPrimary: driverSlotKey === knownPrimary, ...failure });
    }
    return result;
  } finally {
    lease.release(leaseFailures);
  }
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
