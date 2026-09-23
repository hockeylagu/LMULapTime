import fs from 'fs';
import path from 'path';
import { ReplayMetadata, ReplayTrajectoryData } from './types.js';
import { ReplaySyncProgress, ReplaySyncResult } from './dbSchema.js';
import { parseReplayMetadata, extractReplayTrajectory } from '../replay/replayParser.js';

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
    yield { processed: i, total: files.length, currentFile: f };
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
          const trajectory = extractReplayTrajectory(filePath, { playerName: options.playerName, maxPoints: 0, allLaps: true });
          defaultDriverSlot = trajectory.driverSlot;
          cacheAllLapsForDriver(host, f, filePath, mtime, size, -1, trajectory);
          if (typeof defaultDriverSlot === 'number') {
            cacheAllLapsForDriver(host, f, filePath, mtime, size, defaultDriverSlot, trajectory);
          }
          anyTrajectoryNewlyCached = true;
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
        }
        yield { processed: i, total: files.length, currentFile: f };
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
        } catch (err) {
          host.recordIngestError('vcr', filePath, err);
        }
        yield { processed: i, total: files.length, currentFile: f };
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
