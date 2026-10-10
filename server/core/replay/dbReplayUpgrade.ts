import fs from 'fs';
import { ReplayFileProgress } from './replayFileProgress.js';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayMetadata, ReplayTrajectoryData } from '../types.js';
import { REPLAY_CACHE_VERSION, ReplaySyncProgress } from '../dbSchema.js';
import { getReplayDriverIngest, isReplayDriverSettled, ReplayDriverIngestStatus } from './dbReplayIngestStore.js';
import { recordDriverFailure } from './dbReplaySync.js';
import { parseReplayMetadata } from '../../replay/decode/replayParser.js';
import { extractReplayTrajectoryInWorker } from '../../replay/worker/replayTrajectoryWorkerClient.js';

// Rows written by an older, still compatible parser version are served as they are, but while LMU
// still has the .Vcr they can be decoded again at the current version. That is this upgrade: one
// driver at a time, each replaced atomically, after the sync has ingested new files. Replays LMU has
// deleted are never touched (their rows are the only copy). A driver this build already stored, or
// failed to decode, for this file version is settled and not tried again.

export interface ReplayUpgradeCandidate {
  filename: string;
  filePath: string;
  mtime: number;
  size: number;
  /** The metadata row was written by an older parser version. */
  metadataOutdated: boolean;
  /** Driver slots with rows from an older parser version, not yet settled at this version. */
  driverSlots: number[];
  /** The slot the "no driver requested" alias points at: its decode also moves the alias. */
  primarySlot: number | null;
}

export interface ReplayUpgradeProgress extends ReplaySyncProgress {
  driversDone: number;
  driversTotal: number;
}

export interface ReplayUpgradeResult {
  replays: number;
  upgraded: number;
  failed: number;
  interrupted: boolean;
}

export interface ReplayUpgradeHost {
  listReplayUpgradeBacklog(replaysDir: string): ReplayUpgradeCandidate[];
  upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void;
  replaceReplayDriverLaps(filename: string, filePath: string, mtime: number, size: number, driverSlotKey: number, trajectory: ReplayTrajectoryData, isPrimary: boolean): void;
  recordReplayDriverIngest(filename: string, driverSlot: number, mtime: number, size: number, status: ReplayDriverIngestStatus, error?: string | null): void;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
}

/** On-disk replays whose stored rows are behind the current parser version. */
export function listReplayUpgradeBacklog(db: DatabaseType, replaysDir: string): ReplayUpgradeCandidate[] {
  if (!fs.existsSync(replaysDir)) return [];
  const replays = db.prepare(
    'SELECT filename, file_path, file_mtime, file_size, parser_version FROM replay_metadata ORDER BY file_mtime DESC'
  ).all() as Array<{ filename: string; file_path: string; file_mtime: number; file_size: number; parser_version: string }>;
  const outdatedSlots = db.prepare(
    'SELECT DISTINCT driver_slot FROM replay_trajectories WHERE filename = ? AND parser_version != ? ORDER BY driver_slot'
  );
  const primary = db.prepare(
    'SELECT resolved_driver_slot FROM replay_trajectory_defaults WHERE filename = ? AND driver_slot = -1'
  );

  const backlog: ReplayUpgradeCandidate[] = [];
  for (const row of replays) {
    const filePath = path.join(replaysDir, row.filename);
    if (row.file_path !== filePath) continue;
    // Only the file the rows were decoded from: a changed file is new work for the sync.
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (Math.floor(stat.mtimeMs) !== row.file_mtime || stat.size !== row.file_size) continue;

    const driverSlots = (outdatedSlots.all(row.filename, REPLAY_CACHE_VERSION) as Array<{ driver_slot: number }>)
      .map(r => r.driver_slot)
      .filter(slot => !isReplayDriverSettled(getReplayDriverIngest(db, row.filename, slot), row.file_mtime, row.file_size));
    const metadataOutdated = row.parser_version !== REPLAY_CACHE_VERSION;
    if (driverSlots.length === 0 && !metadataOutdated) continue;
    const alias = primary.get(row.filename) as { resolved_driver_slot: number | null } | undefined;
    backlog.push({
      filename: row.filename,
      filePath,
      mtime: row.file_mtime,
      size: row.file_size,
      metadataOutdated,
      driverSlots,
      primarySlot: alias?.resolved_driver_slot ?? null,
    });
  }
  return backlog;
}

