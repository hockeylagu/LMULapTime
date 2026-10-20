import fs from 'fs';
import { FileIngestWorker } from '../ingest/fileIngestWorkerClient.js';
import type { ReplayIngestJob } from '../../../shared/types/index.js';
import path from 'path';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../shared/types/index.js';
import { ReplaySyncProgress, ReplaySyncResult } from '../dbSchema.js';
import { effectiveReplayPlayerName, parseReplayMetadata, resolveReplayPrimarySlot } from '../../replay/decode/replayParser.js';
import { extractReplayTrajectory } from '../../replay/decode/replayTrajectory.js';
import { storeReplayDriversInWorker } from '../../replay/worker/replayTrajectoryWorkerClient.js';
import { isReplayDriverSettled, ReplayDriverIngest, ReplayDriverIngestStatus, replayErrorMessage, replayFailureStatus, settledReplayFailure } from './dbReplayIngestStore.js';
import { ReplayDecodeError, decodeOrThrow } from '../../replay/decode/replayDecodeError.js';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { startYieldSlice } from '../yieldSlice.js';

export interface ReplayAsyncSyncOptions {
  playerName?: string;
  shouldStop?: () => boolean;
  /** Decode again the drivers that failed MAX_DECODE_ATTEMPTS times (a manual refresh). */
  retryFailed?: boolean;
  /** Called after all metadata is discovered, before any trajectory decode. */
  onMetadataReady?: () => Set<string> | Promise<Set<string>>;
  onReplayState?: (job: ReplayIngestJob) => void;
}

export interface ReplaySyncHost {
  getDbPath(): string;
  getMetadata(key: string): string | null;
  setMetadata(key: string, value: string): void;
  getReplaysCount(): number;
  getReplayMetadataCache(filename: string, mtimeMs: number, fileSizeBytes: number, filePath?: string): ReplayMetadata | null;
  upsertReplayMetadataCache(filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, metadata: ReplayMetadata): void;
  hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtimeMs: number, fileSizeBytes: number, filePath?: string, expectedDriverSlot?: number): boolean;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
  /** Replaces a driver's whole lap set in one transaction and records it as stored. */
  replaceReplayDriverLaps(filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
  getReplayDriverIngest(filename: string, driverSlot: number): ReplayDriverIngest | null;
  promoteReplayPrimary(filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, driverSlotKey: number): boolean;
  getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtimeMs: number, fileSizeBytes: number, filePath?: string): ReplayTrajectoryData | null;
  recordReplayDriverIngest(filename: string, driverSlot: number, mtimeMs: number, fileSizeBytes: number, status: ReplayDriverIngestStatus, error?: string | null): void;
}

/**
 * Whether a driver still has to be decoded for this file version: not when this build already stored it
 * or it failed too often (see isReplayDriverSettled; retried after a parser version change or an explicit
 * retry), nor when compatible rows are already stored. Slot -1 stands for the primary alias.
 */
function driverNeedsDecode(host: ReplaySyncHost, filename: string, driverSlot: number, mtimeMs: number, fileSizeBytes: number, filePath: string, retryFailed = false): boolean {
  const previous = host.getReplayDriverIngest(filename, driverSlot);
  if (isReplayDriverSettled(previous, mtimeMs, fileSizeBytes) && !(retryFailed && previous?.status !== 'stored')) return false;
  return !host.hasValidReplayTrajectoryCache(filename, driverSlot, -1, mtimeMs, fileSizeBytes, filePath);
}

/** An alias for another player must not settle this player's work or block cached-driver promotion. */
function primaryNeedsDecode(host: ReplaySyncHost, filename: string, slot: number, mtimeMs: number, fileSizeBytes: number, filePath: string, retryFailed = false): boolean {
  if (host.hasValidReplayTrajectoryCache(filename, -1, -1, mtimeMs, fileSizeBytes, filePath, slot)) return false;
  const attempt = host.getReplayDriverIngest(filename, slot);
  return retryFailed || !isReplayDriverSettled(attempt, mtimeMs, fileSizeBytes) || attempt?.status === 'stored';
}

