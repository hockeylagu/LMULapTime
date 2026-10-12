import fs from 'fs';
import { FileIngestWorker } from '../ingest/fileIngestWorkerClient.js';
import type { ReplayIngestJob } from '../types.js';
import path from 'path';
import { ReplayMetadata, ReplayTrajectoryData } from '../types.js';
import { ReplaySyncProgress, ReplaySyncResult } from '../dbSchema.js';
import { parseReplayMetadata } from '../../replay/decode/replayParser.js';
import { extractReplayTrajectory } from '../../replay/decode/replayTrajectory.js';
import { storeReplayDriversInWorker } from '../../replay/worker/replayTrajectoryWorkerClient.js';
import { isReplayDriverSettled, ReplayDriverIngest, ReplayDriverIngestStatus, replayErrorMessage, replayFailureStatus, settledReplayFailure } from './dbReplayIngestStore.js';
import { ReplayDecodeError, decodeOrThrow } from '../../replay/decode/replayDecodeError.js';

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
  getReplayMetadataCache(filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null;
  upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void;
  hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): boolean;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
  /** Replaces a driver's whole lap set in one transaction and records it as stored. */
  replaceReplayDriverLaps(filename: string, filePath: string, mtime: number, size: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
  getReplayDriverIngest(filename: string, driverSlot: number): ReplayDriverIngest | null;
  getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): ReplayTrajectoryData | null;
  recordReplayDriverIngest(filename: string, driverSlot: number, mtime: number, size: number, status: ReplayDriverIngestStatus, error?: string | null): void;
}

/**
 * Whether a driver still has to be decoded for this file version: not when this build already stored it
 * or it failed too often (see isReplayDriverSettled; retried after a parser version change or an explicit
 * retry), nor when compatible rows are already stored. Slot -1 stands for the player's decode, which picks
 * the slot itself.
 */
function driverNeedsDecode(host: ReplaySyncHost, filename: string, driverSlot: number, mtime: number, size: number, filePath: string, retryFailed = false): boolean {
  const previous = host.getReplayDriverIngest(filename, driverSlot);
  if (isReplayDriverSettled(previous, mtime, size) && !(retryFailed && previous?.status !== 'stored')) return false;
  return !host.hasValidReplayTrajectoryCache(filename, driverSlot, -1, mtime, size, filePath);
}

/** Whether the player's decode or any driver of this replay still has to be decoded for this file version (see driverNeedsDecode). */
function replayNeedsDecode(
  host: ReplaySyncHost,
  file: { filename: string; filePath: string; mtime: number; size: number; metadata: ReplayMetadata },
  retryFailed = false
): boolean {
  if (driverNeedsDecode(host, file.filename, -1, file.mtime, file.size, file.filePath, retryFailed)) {
    return true;
  }
  for (const driver of file.metadata.drivers) {
    if (typeof driver.slot === 'number' && driverNeedsDecode(host, file.filename, driver.slot, file.mtime, file.size, file.filePath, retryFailed)) {
      return true;
    }
  }
  return false;
}

/** The error of the first driver of this replay that failed too often to be tried again, or null. */
function settledReplayError(host: ReplaySyncHost, filename: string, metadata: ReplayMetadata, mtime: number, size: number): string | null {
  return [-1, ...metadata.drivers.flatMap(driver => typeof driver.slot === 'number' ? [driver.slot] : [])]
    .map(slot => settledReplayFailure(host.getReplayDriverIngest(filename, slot), mtime, size))
    .find(error => error !== null) ?? null;
}

