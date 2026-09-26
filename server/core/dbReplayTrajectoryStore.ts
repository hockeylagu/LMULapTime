import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayTrajectoryData } from './types.js';
import { REPLAY_CACHE_VERSION } from './dbSchema.js';
import { compressTrajectory, decompressTrajectory } from './replayTrajectoryCodec.js';

/**
 * Trajectories are keyed by (filename, driver_slot, lap_key) where -1 means "caller did not
 * specify". Those defaults used to be stored as extra copies of the blob; they are now stored
 * as pointers here and resolved on read.
 */
export interface TrajectoryDefaults {
  defaultLapKey: number | null;
  resolvedDriverSlot: number | null;
}

interface TrajectoryRow {
  file_mtime: number;
  file_size: number;
  source_path: string | null;
  parser_version: string;
  trajectory_br: Buffer;
}

export function getTrajectoryDefaults(db: DatabaseType, filename: string, driverSlot: number): TrajectoryDefaults | null {
  const row = db.prepare(
    'SELECT default_lap_key, resolved_driver_slot FROM replay_trajectory_defaults WHERE filename = ? AND driver_slot = ?'
  ).get(filename, driverSlot) as { default_lap_key: number | null; resolved_driver_slot: number | null } | undefined;
  if (!row) return null;
  return { defaultLapKey: row.default_lap_key, resolvedDriverSlot: row.resolved_driver_slot };
}

export function setTrajectoryDefaults(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  defaultLapKey: number | null,
  resolvedDriverSlot?: number | null
): void {
  db.prepare(`
    INSERT INTO replay_trajectory_defaults (filename, driver_slot, default_lap_key, resolved_driver_slot, updated_at)
    VALUES (@filename, @driverSlot, @defaultLapKey, @resolvedDriverSlot, @updatedAt)
    ON CONFLICT(filename, driver_slot) DO UPDATE SET
      default_lap_key = COALESCE(excluded.default_lap_key, replay_trajectory_defaults.default_lap_key),
      resolved_driver_slot = COALESCE(excluded.resolved_driver_slot, replay_trajectory_defaults.resolved_driver_slot),
      updated_at = excluded.updated_at
  `).run({
    filename,
    driverSlot,
    defaultLapKey: defaultLapKey ?? null,
    resolvedDriverSlot: resolvedDriverSlot ?? null,
    updatedAt: Date.now(),
  });
}

/** Maps a (-1) driver/lap request onto the concrete row that now holds the single stored copy. */
export function resolveTrajectoryKey(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number
): { driverSlot: number; lapKey: number } | null {
  if (driverSlot !== -1 && lapKey !== -1) return null;

  let slot = driverSlot;
  const aliasDefaults = getTrajectoryDefaults(db, filename, driverSlot);
  if (driverSlot === -1 && typeof aliasDefaults?.resolvedDriverSlot === 'number') {
    slot = aliasDefaults.resolvedDriverSlot;
  }

  let lap = lapKey;
  if (lapKey === -1) {
    const slotDefaults = slot === driverSlot ? aliasDefaults : getTrajectoryDefaults(db, filename, slot);
    const resolvedLap = slotDefaults?.defaultLapKey ?? aliasDefaults?.defaultLapKey;
    if (typeof resolvedLap === 'number') lap = resolvedLap;
  }

  if (slot === driverSlot && lap === lapKey) return null;
  return { driverSlot: slot, lapKey: lap };
}

function selectTrajectoryRow(db: DatabaseType, filename: string, driverSlot: number, lapKey: number): TrajectoryRow | undefined {
  return db.prepare(
    'SELECT file_mtime, file_size, source_path, parser_version, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
  ).get(filename, driverSlot, lapKey) as TrajectoryRow | undefined;
}

/** Returns the literal row when present, otherwise the row the -1 defaults point at. */
function selectResolvedRow(db: DatabaseType, filename: string, driverSlot: number, lapKey: number): TrajectoryRow | undefined {
  const literal = selectTrajectoryRow(db, filename, driverSlot, lapKey);
  if (literal) return literal;
  const resolved = resolveTrajectoryKey(db, filename, driverSlot, lapKey);
  if (!resolved) return undefined;
  return selectTrajectoryRow(db, filename, resolved.driverSlot, resolved.lapKey);
}

function isRowValid(row: TrajectoryRow, mtime: number, size: number, filePath?: string): boolean {
  return row.file_mtime === mtime &&
    row.file_size === size &&
    row.parser_version === REPLAY_CACHE_VERSION &&
    (!filePath || !row.source_path || row.source_path === filePath);
}

export function getReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtime: number,
  size: number,
  filePath?: string
): ReplayTrajectoryData | null {
  const row = selectResolvedRow(db, filename, driverSlot, lapKey);
  if (!row || !isRowValid(row, mtime, size, filePath)) return null;
  return decompressTrajectory(row.trajectory_br);
}

/** Returns a cached trajectory for a replay whose source .Vcr is no longer on disk. */
export function getStoredReplayTrajectory(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  options?: { allowFallback?: boolean }
): ReplayTrajectoryData | null {
  const row = selectResolvedRow(db, filename, driverSlot, lapKey);
  if (row) return decompressTrajectory(row.trajectory_br);

  if (options?.allowFallback) {
    if (lapKey !== -1) {
      const rowFallbackLap = selectResolvedRow(db, filename, driverSlot, -1);
      if (rowFallbackLap) return decompressTrajectory(rowFallbackLap.trajectory_br);
    }
    if (driverSlot !== -1) {
      const rowFallbackSlot = selectResolvedRow(db, filename, -1, lapKey)
        || selectResolvedRow(db, filename, -1, -1);
      if (rowFallbackSlot) return decompressTrajectory(rowFallbackSlot.trajectory_br);
    }
  }

  return null;
}

// Same validity check as getReplayTrajectoryCache but never decompresses the (multi-MB) blob.
export function hasValidReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtime: number,
  size: number,
  filePath?: string
): boolean {
  const literal = db.prepare(
    'SELECT file_mtime, file_size, source_path, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
  ).get(filename, driverSlot, lapKey) as Omit<TrajectoryRow, 'trajectory_br'> | undefined;
  if (literal) return isRowValid(literal as TrajectoryRow, mtime, size, filePath);

  const resolved = resolveTrajectoryKey(db, filename, driverSlot, lapKey);
  if (!resolved) return false;
  const row = db.prepare(
    'SELECT file_mtime, file_size, source_path, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
  ).get(filename, resolved.driverSlot, resolved.lapKey) as Omit<TrajectoryRow, 'trajectory_br'> | undefined;
  return !!row && isRowValid(row as TrajectoryRow, mtime, size, filePath);
}

export function upsertReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtime: number,
  size: number,
  trajectory: ReplayTrajectoryData,
  filePath?: string
): void {
  db.prepare(`
    INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
    VALUES (@filename, @filePath, @driverSlot, @lapKey, @mtime, @size, @parserVersion, @pointsCount, @trajectoryBr, @updatedAt)
    ON CONFLICT(filename, driver_slot, lap_key) DO UPDATE SET
      source_path = excluded.source_path,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      parser_version = excluded.parser_version,
      points_count = excluded.points_count,
      trajectory_br = excluded.trajectory_br,
      updated_at = excluded.updated_at
  `).run({
    filename,
    filePath: filePath || null,
    driverSlot,
    lapKey,
    mtime,
    size,
    parserVersion: REPLAY_CACHE_VERSION,
    pointsCount: trajectory.points.length,
    trajectoryBr: compressTrajectory(trajectory),
    updatedAt: Date.now(),
  });
}
