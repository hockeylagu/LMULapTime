import fs from 'fs';
import { FileIngestWorker } from '../ingest/fileIngestWorkerClient.js';
import type { ReplayIngestJob } from '../types.js';
import path from 'path';
import { ReplayMetadata, ReplayTrajectoryData } from '../types.js';
import { ReplaySyncProgress, ReplaySyncResult } from '../dbSchema.js';
import { factsDriverSlot, withoutReplayFacts } from '../../replay/decode/replayFacts.js';
import { parseReplayMetadata } from '../../replay/decode/replayParser.js';
import { extractReplayTrajectory } from '../../replay/decode/replayTrajectory.js';
import { extractReplayTrajectoryInWorker } from '../../replay/worker/replayTrajectoryWorkerClient.js';
import { isReplayDriverSettled, ReplayDriverIngest, ReplayDriverIngestStatus, replayErrorMessage, replayFailureStatus, settledReplayFailure } from './dbReplayIngestStore.js';
import { decodeOrThrow } from '../../replay/decode/replayDecodeError.js';

export interface ReplayAsyncSyncOptions {
  playerName?: string;
  shouldStop?: () => boolean;
  /** Decode again the drivers that failed MAX_DECODE_ATTEMPTS times (a manual refresh). */
  retryFailed?: boolean;
  /** Called after all metadata is discovered, before any trajectory decode. */
  onMetadataReady?: () => Set<string>;
  onReplayState?: (job: ReplayIngestJob) => void;
}

export interface ReplaySyncHost {
  getMetadata(key: string): string | null;
  setMetadata(key: string, value: string): void;
  getReplaysCount(): number;
  getReplayMetadataCache(filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null;
  upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void;
  hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): boolean;
  upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData, sourcePath?: string): void;
  setReplayTrajectoryDefaults(filename: string, driverSlot: number, defaultLapKey: number | null, resolvedDriverSlot?: number | null): void;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
  /** Replaces a driver's whole lap set in one transaction and records it as stored. */
  replaceReplayDriverLaps(filename: string, filePath: string, mtime: number, size: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
  getReplayDriverIngest(filename: string, driverSlot: number): ReplayDriverIngest | null;
  recordReplayDriverIngest(filename: string, driverSlot: number, mtime: number, size: number, status: ReplayDriverIngestStatus, error?: string | null): void;
}

/**
 * Persists every lap of an `allLaps: true` trajectory result under its own (driverSlot, lap)
 * cache row. The "no explicit lap requested" default is recorded as a pointer instead of a
 * second copy of the chosen lap's blob. Rows leave out what the normalized replay tables hold, so
 * the caller writes those facts in the same transaction (replaceReplayDriverLaps).
 */
