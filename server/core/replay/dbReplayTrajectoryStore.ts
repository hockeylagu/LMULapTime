import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayTrajectoryData } from '../../../shared/types/index.js';
import { REPLAY_CACHE_VERSION, isCompatibleReplayCacheVersion } from '../dbCache.js';
import {
  compressTrajectory,
  decompressTrajectory,
  decompressTrajectoryEdge,
  upgradeStoredTrajectory,
  withGarageState,
} from './replayTrajectoryCodec.js';
import { lapEdgesFromNeighbours } from '../../replay/decode/replayLapPoints.js';
import { getReplayLaps } from './dbReplayLapStore.js';
import { lapSummariesFrom } from '../../replay/decode/replayFacts.js';
import { classifyRetainedReplayLaps } from '../../replay/decode/replayLapClassification.js';

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
  filename: string;
  driver_slot: number;
  file_mtime_ms: number;
  file_size_bytes: number;
  source_path: string | null;
  parser_version: string;
  trajectory_br: Buffer;
}

/** The driver's lap list comes from replay_laps; the blob's own copy only when the replay has no lap facts. */
function readTrajectoryRow(db: DatabaseType, row: TrajectoryRow): ReplayTrajectoryData {
  const trajectory = withGarageState(upgradeStoredTrajectory(decompressTrajectory(row.trajectory_br), row.parser_version));
  const slot = row.driver_slot >= 0 ? row.driver_slot : trajectory.driverSlot;
  if (typeof slot !== 'number' || slot < 0) return trajectory;
  const facts = getReplayLaps(db, row.filename, slot);
  const laps = lapSummariesFrom(facts);
  if (laps.length > 0) {
    const stored = new Map(trajectory.laps?.map(lap => [lap.lapNumber, lap]));
    trajectory.laps = laps.map(lap => ({ ...lap, isPitStop: stored.get(lap.lapNumber)?.isPitStop }));
  }
  const spans = new Map(facts.flatMap(fact => fact.startSec !== null && fact.endSec !== null
    ? [[fact.lapNumber, { startSec: fact.startSec, endSec: fact.endSec }] as const] : []));
  if (trajectory.currentLap !== undefined && trajectory.points.length > 0) {
    const first = trajectory.points[0].timeSec;
    const last = trajectory.points[trajectory.points.length - 1].timeSec;
    if (first !== undefined && last !== undefined) spans.set(trajectory.currentLap, { startSec: first, endSec: last });
  }
  trajectory.laps = classifyRetainedReplayLaps(trajectory, spans, slot);
  return trajectory;
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
    'SELECT filename, driver_slot, file_mtime_ms, file_size_bytes, source_path, parser_version, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
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

function isRowValid(row: TrajectoryRow, mtimeMs: number, fileSizeBytes: number, filePath?: string): boolean {
  return row.file_mtime_ms === mtimeMs &&
    row.file_size_bytes === fileSizeBytes &&
    isCompatibleReplayCacheVersion(row.parser_version) &&
    (!filePath || !row.source_path || row.source_path === filePath);
}

export function getReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtimeMs: number,
  fileSizeBytes: number,
  filePath?: string
): ReplayTrajectoryData | null {
  const row = selectResolvedRow(db, filename, driverSlot, lapKey);
  if (!row || !isRowValid(row, mtimeMs, fileSizeBytes, filePath)) return null;
  return readTrajectoryRow(db, row);
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
  if (row) return readTrajectoryRow(db, row);

  // A missing lap falls back to the same driver's default lap, which reports itself as currentLap
  // (the on-disk decode does the same). A missing driver never falls back to another driver: that
  // would serve the player's lap under the requested driver's name.
  if (options?.allowFallback && lapKey !== -1) {
    const rowFallbackLap = selectResolvedRow(db, filename, driverSlot, -1);
    if (rowFallbackLap) return readTrajectoryRow(db, rowFallbackLap);
  }

  return null;
}

/**
 * The laps just before and after (driverSlot, lapKey) of the same recording, read from the stored
 * rows only: a lap row is the one place the recording either side of a lap survives once LMU has
 * deleted the replay. Rows from another version of the file (different mtimeMs or fileSizeBytes) are ignored.
 */