/** Records a decode that threw, as rejected by the decoder or interrupted; either is tried again (see isReplayDriverSettled). */
export function recordDriverFailure(host: Pick<ReplaySyncHost, 'recordIngestError' | 'recordReplayDriverIngest'>, filename: string, filePath: string, driverSlot: number, mtime: number, size: number, error: unknown): void {
  const message = replayErrorMessage(error);
  host.recordIngestError('vcr', filePath, message);
  host.recordReplayDriverIngest(filename, driverSlot, mtime, size, replayFailureStatus(error), message);
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
      const mtime = Math.floor(stat.mtimeMs);
      const metadata = host.getReplayMetadataCache(f, mtime, stat.size, filePath);
      return !metadata || replayNeedsDecode(host, { filename: f, filePath, mtime, size: stat.size, metadata });
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
      const mtime = Math.floor(stat.mtimeMs);
      const size = stat.size;

      let metadata = host.getReplayMetadataCache(f, mtime, size, filePath);
      const isNewMetadata = !metadata;
      if (!metadata) {
        try {
          metadata = parseReplayMetadata(filePath, { playerName: options.playerName });
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
          skipped++; // invalid or currently-active recording file
          continue;
        }
        host.upsertReplayMetadataCache(f, filePath, mtime, size, metadata);
        host.clearIngestError('vcr', filePath);
      }

      let anyTrajectoryNewlyCached = false;

      let defaultDriverSlot: number | undefined;
      if (driverNeedsDecode(host, f, -1, mtime, size, filePath)) {
        try {
          const trajectory = decodeOrThrow(() => extractReplayTrajectory(filePath, {
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
            onProgress: (_prog) => {
              // Yield sub-file progress if desired or track stage
            },
          }));
          defaultDriverSlot = trajectory.driverSlot;
          const primarySlot = typeof defaultDriverSlot === 'number' ? defaultDriverSlot : -1;
          host.replaceReplayDriverLaps(f, filePath, mtime, size, primarySlot, trajectory, true);
          anyTrajectoryNewlyCached = true;
          const totalLaps = trajectory.allLapsData?.length || trajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for primary driver (${trajectory.driverName || 'Player'}) in ${f}`);
        } catch (err) {
          recordDriverFailure(host, f, filePath, -1, mtime, size, err);
        }
        yield { processed: i, total: pending.length, currentFile: f, stage: 'Completed primary driver', filePercent: 100 };
      }

      for (const driver of metadata.drivers) {
        if (options.shouldStop?.()) {
          interrupted = true;
          break;
        }
        if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
        if (!driverNeedsDecode(host, f, driver.slot, mtime, size, filePath)) continue;
        try {
          const driverTrajectory = decodeOrThrow(() => extractReplayTrajectory(filePath, {
            driverSlot: driver.slot,
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
          }));
          host.replaceReplayDriverLaps(f, filePath, mtime, size, driver.slot, driverTrajectory, false);
          anyTrajectoryNewlyCached = true;
          const totalLaps = driverTrajectory.allLapsData?.length || driverTrajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for driver slot ${driver.slot} (${driver.name}) in ${f}`);
        } catch (err) {
          recordDriverFailure(host, f, filePath, driver.slot, mtime, size, err);
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

  const files = fs.readdirSync(replaysDir).filter(f => f.toLowerCase().endsWith('.vcr'));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let interrupted = false;
  let processedCount = 0;

  // Discover every recording first, so all XML sessions can be linked before a slow decode.
  const discovered: Array<{ filename: string; filePath: string; mtime: number; size: number; metadata: ReplayMetadata; isNewMetadata: boolean }> = [];
  const filesToParse: Array<{ filename: string; filePath: string; mtime: number; size: number }> = [];

  for (let index = 0; index < files.length; index++) {
    const filename = files[index];
    const filePath = path.join(replaysDir, filename);
    try {
      const stat = fs.statSync(filePath);
      const mtime = Math.floor(stat.mtimeMs);
      const size = stat.size;
      const metadata = host.getReplayMetadataCache(filename, mtime, size, filePath);
      if (metadata) {
        discovered.push({ filename, filePath, mtime, size, metadata, isNewMetadata: false });
      } else {
        filesToParse.push({ filename, filePath, mtime, size });
      }
    } catch (error: unknown) {
      host.recordIngestError('vcr', filePath, error);
      skipped++;
      options.onReplayState?.({ name: filename, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (filesToParse.length > 0) {
    const worker = new FileIngestWorker();
    try {
      for (let i = 0; i < filesToParse.length; i++) {
        const { filename, filePath, mtime, size } = filesToParse[i];
        yield { processed: i, total: filesToParse.length, currentFile: filename, stage: 'Indexing replay metadata', filePercent: 0 };
        try {
          const metadata = await worker.parseReplay(filePath, options.playerName);
          host.upsertReplayMetadataCache(filename, filePath, mtime, size, metadata);
          host.clearIngestError('vcr', filePath);
          added++;
          discovered.push({ filename, filePath, mtime, size, metadata, isNewMetadata: true });
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
    .sort((a, b) => b.mtime - a.mtime);
  const queue = candidates.filter(file => replayNeedsDecode(host, file, options.retryFailed));

  // Replays with nothing left to decode stay out of the progress count, but one that failed too often
  // still reports it, so its button keeps saying Refresh to retry.
  for (const file of candidates) {
    if (queue.includes(file)) continue;
    const error = settledReplayError(host, file.filename, file.metadata, file.mtime, file.size);
    if (error) {
      options.onReplayState?.({ name: file.filename, status: 'failed', error,
        playable: host.hasValidReplayTrajectoryCache(file.filename, -1, -1, file.mtime, file.size, file.filePath) });
    }
  }

  for (const file of queue) options.onReplayState?.({ name: file.filename, status: 'queued' });
  for (let index = 0; index < queue.length; index++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const { filename, filePath, mtime, size, metadata, isNewMetadata } = queue[index];
    const primaryPending = driverNeedsDecode(host, filename, -1, mtime, size, filePath, options.retryFailed);
    const pendingSlots = new Set(metadata.drivers.flatMap(driver =>
      typeof driver.slot === 'number' && driverNeedsDecode(host, filename, driver.slot, mtime, size, filePath, options.retryFailed)
        ? [driver.slot] : []));
    let retrying = false;
    options.onReplayState?.({ name: filename, status: 'processing' });
    yield { processed: index, total: queue.length, currentFile: filename, stage: 'Verifying trajectory cache', filePercent: 5 };
    try {
      let trajectoryCached = false;
      const extraction = storeReplayDriversInWorker(host, filePath, { playerName: options.playerName }, {
        filename, mtime, size, driverSlots: [...pendingSlots], includePrimary: primaryPending,
      });
      let step = await extraction.next();
      let filePercent = 5;
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
          step = await extraction.next();
        }
      } finally {
        if (!step.done) await extraction.return({ drivers: [], failures: [] });
      }
      if (step.done) {
        trajectoryCached = step.value.drivers.length > 0;
        for (const failure of step.value.failures) {
          retrying = true;
          const error = failure.code ? Object.assign(new Error(failure.message), { code: failure.code }) : new ReplayDecodeError(failure.message);
          recordDriverFailure(host, filename, filePath, failure.driverSlotKey, mtime, size, error);
          if (failure.isPrimary && failure.driverSlotKey !== -1) recordDriverFailure(host, filename, filePath, -1, mtime, size, error);
        }
        yield { processed: index, total: queue.length, currentFile: filename, stage: 'Finished replay drivers', filePercent: 100 };
      }
      if (!isNewMetadata && trajectoryCached) updated++;
    } catch (error) {
      // A later driver can crash the worker after earlier driver transactions committed.
      for (const slot of [...pendingSlots, ...(primaryPending ? [-1] : [])]) {
        const attempt = host.getReplayDriverIngest(filename, slot);
        if (attempt?.status === 'stored' && isReplayDriverSettled(attempt, mtime, size)) continue;
        recordDriverFailure(host, filename, filePath, slot, mtime, size, error);
      }
      retrying = true;
    } finally {
      processedCount = index + 1;
      const jobError = settledReplayError(host, filename, metadata, mtime, size) ?? undefined;
      options.onReplayState?.({
        name: filename,
        status: jobError ? 'failed' : interrupted || retrying ? 'queued' : 'ready',
        playable: host.hasValidReplayTrajectoryCache(filename, -1, -1, mtime, size, filePath),
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