/** Whether the player's decode or any driver of this replay still has to be decoded for this file version (see driverNeedsDecode). */
function replayNeedsDecode(
  host: ReplaySyncHost,
  file: { filename: string; filePath: string; mtimeMs: number; fileSizeBytes: number; metadata: ReplayMetadata },
  retryFailed = false,
  playerName?: string,
): boolean {
  const primarySlot = resolveReplayPrimarySlot(file.metadata, effectiveReplayPlayerName(file.filePath, playerName));
  if (primarySlot !== undefined && primaryNeedsDecode(host, file.filename, primarySlot, file.mtimeMs, file.fileSizeBytes, file.filePath, retryFailed)) {
    return true;
  }
  for (const driver of file.metadata.drivers) {
    if (typeof driver.slot === 'number' && driverNeedsDecode(host, file.filename, driver.slot, file.mtimeMs, file.fileSizeBytes, file.filePath, retryFailed)) {
      return true;
    }
  }
  return false;
}

/** The error of the first driver of this replay that failed too often to be tried again, or null. */
function settledReplayError(host: ReplaySyncHost, filename: string, filePath: string, metadata: ReplayMetadata, mtimeMs: number, fileSizeBytes: number, playerName?: string): string | null {
  return [...(resolveReplayPrimarySlot(metadata, effectiveReplayPlayerName(filePath, playerName)) !== undefined ? [-1] : []), ...metadata.drivers.flatMap(driver => typeof driver.slot === 'number' ? [driver.slot] : [])]
    .map(slot => settledReplayFailure(host.getReplayDriverIngest(filename, slot), mtimeMs, fileSizeBytes))
    .find(error => error !== null) ?? null;
}

/** Records a decode that threw, as rejected by the decoder or interrupted; either is tried again (see isReplayDriverSettled). */
export function recordDriverFailure(host: Pick<ReplaySyncHost, 'recordIngestError' | 'recordReplayDriverIngest'>, filename: string, filePath: string, driverSlot: number, mtimeMs: number, fileSizeBytes: number, error: unknown): void {
  const message = replayErrorMessage(error);
  host.recordIngestError('vcr', filePath, message);
  host.recordReplayDriverIngest(filename, driverSlot, mtimeMs, fileSizeBytes, replayFailureStatus(error), message);
}

/**
 * Same work as `syncReplaysFromDir`, but as a generator that yields progress after every
 * unit of expensive synchronous work (each file, and each per-driver trajectory extraction
 * within a file) instead of running the whole directory in one blocking call. The server
 * drives this with `setImmediate` between `.next()` calls so a large replay library doesn't
 * starve the event loop and make the HTTP server unresponsive for the whole scan.
 */
