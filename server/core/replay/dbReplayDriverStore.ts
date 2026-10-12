import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import type { ReplayTrajectoryData } from '../types.js';
import { REPLAY_CACHE_VERSION } from '../dbSchema.js';
import { reclassifyStoredSessions } from '../dbSessionConditions.js';
import { factsDriverSlot, withoutReplayFacts } from '../../replay/decode/replayFacts.js';
import { compressTrajectory } from './replayTrajectoryCodec.js';
import { deleteReplayDriverLaps, recordReplayDriverIngest } from './dbReplayIngestStore.js';
import { storeDecodedReplayFacts } from './dbReplayLapStore.js';
import { setTrajectoryDefaults } from './dbReplayTrajectoryStore.js';

export interface ReplayDriverSave {
  filename: string;
  filePath: string;
  mtime: number;
  size: number;
  driverSlotKey?: number;
  isPrimary: boolean;
}

export interface EncodedReplayLap {
  lapKey: number;
  pointsCount: number;
  blob: Buffer;
}

/** Compression happens before acquiring SQLite's single writer lock. All projections commit together. */
export function replaceReplayDriverLaps(
  db: Database,
  save: ReplayDriverSave,
  trajectory: ReplayTrajectoryData,
  checkSource = false,
  preparedRows?: EncodedReplayLap[],
): void {
  const { filename, filePath, mtime, size, isPrimary } = save;
  const driverSlotKey = save.driverSlotKey ?? trajectory.driverSlot ?? -1;
  const factsSlot = factsDriverSlot(driverSlotKey, trajectory);
  const perLap = trajectory.allLapsData?.length ? trajectory.allLapsData : [trajectory];
  const rows = preparedRows ?? perLap.filter(lap => typeof lap.currentLap === 'number').map(lap => {
    const { allLapsData: _unused, ...single } = lap;
    return { lapKey: lap.currentLap!, pointsCount: lap.points.length, blob: compressTrajectory(withoutReplayFacts(single, factsSlot)) };
  });
  const storedDefault = rows.some(row => row.lapKey === trajectory.currentLap);
  if (!storedDefault) {
    const { allLapsData: _unused, ...single } = trajectory;
    rows.push({ lapKey: -1, pointsCount: trajectory.points.length, blob: compressTrajectory(withoutReplayFacts(single, factsSlot)) });
  }
  const insert = db.prepare(`
    INSERT INTO replay_trajectories
      (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    if (checkSource) {
      const stat = fs.statSync(filePath);
      const metadata = db.prepare('SELECT file_path, file_mtime, file_size FROM replay_metadata WHERE filename = ?')
        .get(filename) as { file_path: string; file_mtime: number; file_size: number } | undefined;
      if (Math.floor(stat.mtimeMs) !== mtime || stat.size !== size ||
          metadata?.file_path !== filePath || metadata.file_mtime !== mtime || metadata.file_size !== size) {
        throw Object.assign(new Error('Replay source changed before saving; retry the current recording'), { code: 'REPLAY_SOURCE_CHANGED' });
      }
    }
    deleteReplayDriverLaps(db, filename, driverSlotKey);
    for (const row of rows) {
      insert.run(filename, filePath || null, driverSlotKey, row.lapKey, mtime, size, REPLAY_CACHE_VERSION, row.pointsCount, row.blob, Date.now());
    }
    if (storedDefault) setTrajectoryDefaults(db, filename, driverSlotKey, trajectory.currentLap!);
    if (storeDecodedReplayFacts(db, filename, driverSlotKey, trajectory, REPLAY_CACHE_VERSION)) {
      reclassifyStoredSessions(db, { replayName: filename });
    }
    recordReplayDriverIngest(db, filename, driverSlotKey, mtime, size, 'stored');
    if (isPrimary) {
      if (driverSlotKey !== -1) deleteReplayDriverLaps(db, filename, -1);
      setTrajectoryDefaults(db, filename, -1, trajectory.currentLap ?? null, driverSlotKey);
      if (driverSlotKey !== -1) recordReplayDriverIngest(db, filename, -1, mtime, size, 'stored');
    }
  }).immediate();
}
