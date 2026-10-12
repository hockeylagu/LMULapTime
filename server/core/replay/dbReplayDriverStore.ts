import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import type { ReplayTrajectoryData } from '../../../shared/types/index.js';
import { REPLAY_CACHE_VERSION } from '../dbSchema.js';
import { reclassifyStoredSessions } from '../dbSessionConditions.js';
import { factsDriverSlot, withoutReplayFacts } from '../../replay/decode/replayFacts.js';
import { compressTrajectory } from './replayTrajectoryCodec.js';
import { deleteReplayDriverLaps, getReplayDriverIngest, recordReplayDriverIngest } from './dbReplayIngestStore.js';
import { storeDecodedReplayFacts } from './dbReplayLapStore.js';
import { getTrajectoryDefaults, resolveTrajectoryKey, setTrajectoryDefaults } from './dbReplayTrajectoryStore.js';

export interface ReplayDriverSave {
  filename: string;
  filePath: string;
  mtimeMs: number;
  fileSizeBytes: number;
  driverSlotKey?: number;
  isPrimary: boolean;
}

export interface EncodedReplayLap {
  lapKey: number;
  pointsCount: number;
  blob: Buffer;
}

function validateReplaySource(db: Database, save: Pick<ReplayDriverSave, 'filename' | 'filePath' | 'mtimeMs' | 'fileSizeBytes'>): void {
  const { filename, filePath, mtimeMs, fileSizeBytes } = save;
  const stat = fs.statSync(filePath);
  const metadata = db.prepare('SELECT file_path, file_mtime_ms, file_size_bytes FROM replay_metadata WHERE filename = ?')
    .get(filename) as { file_path: string; file_mtime_ms: number; file_size_bytes: number } | undefined;
  if (Math.floor(stat.mtimeMs) !== mtimeMs || stat.size !== fileSizeBytes ||
      metadata?.file_path !== filePath || metadata.file_mtime_ms !== mtimeMs || metadata.file_size_bytes !== fileSizeBytes) {
    throw Object.assign(new Error('Replay source changed before saving; retry the current recording'), { code: 'REPLAY_SOURCE_CHANGED' });
  }
}

/** Point the primary alias at a current driver without decoding or rewriting its lap blobs. */
export function promoteReplayPrimary(db: Database, save: Omit<ReplayDriverSave, 'isPrimary'> & { driverSlotKey: number }): boolean {
  if (save.driverSlotKey < 0) return false;
  return db.transaction(() => {
    validateReplaySource(db, save);
    const key = resolveTrajectoryKey(db, save.filename, save.driverSlotKey, -1);
    const lapKey = key?.lapKey ?? -1;
    const row = db.prepare(`SELECT 1 FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?
      AND source_path = ? AND file_mtime_ms = ? AND file_size_bytes = ? AND parser_version = ?`)
      .get(save.filename, save.driverSlotKey, lapKey, save.filePath, save.mtimeMs, save.fileSizeBytes, REPLAY_CACHE_VERSION);
    if (!row) return false;
    const alias = getTrajectoryDefaults(db, save.filename, -1);
    if (alias?.resolvedDriverSlot !== save.driverSlotKey || alias.defaultLapKey !== lapKey) {
      deleteReplayDriverLaps(db, save.filename, -1);
      setTrajectoryDefaults(db, save.filename, -1, lapKey, save.driverSlotKey);
    }
    const ingest = getReplayDriverIngest(db, save.filename, -1);
    if (ingest?.status !== 'stored' || ingest.mtimeMs !== save.mtimeMs || ingest.fileSizeBytes !== save.fileSizeBytes || ingest.parserVersion !== REPLAY_CACHE_VERSION) {
      recordReplayDriverIngest(db, save.filename, -1, save.mtimeMs, save.fileSizeBytes, 'stored');
    }
    return true;
  }).immediate();
}

/** Compression happens before acquiring SQLite's single writer lock. All projections commit together. */
export function replaceReplayDriverLaps(
  db: Database,
  save: ReplayDriverSave,
  trajectory: ReplayTrajectoryData,
  checkSource = false,
  preparedRows?: EncodedReplayLap[],
): void {
  const { filename, filePath, mtimeMs, fileSizeBytes, isPrimary } = save;
  const driverSlotKey = save.driverSlotKey ?? trajectory.driverSlot ?? -1;
  const factsSlot = factsDriverSlot(driverSlotKey, trajectory);
  const perLap = trajectory.allLapsData?.length ? trajectory.allLapsData : [trajectory];
  const rows = preparedRows ?? perLap.filter(lap => typeof lap.currentLap === 'number').map(lap => {
    const { allLapsData: _unused, ...single } = lap;
    return { lapKey: lap.currentLap!, pointsCount: lap.points.length, blob: compressTrajectory(withoutReplayFacts(single, factsSlot)) };
  });
  const storedDefault = rows.some(row => row.lapKey === trajectory.currentLap);
  // Prepared rows come from a worker that trims the returned points, so they are never a source for a fallback row.
  if (!storedDefault && !preparedRows) {
    const { allLapsData: _unused, ...single } = trajectory;
    rows.push({ lapKey: -1, pointsCount: trajectory.points.length, blob: compressTrajectory(withoutReplayFacts(single, factsSlot)) });
  }
  const insert = db.prepare(`
    INSERT INTO replay_trajectories
      (filename, source_path, driver_slot, lap_key, file_mtime_ms, file_size_bytes, parser_version, points_count, trajectory_br, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    if (checkSource) validateReplaySource(db, save);
    deleteReplayDriverLaps(db, filename, driverSlotKey);
    for (const row of rows) {
      insert.run(filename, filePath || null, driverSlotKey, row.lapKey, mtimeMs, fileSizeBytes, REPLAY_CACHE_VERSION, row.pointsCount, row.blob, Date.now());
    }
    if (storedDefault) setTrajectoryDefaults(db, filename, driverSlotKey, trajectory.currentLap!);
    if (storeDecodedReplayFacts(db, filename, driverSlotKey, trajectory, REPLAY_CACHE_VERSION)) {
      reclassifyStoredSessions(db, { replayName: filename });
    }
    recordReplayDriverIngest(db, filename, driverSlotKey, mtimeMs, fileSizeBytes, 'stored');
    if (isPrimary) {
      if (driverSlotKey !== -1) deleteReplayDriverLaps(db, filename, -1);
      setTrajectoryDefaults(db, filename, -1, trajectory.currentLap ?? null, driverSlotKey);
      if (driverSlotKey !== -1) recordReplayDriverIngest(db, filename, -1, mtimeMs, fileSizeBytes, 'stored');
    }
  }).immediate();
}