function isFileUnchanged(candidate: ReplayUpgradeCandidate): boolean {
  try {
    const stat = fs.statSync(candidate.filePath);
    return Math.floor(stat.mtimeMs) === candidate.mtime && stat.size === candidate.size;
  } catch {
    return false;
  }
}

/** Decodes the backlog again at the current parser version, yielding after every worker step. */
export async function* upgradeReplaysAsyncIterator(
  host: ReplayUpgradeHost,
  replaysDir: string,
  options: { playerName?: string; shouldStop?: () => boolean } = {}
): AsyncGenerator<ReplayUpgradeProgress, ReplayUpgradeResult, void> {
  const backlog = host.listReplayUpgradeBacklog(replaysDir);
  const driversTotal = backlog.reduce((sum, candidate) => sum + candidate.driverSlots.length, 0);
  const progress = (fields: ReplaySyncProgress): ReplayUpgradeProgress => ({ ...fields, driversDone: upgraded + failed, driversTotal });
  let upgraded = 0;
  let failed = 0;
  let interrupted = false;

  for (let index = 0; index < backlog.length && !interrupted; index++) {
    const candidate = backlog[index];
    const { filename, filePath, mtime, size } = candidate;
    const fileProgress = new ReplayFileProgress(candidate.driverSlots.length);
    if (!isFileUnchanged(candidate)) continue;

    if (candidate.metadataOutdated) {
      yield progress({ processed: index, total: backlog.length, currentFile: filename, stage: 'Upgrading metadata', filePercent: 0 });
      try {
        host.upsertReplayMetadataCache(filename, filePath, mtime, size, parseReplayMetadata(filePath, { playerName: options.playerName }));
      } catch (error) {
        // The stored metadata stays; it is still readable.
        host.recordIngestError('vcr', filePath, error);
      }
    }

    for (const slot of candidate.driverSlots) {
      if (options.shouldStop?.()) {
        interrupted = true;
        break;
      }
      try {
        // Slot -1 rows came from a decode that picked the player itself; decode them the same way.
        const extraction = extractReplayTrajectoryInWorker(filePath, {
          ...(slot === -1 ? {} : { driverSlot: slot }),
          playerName: options.playerName,
          maxPoints: 0,
          allLaps: true,
        });
        let step = await extraction.next();
        while (!step.done) {
          yield progress({ processed: index, total: backlog.length, currentFile: filename, stage: `Driver ${slot}: ${step.value.stageDescription}`, filePercent: fileProgress.decoding(step.value.percent) });
          step = await extraction.next();
        }
        // LMU may have rewritten the file while it was decoded: leave it to the next sync.
        if (!isFileUnchanged(candidate)) break;
        const isPrimary = slot === -1 || slot === candidate.primarySlot;
        const slotKey = slot === -1 ? (step.value.driverSlot ?? -1) : slot;
        yield progress({ processed: index, total: backlog.length, currentFile: filename, stage: `Driver ${slot}: Persisting trajectory cache`, filePercent: fileProgress.saving() });
        host.replaceReplayDriverLaps(filename, filePath, mtime, size, slotKey, step.value, isPrimary);
        upgraded++;
      } catch (error) {
        failed++;
        recordDriverFailure(host, filename, filePath, slot, mtime, size, error);
      }
      yield progress({ processed: index, total: backlog.length, currentFile: filename, stage: `Finished driver ${slot}`, filePercent: fileProgress.complete() });
    }
  }

  yield progress({ processed: backlog.length, total: backlog.length, currentFile: '' });
  return { replays: backlog.length, upgraded, failed, interrupted };
}