export function getReplayLapEdges(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  points: ReplayTrajectoryData['points'],
): { leadIn: ReplayTrajectoryData['points']; leadOut: ReplayTrajectoryData['points'] } {
  const lap = db.prepare('SELECT file_mtime_ms, file_size_bytes, source_path FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?')
    .get(filename, driverSlot, lapKey) as Pick<TrajectoryRow, 'file_mtime_ms' | 'file_size_bytes' | 'source_path'> | undefined;
  const first = points[0]?.timeSec;
  const last = points[points.length - 1]?.timeSec;
  if (!lap || first === undefined || last === undefined) return { leadIn: [], leadOut: [] };
  const neighbour = (key: number, boundary: number, direction: 'previous' | 'next'): ReplayTrajectoryData['points'] | undefined => {
    const row = selectTrajectoryRow(db, filename, driverSlot, key);
    return row && row.file_mtime_ms === lap.file_mtime_ms && row.file_size_bytes === lap.file_size_bytes && row.source_path === lap.source_path
      ? decompressTrajectoryEdge(row.trajectory_br, row.parser_version, boundary, direction)
      : undefined;
  };
  return lapEdgesFromNeighbours(points, neighbour(lapKey - 1, first, 'previous'), neighbour(lapKey + 1, last, 'next'));
}

// Same validity check as getReplayTrajectoryCache but never decompresses the (multi-MB) blob.
export function hasValidReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtimeMs: number,
  fileSizeBytes: number,
  filePath?: string,
  expectedDriverSlot?: number,
): boolean {
  if (expectedDriverSlot !== undefined && driverSlot === -1 &&
      resolveTrajectoryKey(db, filename, driverSlot, lapKey)?.driverSlot !== expectedDriverSlot) return false;
  const literal = db.prepare(
    'SELECT file_mtime_ms, file_size_bytes, source_path, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
  ).get(filename, driverSlot, lapKey) as Omit<TrajectoryRow, 'trajectory_br'> | undefined;
  if (literal) return isRowValid(literal as TrajectoryRow, mtimeMs, fileSizeBytes, filePath);

  const resolved = resolveTrajectoryKey(db, filename, driverSlot, lapKey);
  if (!resolved) return false;
  const row = db.prepare(
    'SELECT file_mtime_ms, file_size_bytes, source_path, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
  ).get(filename, resolved.driverSlot, resolved.lapKey) as Omit<TrajectoryRow, 'trajectory_br'> | undefined;
  return !!row && isRowValid(row as TrajectoryRow, mtimeMs, fileSizeBytes, filePath);
}

export function upsertReplayTrajectoryCache(
  db: DatabaseType,
  filename: string,
  driverSlot: number,
  lapKey: number,
  mtimeMs: number,
  fileSizeBytes: number,
  trajectory: ReplayTrajectoryData,
  filePath?: string
): void {
  db.prepare(`
    INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime_ms, file_size_bytes, parser_version, points_count, trajectory_br, updated_at)
    VALUES (@filename, @filePath, @driverSlot, @lapKey, @mtimeMs, @fileSizeBytes, @parserVersion, @pointsCount, @trajectoryBr, @updatedAt)
    ON CONFLICT(filename, driver_slot, lap_key) DO UPDATE SET
      source_path = excluded.source_path,
      file_mtime_ms = excluded.file_mtime_ms,
      file_size_bytes = excluded.file_size_bytes,
      parser_version = excluded.parser_version,
      points_count = excluded.points_count,
      trajectory_br = excluded.trajectory_br,
      updated_at = excluded.updated_at
  `).run({
    filename,
    filePath: filePath || null,
    driverSlot,
    lapKey,
    mtimeMs,
    fileSizeBytes,
    parserVersion: REPLAY_CACHE_VERSION,
    pointsCount: trajectory.points.length,
    trajectoryBr: compressTrajectory(trajectory),
    updatedAt: Date.now(),
  });
}
