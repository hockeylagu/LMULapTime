import fs from 'fs';
import path from 'path';
import { ReplayMetadata, ReplayTrajectoryData } from './types.js';
import { ReplaySyncProgress, ReplaySyncResult } from './dbSchema.js';
import { parseReplayMetadata, extractReplayTrajectory } from '../replay/replayParser.js';
import { extractReplayTrajectoryInWorker } from '../replay/replayTrajectoryWorkerClient.js';

export interface ReplaySyncHost {
  getMetadata(key: string): string | null;
  setMetadata(key: string, value: string): void;
  getReplaysCount(): number;
  getReplayMetadataCache(filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null;
  upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void;
  hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): boolean;
  upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData, sourcePath?: string): void;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
}

/**
 * Persists every lap of an `allLaps: true` trajectory result under its own (driverSlot, lap)
 * cache row, plus one extra row keyed by lap -1 mirroring the trajectory's chosen/best lap -
 * matching the cache-key convention used for "no explicit lap requested" lookups.
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
  for (const lapTrajectory of perLap) {
    if (typeof lapTrajectory.currentLap !== 'number') continue;
    const { allLapsData: _unused, ...single } = lapTrajectory;
    host.upsertReplayTrajectoryCache(filename, driverSlotKey, lapTrajectory.currentLap, mtime, size, single, filePath);
  }
  const { allLapsData: _unused2, ...defaultSingle } = trajectory;
  host.upsertReplayTrajectoryCache(filename, driverSlotKey, -1, mtime, size, defaultSingle, filePath);
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
      if (!host.hasValidReplayTrajectoryCache(f, -1, -1, mtime, size, filePath)) {
        try {
          const trajectory = extractReplayTrajectory(filePath, {
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
            onProgress: (_prog) => {
              // Yield sub-file progress if desired or track stage
            },
          });
          defaultDriverSlot = trajectory.driverSlot;
          yield { processed: i, total: files.length, currentFile: f, stage: 'Persisting trajectory cache', filePercent: 95 };
          cacheAllLapsForDriver(host, f, filePath, mtime, size, -1, trajectory);
          if (typeof defaultDriverSlot === 'number') {
            cacheAllLapsForDriver(host, f, filePath, mtime, size, defaultDriverSlot, trajectory);
          }
          anyTrajectoryNewlyCached = true;
          const totalLaps = trajectory.allLapsData?.length || trajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for primary driver (${trajectory.driverName || 'Player'}) in ${f}`);
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
        }
        yield { processed: i, total: files.length, currentFile: f, stage: 'Completed primary driver', filePercent: 100 };
      }

      for (const driver of metadata.drivers) {
        if (options.shouldStop?.()) {
          interrupted = true;
          break;
        }
        if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
        if (host.hasValidReplayTrajectoryCache(f, driver.slot, -1, mtime, size, filePath)) continue;
        try {
          const driverTrajectory = extractReplayTrajectory(filePath, {
            driverSlot: driver.slot,
            playerName: options.playerName,
            maxPoints: 0,
            allLaps: true,
          });
          cacheAllLapsForDriver(host, f, filePath, mtime, size, driver.slot, driverTrajectory);
          anyTrajectoryNewlyCached = true;
          const totalLaps = driverTrajectory.allLapsData?.length || driverTrajectory.laps?.length || 1;
          console.log(`[SQLite Cache] [7/7] Cached ${totalLaps} laps for driver slot ${driver.slot} (${driver.name}) in ${f}`);
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
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
  options: {
    playerName?: string;
    shouldStop?: () => boolean;
  } = {}
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

  for (let index = 0; index < files.length; index++) {
    if (options.shouldStop?.()) {
      interrupted = true;
      break;
    }
    const filename = files[index];
    yield { processed: index, total: files.length, currentFile: filename, stage: 'Verifying container and metadata', filePercent: 5 };
    const filePath = path.join(replaysDir, filename);
    try {
      const stat = fs.statSync(filePath);
      const mtime = Math.floor(stat.mtimeMs);
      const size = stat.size;
      let metadata = host.getReplayMetadataCache(filename, mtime, size, filePath);
      const isNewMetadata = !metadata;
      if (!metadata) {
        try {
          metadata = parseReplayMetadata(filePath, { playerName: options.playerName });
        } catch (error) {
          host.recordIngestError('vcr', filePath, error);
          skipped++;
          continue;
        }
        host.upsertReplayMetadataCache(filename, filePath, mtime, size, metadata);
        host.clearIngestError('vcr', filePath);
      }

      let trajectoryCached = false;
      let defaultDriverSlot: number | undefined;
      if (!host.hasValidReplayTrajectoryCache(filename, -1, -1, mtime, size, filePath)) {
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
              total: files.length,
              currentFile: filename,
              stage: step.value.stageDescription,
              filePercent: step.value.percent,
            };
            step = await extraction.next();
          }
          const trajectory = step.value;
          defaultDriverSlot = trajectory.driverSlot;
          yield { processed: index, total: files.length, currentFile: filename, stage: 'Persisting trajectory cache', filePercent: 95 };
          cacheAllLapsForDriver(host, filename, filePath, mtime, size, -1, trajectory);
          if (typeof defaultDriverSlot === 'number') {
            cacheAllLapsForDriver(host, filename, filePath, mtime, size, defaultDriverSlot, trajectory);
          }
          trajectoryCached = true;
        } catch (error) {
          host.recordIngestError('vcr', filePath, error);
        }
      }

      for (const driver of metadata.drivers) {
        if (options.shouldStop?.()) {
          interrupted = true;
          break;
        }
        if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
        if (host.hasValidReplayTrajectoryCache(filename, driver.slot, -1, mtime, size, filePath)) continue;
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
              total: files.length,
              currentFile: filename,
              stage: step.value.stageDescription,
              filePercent: step.value.percent,
            };
            step = await extraction.next();
          }
          cacheAllLapsForDriver(host, filename, filePath, mtime, size, driver.slot, step.value);
          trajectoryCached = true;
        } catch (error) {
          host.recordIngestError('vcr', filePath, error);
        }
      }

      if (isNewMetadata) added++;
      else if (trajectoryCached) updated++;
    } catch (error) {
      host.recordIngestError('vcr', filePath, error);
      console.error(`Error caching replay file ${filePath}:`, error);
    } finally {
      processedCount = index + 1;
    }
    if (interrupted) break;
  }

  yield { processed: processedCount, total: files.length, currentFile: '' };
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
