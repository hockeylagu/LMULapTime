import fs from 'fs';
import { SessionDatabase } from '../core/db.js';
import { parseReplayMetadata } from './decode/replayParser.js';
import { extractReplayTrajectoryInWorker } from './worker/replayTrajectoryWorkerClient.js';
import { isReplayDriverSettled } from '../core/replay/dbReplayIngestStore.js';
import { lapEdgesFromNeighbours } from './decode/replayLapPoints.js';
import { ReplayDriverNotRecordedError } from './replayServiceTypes.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';

export interface ReplayCacheServiceOptions {
  playerName?: string;
}

export class ReplayCacheService {
  // Decodes in flight, by replay, driver and file version (see decodeDriver).
  private readonly pendingDecodes = new Map<string, Promise<ReplayTrajectoryData>>();

  public constructor(private readonly sessionDb: SessionDatabase) {}

  public getMetadata(filePath: string, replayName: string, playerName?: string): ReplayMetadata {
    if (!fs.existsSync(filePath)) {
      const stored = this.sessionDb.getStoredReplayMetadata(replayName);
      if (stored) return stored;
      throw new Error(`Replay file and cached metadata not found: ${replayName}`);
    }
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const cached = this.sessionDb.getReplayMetadataCache(replayName, mtime, stat.size, filePath);
    if (cached) return cached;
    const metadata = parseReplayMetadata(filePath, { playerName });
    this.sessionDb.upsertReplayMetadataCache(replayName, filePath, mtime, stat.size, metadata);
    return metadata;
  }

  public resolveDriverSlot(
    filePath: string,
    replayName: string,
    driverName?: string,
    playerName?: string
  ): number | undefined {
    if (!driverName) return undefined;
    try {
      const metadata = this.getMetadata(filePath, replayName, playerName);
      const target = driverName.toLowerCase();
      const match = metadata.drivers.find(driver => {
        const name = driver.name.toLowerCase();
        return name === target || name.includes(target) || target.includes(name);
      });
      return typeof match?.slot === 'number' ? match.slot : undefined;
    } catch {
      return undefined;
    }
  }

  public async getFullTrajectory(
    filePath: string,
    replayName: string,
    options: { driverSlot?: number; driverName?: string; lapNumber?: number; playerName?: string }
  ): Promise<ReplayTrajectoryData> {
    const resolvedSlot = typeof options.driverSlot === 'number'
      ? options.driverSlot
      : this.resolveDriverSlot(filePath, replayName, options.driverName, options.playerName);
    const driverSlotKey = typeof resolvedSlot === 'number' ? resolvedSlot : -1;
    const lapKey = typeof options.lapNumber === 'number' ? options.lapNumber : -1;

    if (!fs.existsSync(filePath)) {
      const stored = this.sessionDb.getStoredReplayTrajectory(replayName, driverSlotKey, lapKey, { allowFallback: true });
      if (stored) return this.withLapEdges(replayName, stored);
      if (driverSlotKey !== -1 && this.sessionDb.getStoredReplayMetadata(replayName)) {
        throw new ReplayDriverNotRecordedError(driverSlotKey, replayName);
      }
      throw new Error(`Replay file and cached trajectory not found: ${replayName}`);
    }

    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const cached = this.sessionDb.getReplayTrajectoryCache(replayName, driverSlotKey, lapKey, mtime, stat.size, filePath);
    if (cached) return this.withLapEdges(replayName, cached);

    // A decode that already failed for this file and parser version would fail again (see A2 in
    // dbReplayIngestStore): it is retried only after the parser version changes.
    const attempt = this.sessionDb.getReplayDriverIngest(replayName, driverSlotKey);
    if (attempt?.status === 'failed' && isReplayDriverSettled(attempt, mtime, stat.size)) {
      throw new Error(`Replay ${replayName} could not be decoded for driver ${driverSlotKey}: ${attempt.error ?? 'unknown error'}`);
    }

    const decoded = await this.decodeDriver(filePath, replayName, driverSlotKey, mtime, stat.size, options.playerName);
    const laps = decoded.allLapsData && decoded.allLapsData.length > 0 ? decoded.allLapsData : [decoded];
    // The requested lap, or the default lap (the best one) when the recording has no such lap.
    const { allLapsData: _unused, ...chosen } = laps.find(lap => lap.currentLap === options.lapNumber) ?? decoded;
    return this.withLapEdges(replayName, chosen);
  }

  /**
   * Decodes every lap of one driver in the worker thread, off the event loop, and stores the set
   * the way the sync does (replaceReplayDriverLaps). Requests for the same driver while it decodes
   * share the one decode.
   */
  private decodeDriver(
    filePath: string,
    replayName: string,
    driverSlotKey: number,
    mtime: number,
    size: number,
    playerName?: string
  ): Promise<ReplayTrajectoryData> {
    const key = `${replayName}\0${driverSlotKey}\0${mtime}\0${size}`;
    const pending = this.pendingDecodes.get(key);
    if (pending) return pending;

    const decode = (async (): Promise<ReplayTrajectoryData> => {
      // Stores the file's metadata first: if the file is another recording than the stored rows under
      // its name, those are renamed out of the way before the decoded laps take the name.
      this.getMetadata(filePath, replayName, playerName);
      const extraction = extractReplayTrajectoryInWorker(filePath, {
        ...(driverSlotKey === -1 ? {} : { driverSlot: driverSlotKey }),
        playerName,
        maxPoints: 0,
        allLaps: true,
      });
      let step = await extraction.next();
      while (!step.done) step = await extraction.next();
      const trajectory = step.value;
      // No driver asked for: the decode picked the player, whose laps are also the default.
      const isPrimary = driverSlotKey === -1;
      const slotKey = isPrimary && typeof trajectory.driverSlot === 'number' ? trajectory.driverSlot : driverSlotKey;
      this.sessionDb.replaceReplayDriverLaps(replayName, filePath, mtime, size, slotKey, trajectory, isPrimary);
      return trajectory;
    })();
    this.pendingDecodes.set(key, decode);
    return decode
      .catch((error: unknown) => {
        this.sessionDb.recordIngestError('vcr', filePath, error);
        this.sessionDb.recordReplayDriverIngest(replayName, driverSlotKey, mtime, size, 'failed', error instanceof Error ? error.message : String(error));
        throw error;
      })
      .finally(() => this.pendingDecodes.delete(key));
  }

  /**
   * Attaches the recording either side of the lap (leadInPoints / leadOutPoints) from the stored
   * rows of the neighbouring laps, so the lap can be cut exactly at the start/finish line. Read
   * from the database only: it works for replays LMU has deleted, and never decodes a file.
   */
  private withLapEdges(replayName: string, trajectory: ReplayTrajectoryData): ReplayTrajectoryData {
    if (typeof trajectory.currentLap !== 'number') return trajectory;
    const slotKey = typeof trajectory.driverSlot === 'number' ? trajectory.driverSlot : -1;
    const { previous, next } = this.sessionDb.getAdjacentLapTrajectories(replayName, slotKey, trajectory.currentLap);
    const { leadIn, leadOut } = lapEdgesFromNeighbours(trajectory.points, previous?.points, next?.points);
    return {
      ...trajectory,
      leadInPoints: leadIn.length > 0 ? leadIn : undefined,
      leadOutPoints: leadOut.length > 0 ? leadOut : undefined,
    };
  }
}