export function cacheAllLapsForDriver(
  host: ReplaySyncHost,
  filename: string,
  filePath: string,
  mtime: number,
  size: number,
  driverSlotKey: number,
  trajectory: ReplayTrajectoryData
): void {
  const perLap = trajectory.allLapsData && trajectory.allLapsData.length > 0 ? trajectory.allLapsData : [trajectory];
  const factsSlot = factsDriverSlot(driverSlotKey, trajectory);
  const store = (lapKey: number, lap: ReplayTrajectoryData): void =>
    host.upsertReplayTrajectoryCache(filename, driverSlotKey, lapKey, mtime, size, withoutReplayFacts(lap, factsSlot), filePath);
  let storedDefaultLap = false;
  for (const lapTrajectory of perLap) {
    if (typeof lapTrajectory.currentLap !== 'number') continue;
    const { allLapsData: _unused, ...single } = lapTrajectory;
    store(lapTrajectory.currentLap, single);
    if (lapTrajectory.currentLap === trajectory.currentLap) storedDefaultLap = true;
  }

  if (storedDefaultLap && typeof trajectory.currentLap === 'number') {
    host.setReplayTrajectoryDefaults(filename, driverSlotKey, trajectory.currentLap);
    return;
  }

  // No numbered row covers the chosen lap, so it must still be stored under the -1 key.
  const { allLapsData: _unused2, ...defaultSingle } = trajectory;
  store(-1, defaultSingle);
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

  for (let i = 0; i < files.length; i++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const f = files[i];
    yield { processed: i, total: files.length, currentFile: f, stage: 'Verifying container and metadata', filePercent: 5 };
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
          yield { processed: i, total: files.length, currentFile: f, stage: 'Persisting trajectory cache', filePercent: 95 };
          const primarySlot = typeof defaultDriverSlot === 'number' ? defaultDriverSlot : -1;
          host.replaceReplayDriverLaps(f, filePath, mtime, size, primarySlot, trajectory, true);
          anyTrajectoryNewlyCached = true;
          const totalLaps = trajectory.allLapsData?.length || trajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for primary driver (${trajectory.driverName || 'Player'}) in ${f}`);
        } catch (err) {
          recordDriverFailure(host, f, filePath, -1, mtime, size, err);
        }
        yield { processed: i, total: files.length, currentFile: f, stage: 'Completed primary driver', filePercent: 100 };
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
        yield { processed: i, total: files.length, currentFile: f, stage: `Cached driver ${driver.name}`, filePercent: 100 };
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

  yield { processed: processedCount, total: files.length, currentFile: '' };

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
  const worker = new FileIngestWorker();
  try {
    for (let index = 0; index < files.length; index++) {
      const filename = files[index];
      const filePath = path.join(replaysDir, filename);
      yield { processed: index, total: files.length, currentFile: filename, stage: 'Indexing replay metadata', filePercent: 0 };
      try {
        const stat = fs.statSync(filePath);
        const mtime = Math.floor(stat.mtimeMs);
        const size = stat.size;
        let metadata = host.getReplayMetadataCache(filename, mtime, size, filePath);
        const isNewMetadata = !metadata;
        if (!metadata) {
          metadata = await worker.parseReplay(filePath, options.playerName);
          host.upsertReplayMetadataCache(filename, filePath, mtime, size, metadata);
          host.clearIngestError('vcr', filePath);
          added++;
        }
        discovered.push({ filename, filePath, mtime, size, metadata, isNewMetadata });
      } catch (error: unknown) {
        host.recordIngestError('vcr', filePath, error); skipped++;
        options.onReplayState?.({ name: filename, status: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally { await worker.close(); }
  const associated = options.onMetadataReady?.();
  // Newest first: the replay of the session just driven is ready before older ones are retried.
  const queue = (associated ? discovered.filter(file => associated.has(file.filename)) : discovered)
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of queue) options.onReplayState?.({ name: file.filename, status: 'queued' });
  for (let index = 0; index < queue.length; index++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const { filename, filePath, mtime, size, metadata, isNewMetadata } = queue[index];
    let fileError: string | undefined;
    let retrying = false;
    options.onReplayState?.({ name: filename, status: 'processing' });
    yield { processed: index, total: queue.length, currentFile: filename, stage: 'Verifying trajectory cache', filePercent: 5 };
    try {
      let trajectoryCached = false;
      let defaultDriverSlot: number | undefined;
      if (driverNeedsDecode(host, filename, -1, mtime, size, filePath, options.retryFailed)) {
        try {
          const extraction = extractReplayTrajectoryInWorker(filePath, {
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
          });
          let step = await extraction.next();
          while (!step.done) {
            yield {
              processed: index,
              total: queue.length,
              currentFile: filename,
              stage: step.value.stageDescription,
              filePercent: step.value.percent,
            };
            step = await extraction.next();
          }
          const trajectory = step.value;
          defaultDriverSlot = trajectory.driverSlot;
          yield { processed: index, total: queue.length, currentFile: filename, stage: 'Persisting trajectory cache', filePercent: 95 };
          const primarySlot = typeof defaultDriverSlot === 'number' ? defaultDriverSlot : -1;
          host.replaceReplayDriverLaps(filename, filePath, mtime, size, primarySlot, trajectory, true);
          trajectoryCached = true;
        } catch (error) {
          // Retried at the next scan: the replay stays queued until it has failed too often (see settledError).
          retrying = true;
          recordDriverFailure(host, filename, filePath, -1, mtime, size, error);
        }
      }

      for (const driver of metadata.drivers) {
        if (options.shouldStop?.()) {
          interrupted = true;
          break;
        }
        if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
        if (!driverNeedsDecode(host, filename, driver.slot, mtime, size, filePath, options.retryFailed)) continue;
        try {
          const extraction = extractReplayTrajectoryInWorker(filePath, {
            driverSlot: driver.slot,
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
          });
          let step = await extraction.next();
          while (!step.done) {
            yield {
              processed: index,
              total: queue.length,
              currentFile: filename,
              stage: step.value.stageDescription,
              filePercent: step.value.percent,
            };
            step = await extraction.next();
          }
          host.replaceReplayDriverLaps(filename, filePath, mtime, size, driver.slot, step.value, false);
          trajectoryCached = true;
        } catch (error) {
          // Retried at the next scan: the replay stays queued until it has failed too often (see settledError).
          retrying = true;
          recordDriverFailure(host, filename, filePath, driver.slot, mtime, size, error);
        }
      }

      if (!isNewMetadata && trajectoryCached) updated++;
    } catch (error) {
      fileError = error instanceof Error ? error.message : String(error);
      host.recordIngestError('vcr', filePath, error);
      console.error(`Error caching replay file ${filePath}:`, error);
    } finally {
      processedCount = index + 1;
      const settledError = [-1, ...metadata.drivers.flatMap(driver => typeof driver.slot === 'number' ? [driver.slot] : [])]
        .map(slot => settledReplayFailure(host.getReplayDriverIngest(filename, slot), mtime, size))
        .find(error => error !== null);
      const jobError = fileError ?? settledError ?? undefined;
      options.onReplayState?.({
        name: filename,
        status: jobError ? 'failed' : interrupted || retrying ? 'queued' : 'ready',
        playable: host.hasValidReplayTrajectoryCache(filename, -1, -1, mtime, size, filePath),
        ...(jobError ? { error: jobError } : {}),
      });
    }
    if (interrupted) break;
  }

  yield { processed: processedCount, total: queue.length, currentFile: '' };
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