export function* syncReplaysIterator(
  host: ReplaySyncHost,
  replaysDir: string,
  options: {
    playerName?: string;
    shouldStop?: () => boolean;
  } = {}
): Generator<ReplaySyncProgress, ReplaySyncResult, void> {
  const lastSyncedAt = host.getMetadata('replays_last_synced_at') || new Date().toISOString();
  if (!fs.existsSync(replaysDir)) {
    return { added: 0, updated: 0, skipped: 0, total: host.getReplaysCount(), lastSyncedAt, interrupted: false };
  }

  const files = fs.readdirSync(replaysDir).filter(f => f.toLowerCase().endsWith('.vcr'));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let interrupted = false;
  let processedCount = 0;

  // Only replays with metadata to read or drivers to decode count in the progress.
  const pending = files.filter(f => {
    const filePath = path.join(replaysDir, f);
    try {
      const stat = fs.statSync(filePath);
      const mtimeMs = Math.floor(stat.mtimeMs);
      const metadata = host.getReplayMetadataCache(f, mtimeMs, stat.size, filePath);
      return !metadata || replayNeedsDecode(host, { filename: f, filePath, mtimeMs, fileSizeBytes: stat.size, metadata }, false, options.playerName);
    } catch {
      return true; // reported by the loop below
    }
  });

  for (let i = 0; i < pending.length; i++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const f = pending[i];
    yield { processed: i, total: pending.length, currentFile: f, stage: 'Verifying container and metadata', filePercent: 5 };
    const filePath = path.join(replaysDir, f);
    try {
      const stat = fs.statSync(filePath);
      const mtimeMs = Math.floor(stat.mtimeMs);
      const fileSizeBytes = stat.size;

      let metadata = host.getReplayMetadataCache(f, mtimeMs, fileSizeBytes, filePath);
      const isNewMetadata = !metadata;
      if (!metadata) {
        try {
          metadata = parseReplayMetadata(filePath, { playerName: options.playerName });
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
          skipped++; // invalid or currently-active recording file
          continue;
        }
        host.upsertReplayMetadataCache(f, filePath, mtimeMs, fileSizeBytes, metadata);
        host.clearIngestError('vcr', filePath);
      }

      let anyTrajectoryNewlyCached = false;

      const playerName = effectiveReplayPlayerName(filePath, options.playerName);
      const primarySlot = resolveReplayPrimarySlot(metadata, playerName);
      let defaultDriverSlot: number | undefined;
      if (primarySlot !== undefined && primaryNeedsDecode(host, f, primarySlot, mtimeMs, fileSizeBytes, filePath)) {
        try {
          if (host.promoteReplayPrimary(f, filePath, mtimeMs, fileSizeBytes, primarySlot)) {
            defaultDriverSlot = primarySlot;
            anyTrajectoryNewlyCached = true;
          } else {
            const trajectory = decodeOrThrow(() => extractReplayTrajectory(filePath, {
              driverSlot: primarySlot,
              playerName,
              maxPoints: 0,
              allLaps: true,
            }));
            defaultDriverSlot = primarySlot;
            host.replaceReplayDriverLaps(f, filePath, mtimeMs, fileSizeBytes, primarySlot, trajectory, true);
            anyTrajectoryNewlyCached = true;
            const totalLaps = trajectory.allLapsData?.length || trajectory.laps?.length || 1;
            console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for primary driver (${trajectory.driverName || 'Player'}) in ${f}`);
          }
        } catch (err) {
          recordDriverFailure(host, f, filePath, -1, mtimeMs, fileSizeBytes, err);
        }
        yield { processed: i, total: pending.length, currentFile: f, stage: 'Completed primary driver', filePercent: 100 };
      }

      for (const driver of metadata.drivers) {
        if (options.shouldStop?.()) {
          interrupted = true;
          break;
        }
        if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
        if (!driverNeedsDecode(host, f, driver.slot, mtimeMs, fileSizeBytes, filePath)) continue;
        try {
          const driverTrajectory = decodeOrThrow(() => extractReplayTrajectory(filePath, {
            driverSlot: driver.slot,
            playerName,
            maxPoints: 0,
            allLaps: true,
          }));
          host.replaceReplayDriverLaps(f, filePath, mtimeMs, fileSizeBytes, driver.slot, driverTrajectory, false);
          anyTrajectoryNewlyCached = true;
          const totalLaps = driverTrajectory.allLapsData?.length || driverTrajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for driver slot ${driver.slot} (${driver.name}) in ${f}`);
        } catch (err) {
          recordDriverFailure(host, f, filePath, driver.slot, mtimeMs, fileSizeBytes, err);
        }
        yield { processed: i, total: pending.length, currentFile: f, stage: `Cached driver ${driver.name}`, filePercent: 100 };
      }

      if (isNewMetadata) {
        added++;
      } else if (anyTrajectoryNewlyCached) {
        updated++;
      }
    } catch (err) {
      host.recordIngestError('vcr', filePath, err);
      console.error(`Error caching replay file ${filePath}:`, err);
    } finally {
      processedCount = i + 1;
    }
    if (interrupted) break;
  }

  if (pending.length > 0) {
    yield { processed: processedCount, total: pending.length, currentFile: '' };
  }

  const nowIso = new Date().toISOString();
  host.setMetadata('replays_last_synced_at', nowIso);
  host.setMetadata('replays_dir', replaysDir);

  return { added, updated, skipped, total: host.getReplaysCount(), lastSyncedAt: nowIso, interrupted };
}

/**
 * Background replay cache scan that keeps binary decoding off the HTTP event loop.
 * Progress messages are yielded as the worker decodes each replay stream.
 */
