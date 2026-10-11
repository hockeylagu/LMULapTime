import fs from 'fs';
import { SessionDatabase } from '../core/db.js';
import { parseReplayMetadata } from './decode/replayParser.js';
import { extractReplayTrajectoryInWorker } from './worker/replayTrajectoryWorkerClient.js';
import { settledReplayFailure } from '../core/replay/dbReplayIngestStore.js';
import { recordDriverFailure } from '../core/replay/dbReplaySync.js';
import { decodeOrThrow } from './decode/replayDecodeError.js';
import { lapEdgesFromNeighbours } from './decode/replayLapPoints.js';
import { ReplayDriverNotRecordedError } from './replayServiceTypes.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';

/** Serves retained replay recordings from SQLite, decoding missing drivers in a worker. */
export class ReplayRecordingService {
  // Decodes in flight, by replay, driver and file version (see decodeDriver).
  private readonly pendingDecodes = new Map<string, Promise<ReplayTrajectoryData>>();

  public constructor(private readonly sessionDb: SessionDatabase) {}

  public getMetadata(filePath: string, replayName: string, playerName?: string): ReplayMetadata {
    if (!fs.existsSync(filePath)) {
      const stored = this.sessionDb.getStoredReplayMetadata(replayName, playerName);
      if (stored) return stored;
      throw new Error(`Replay file and cached metadata not found: ${replayName}`);
    }
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const cached = this.sessionDb.getReplayMetadataCache(replayName, mtime, stat.size, filePath, playerName);
    if (cached) return cached;
    const metadata = decodeOrThrow(() => parseReplayMetadata(filePath, { playerName }));
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
      const target = driverName.trim().toLowerCase();
      if (!target) return undefined;
      const matches = metadata.drivers.filter(driver => driver.name.trim().toLowerCase() === target);
      const match = matches.length === 1 ? matches[0] : undefined;
      return typeof match?.slot === 'number' ? match.slot : undefined;
    } catch {
      return undefined;
    }
  }

  private resolvePlayerSlot(filePath: string, replayName: string, playerName?: string): number | undefined {
    try {
      const drivers = this.getMetadata(filePath, replayName, playerName).drivers;
      if (playerName?.trim()) {
        const name = playerName.trim().toLowerCase();
        const matches = drivers.filter(driver => driver.name.trim().toLowerCase() === name);
        return matches.length === 1 ? matches[0].slot : undefined;
      }
      const players = drivers.filter(driver => driver.isPlayer);
      return players.length === 1 ? players[0].slot : undefined;
    } catch {
      return undefined;
    }
  }

  public async getFullTrajectory(
    filePath: string,
    replayName: string,
    options: { driverSlot?: number; driverName?: string; lapNumber?: number; playerName?: string }
  ): Promise<ReplayTrajectoryData> {
    if (options.driverName !== undefined && !options.driverName.trim()) {
      throw new ReplayDriverNotRecordedError(-1, replayName);
    }
    const explicitDriver = typeof options.driverSlot === 'number' || Boolean(options.driverName?.trim());
    if (!explicitDriver && !fs.existsSync(filePath) && !this.sessionDb.getStoredReplayMetadata(replayName, options.playerName)) {
      throw new Error(`Replay file and cached trajectory not found: ${replayName}`);
    }
    const resolvedSlot = typeof options.driverSlot === 'number'
      ? options.driverSlot
      : options.driverName?.trim()
        ? this.resolveDriverSlot(filePath, replayName, options.driverName, options.playerName)
        : this.resolvePlayerSlot(filePath, replayName, options.playerName);
    if (resolvedSlot === undefined) {
      throw new ReplayDriverNotRecordedError(-1, replayName);
    }
    const driverSlotKey = resolvedSlot;
    if (typeof options.driverSlot === 'number') {
      let metadata: ReplayMetadata | null = null;
      try {
        metadata = fs.existsSync(filePath)
          ? this.getMetadata(filePath, replayName, options.playerName)
        : this.sessionDb.getStoredReplayMetadata(replayName, options.playerName);
      } catch { /* The worker records corrupt-file failures below. */ }
      if (metadata && !metadata.drivers.some(driver => driver.slot === driverSlotKey)) {
        throw new ReplayDriverNotRecordedError(driverSlotKey, replayName);
      }
    }
    const lapKey = typeof options.lapNumber === 'number' ? options.lapNumber : -1;

    if (!fs.existsSync(filePath)) {
      const stored = this.sessionDb.getStoredReplayTrajectory(replayName, driverSlotKey, lapKey, { allowFallback: !explicitDriver });
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

    // A file version the decoder rejected would be rejected again, as would one whose decode was
    // interrupted too many times (see dbReplayIngestStore): retried once the file or parser version changes.
    const settledError = settledReplayFailure(this.sessionDb.getReplayDriverIngest(replayName, driverSlotKey), mtime, stat.size);
    if (settledError !== null) {
      throw new Error(`Replay ${replayName} could not be decoded for driver ${driverSlotKey}: ${settledError}`);
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
        driverSlot: driverSlotKey,
        playerName,
        maxPoints: 0,
        allLaps: true,
      });
      let step = await extraction.next();
      while (!step.done) step = await extraction.next();
      const trajectory = step.value;
      this.sessionDb.replaceReplayDriverLaps(replayName, filePath, mtime, size, driverSlotKey, trajectory, false);
      return trajectory;
    })();
    this.pendingDecodes.set(key, decode);
    return decode
      .catch((error: unknown) => {
        recordDriverFailure(this.sessionDb, replayName, filePath, driverSlotKey, mtime, size, error);
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
