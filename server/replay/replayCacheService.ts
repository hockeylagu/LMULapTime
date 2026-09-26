import fs from 'fs';
import { SessionDatabase } from '../core/db.js';
import { parseReplayMetadata } from './replayParser.js';
import { extractReplayTrajectory } from './replayTrajectory.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';

export interface ReplayCacheServiceOptions {
  playerName?: string;
}

export class ReplayCacheService {
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

  public getFullTrajectory(
    filePath: string,
    replayName: string,
    options: { driverSlot?: number; driverName?: string; lapNumber?: number; playerName?: string }
  ): ReplayTrajectoryData {
    const resolvedSlot = typeof options.driverSlot === 'number'
      ? options.driverSlot
      : this.resolveDriverSlot(filePath, replayName, options.driverName, options.playerName);
    const driverSlotKey = typeof resolvedSlot === 'number' ? resolvedSlot : -1;
    const lapKey = typeof options.lapNumber === 'number' ? options.lapNumber : -1;

    if (!fs.existsSync(filePath)) {
      const stored = this.sessionDb.getStoredReplayTrajectory(replayName, driverSlotKey, lapKey, { allowFallback: true });
      if (stored) return stored;
      throw new Error(`Replay file and cached trajectory not found: ${replayName}`);
    }

    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const cached = this.sessionDb.getReplayTrajectoryCache(
      replayName,
      driverSlotKey,
      lapKey,
      mtime,
      stat.size,
      filePath,
    );
    if (cached) return cached;

    const trajectory = extractReplayTrajectory(filePath, {
      driverSlot: resolvedSlot,
      driverName: options.driverName,
      maxPoints: 0,
      playerName: options.playerName,
      lapNumber: options.lapNumber,
    });
    const finalSlotKey = typeof trajectory.driverSlot === 'number' ? trajectory.driverSlot : driverSlotKey;
    const storedLapKey = typeof trajectory.currentLap === 'number' ? trajectory.currentLap : lapKey;
    this.sessionDb.upsertReplayTrajectoryCache(
      replayName,
      finalSlotKey,
      storedLapKey,
      mtime,
      stat.size,
      trajectory,
      filePath,
    );
    if (storedLapKey !== lapKey || finalSlotKey !== driverSlotKey) {
      this.sessionDb.setReplayTrajectoryDefaults(replayName, finalSlotKey, storedLapKey);
      if (driverSlotKey === -1) {
        this.sessionDb.setReplayTrajectoryDefaults(replayName, -1, storedLapKey, finalSlotKey);
      }
    }
    return trajectory;
  }
}