export async function* syncReplaysAsyncIterator(
  host: ReplaySyncHost,
  replaysDir: string,
  options: ReplayAsyncSyncOptions = {}
): AsyncGenerator<ReplaySyncProgress, ReplaySyncResult, void> {
  const lastSyncedAt = host.getMetadata('replays_last_synced_at') || new Date().toISOString();
  if (!fs.existsSync(replaysDir)) {
    return { added: 0, updated: 0, skipped: 0, total: host.getReplaysCount(), lastSyncedAt, interrupted: false };
  }

  const files = (await fs.promises.readdir(replaysDir)).filter(f => f.toLowerCase().endsWith('.vcr'));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let interrupted = false;
  let processedCount = 0;

  // Discover every recording first, so all XML sessions can be linked before a slow decode.
  const discovered: Array<{ filename: string; filePath: string; mtimeMs: number; fileSizeBytes: number; metadata: ReplayMetadata; isNewMetadata: boolean }> = [];
  const filesToParse: Array<{ filename: string; filePath: string; mtimeMs: number; fileSizeBytes: number }> = [];

  // Stat calls are cheap and run on the libuv thread pool, which bounds how many are in flight.
  const stats = await Promise.all(files.map(filename =>
    fs.promises.stat(path.join(replaysDir, filename)).then(stat => ({ stat }), (error: unknown) => ({ error }))));
  const sliceUsed = startYieldSlice();
  for (const [index, filename] of files.entries()) {
    const filePath = path.join(replaysDir, filename);
    try {
      const result = stats[index];
      if ('error' in result) throw result.error;
      const { stat } = result;
      const mtimeMs = Math.floor(stat.mtimeMs);
      const fileSizeBytes = stat.size;
      const metadata = host.getReplayMetadataCache(filename, mtimeMs, fileSizeBytes, filePath);
      if (metadata) {
        discovered.push({ filename, filePath, mtimeMs, fileSizeBytes, metadata, isNewMetadata: false });
      } else {
        filesToParse.push({ filename, filePath, mtimeMs, fileSizeBytes });
      }
    } catch (error: unknown) {
      host.recordIngestError('vcr', filePath, error);
      skipped++;
      options.onReplayState?.({ name: filename, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Cached metadata still needs decompression; a warm start must not monopolize the event loop.
    if (sliceUsed()) await yieldToEventLoop();
  }

  if (filesToParse.length > 0) {
    const worker = new FileIngestWorker();
    try {
      for (let i = 0; i < filesToParse.length; i++) {
        const { filename, filePath, mtimeMs, fileSizeBytes } = filesToParse[i];
        yield { processed: i, total: filesToParse.length, currentFile: filename, stage: 'Indexing replay metadata', filePercent: 0 };
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- One worker parses one file at a time; parallel calls would only queue inside it.
          const metadata = await worker.parseReplay(filePath, options.playerName);
          host.upsertReplayMetadataCache(filename, filePath, mtimeMs, fileSizeBytes, metadata);
          host.clearIngestError('vcr', filePath);
          added++;
          discovered.push({ filename, filePath, mtimeMs, fileSizeBytes, metadata, isNewMetadata: true });
        } catch (error: unknown) {
          host.recordIngestError('vcr', filePath, error);
          skipped++;
          options.onReplayState?.({ name: filename, status: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
    } finally {
      await worker.close();
    }
  }

  const associated = await options.onMetadataReady?.();
  // Newest first: the replay of the session just driven is ready before older ones are retried.
  const candidates = (associated ? discovered.filter(file => associated.has(file.filename)) : discovered)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const queue: typeof candidates = [];
  // A warm library can contain thousands of driver cache checks. The scan pump only yields when
  // this generator publishes progress, and cached replays deliberately stay out of decode totals.
  for (const file of candidates) {
    if (replayNeedsDecode(host, file, options.retryFailed, options.playerName)) {
      queue.push(file);
    } else {
      // Settled failures still report Refresh to retry, without increasing the decode count.
      const error = settledReplayError(host, file.filename, file.filePath, file.metadata, file.mtimeMs, file.fileSizeBytes, options.playerName);
      if (error) {
        options.onReplayState?.({ name: file.filename, status: 'failed', error,
          playable: host.hasValidReplayTrajectoryCache(file.filename, -1, -1, file.mtimeMs, file.fileSizeBytes, file.filePath) });
      }
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Gives HTTP and SSE a turn once a slice of cache checks is used up.
    if (sliceUsed()) await yieldToEventLoop();
  }

  for (const file of queue) options.onReplayState?.({ name: file.filename, status: 'queued' });
  for (let index = 0; index < queue.length; index++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const { filename, filePath, mtimeMs, fileSizeBytes, metadata, isNewMetadata } = queue[index];
    const playerName = effectiveReplayPlayerName(filePath, options.playerName);
    const primarySlot = resolveReplayPrimarySlot(metadata, playerName);
    const primaryPending = primarySlot !== undefined && primaryNeedsDecode(host, filename, primarySlot, mtimeMs, fileSizeBytes, filePath, options.retryFailed);
    const pendingSlots = new Set(metadata.drivers.flatMap(driver =>
      typeof driver.slot === 'number' && driverNeedsDecode(host, filename, driver.slot, mtimeMs, fileSizeBytes, filePath, options.retryFailed)
        ? [driver.slot] : []));
    let retrying = false;
    options.onReplayState?.({ name: filename, status: 'processing' });
    yield { processed: index, total: queue.length, currentFile: filename, stage: 'Verifying trajectory cache', filePercent: 5 };
    try {
      let trajectoryCached = false;
      const extraction = storeReplayDriversInWorker(host, filePath, { playerName }, {
        filename, mtimeMs, fileSizeBytes, driverSlots: [...pendingSlots], includePrimary: primaryPending, primarySlot,
      });
      let filePercent = 5;
      // The generator's return value holds the stored drivers, which `for await` would drop.
      // oxlint-disable-next-line eslint/no-await-in-loop -- Replays decode one at a time: each is a large worker job that writes SQLite.
      let step = await extraction.next();
      try {
        while (!step.done) {
          if (options.shouldStop?.()) {
            interrupted = true;
            break;
          }
          const progress = step.value;
          const percent = progress.stage === 'caching'
            ? 70 + 25 * (progress.driversDone ?? 0) / Math.max(1, progress.driversTotal ?? pendingSlots.size)
            : progress.stage === 'lap_analysis' || progress.stage === 'downsampling' ? 70 : 5 + progress.percent * 0.75;
          filePercent = Math.max(filePercent, Math.min(99, Math.floor(percent)));
          yield { processed: index, total: queue.length, currentFile: filename,
            stage: progress.stageDescription, filePercent };
          // oxlint-disable-next-line eslint/no-await-in-loop -- Progress arrives in order from the one worker decoding this replay.
          step = await extraction.next();
        }
      } finally {
        // oxlint-disable-next-line eslint/no-await-in-loop -- An interrupted decode stops its worker before the next replay starts.
        if (!step.done) await extraction.return({ drivers: [], failures: [] });
      }
      if (step.done) {
        const stored = step.value;
        trajectoryCached = stored.drivers.length > 0;
        for (const failure of stored.failures) {
          retrying = true;
          const error = failure.code ? Object.assign(new Error(failure.message), { code: failure.code }) : new ReplayDecodeError(failure.message);
          recordDriverFailure(host, filename, filePath, failure.driverSlotKey, mtimeMs, fileSizeBytes, error);
          if (failure.isPrimary && failure.driverSlotKey !== -1) recordDriverFailure(host, filename, filePath, -1, mtimeMs, fileSizeBytes, error);
        }
        yield { processed: index, total: queue.length, currentFile: filename, stage: 'Finished replay drivers', filePercent: 100 };
      }
      if (!isNewMetadata && trajectoryCached) updated++;
    } catch (error) {
      // A later driver can crash the worker after earlier driver transactions committed.
      for (const slot of [...pendingSlots, ...(primaryPending ? [-1] : [])]) {
        const attempt = host.getReplayDriverIngest(filename, slot);
        if (attempt?.status === 'stored' && isReplayDriverSettled(attempt, mtimeMs, fileSizeBytes)) continue;
        recordDriverFailure(host, filename, filePath, slot, mtimeMs, fileSizeBytes, error);
      }
      retrying = true;
    } finally {
      processedCount = index + 1;
      const jobError = settledReplayError(host, filename, filePath, metadata, mtimeMs, fileSizeBytes, options.playerName) ?? undefined;
      options.onReplayState?.({
        name: filename,
        status: jobError ? 'failed' : interrupted || retrying ? 'queued' : 'ready',
        playable: host.hasValidReplayTrajectoryCache(filename, -1, -1, mtimeMs, fileSizeBytes, filePath),
        ...(jobError ? { error: jobError } : {}),
      });
    }
    if (interrupted) break;
  }

  if (queue.length > 0) {
    yield { processed: processedCount, total: queue.length, currentFile: '' };
  }
  const nowIso = new Date().toISOString();
  host.setMetadata('replays_last_synced_at', nowIso);
  host.setMetadata('replays_dir', replaysDir);
  return { added, updated, skipped, total: host.getReplaysCount(), lastSyncedAt: nowIso, interrupted };
}

export function syncReplaysFromDir(
  host: ReplaySyncHost,
  replaysDir: string,
  options: {
    playerName?: string;
    onProgress?: (progress: ReplaySyncProgress) => void;
    shouldStop?: () => boolean;
  } = {}
): ReplaySyncResult {
  const iterator = syncReplaysIterator(host, replaysDir, options);
  let step = iterator.next();
  while (!step.done) {
    options.onProgress?.(step.value);
    step = iterator.next();
  }
  return step.value;
}
