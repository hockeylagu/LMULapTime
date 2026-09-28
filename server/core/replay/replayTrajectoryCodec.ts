import { ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../types.js';
import { compressJson, decompressJson } from '../dbSchema.js';
import { applyGarageState } from '../../replay/garageState.js';

/**
 * Trajectory blobs are stored column-per-channel instead of one object per point: the channel
 * names stop repeating for every sample and each column compresses against like-typed values.
 * Channels that never vary within a lap collapse to a single constant.
 *
 * Encoding is lossless - no rounding - and decoding restores the original point objects.
 */

type PointValue = number | boolean | [number, number, number, number];

interface ColumnarPoints {
  pointsFormat: 'columnar';
  pointsLength: number;
  constants: Record<string, PointValue>;
  columns: Record<string, Array<PointValue | null>>;
}

type StoredTrajectory = ReplayTrajectoryData | (Omit<ReplayTrajectoryData, 'points'> & ColumnarPoints);

function isSameValue(left: PointValue | null, right: PointValue | null): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return false;
}

export function toColumnarTrajectory(trajectory: ReplayTrajectoryData): StoredTrajectory {
  const { points, ...rest } = trajectory;
  if (!points || points.length === 0) return trajectory;

  const gathered = new Map<string, Array<PointValue | null>>();
  for (let index = 0; index < points.length; index++) {
    const point = points[index] as unknown as Record<string, PointValue | undefined>;
    for (const key of Object.keys(point)) {
      const value = point[key];
      if (value === undefined) continue;
      let column = gathered.get(key);
      if (!column) {
        column = new Array<PointValue | null>(points.length).fill(null);
        gathered.set(key, column);
      }
      column[index] = value;
    }
  }

  const constants: Record<string, PointValue> = {};
  const columns: Record<string, Array<PointValue | null>> = {};
  for (const [key, column] of gathered) {
    const first = column[0];
    if (first !== null && column.every(value => isSameValue(value, first))) {
      constants[key] = first;
    } else {
      columns[key] = column;
    }
  }

  return { ...rest, pointsFormat: 'columnar', pointsLength: points.length, constants, columns };
}

export function fromColumnarTrajectory(stored: StoredTrajectory): ReplayTrajectoryData {
  if (!isColumnar(stored)) return stored;

  const { pointsFormat: _format, pointsLength, constants, columns, ...rest } = stored;
  const columnKeys = Object.keys(columns);
  const points: ReplayTrajectoryPoint[] = new Array(pointsLength);

  for (let index = 0; index < pointsLength; index++) {
    const point: Record<string, PointValue> = { ...constants };
    for (const key of columnKeys) {
      const value = columns[key][index];
      if (value !== null) point[key] = value;
    }
    points[index] = point as unknown as ReplayTrajectoryPoint;
  }

  return { ...rest, points };
}

export function isColumnar(stored: StoredTrajectory): stored is Omit<ReplayTrajectoryData, 'points'> & ColumnarPoints {
  return (stored as ColumnarPoints).pointsFormat === 'columnar';
}

export function compressTrajectory(trajectory: ReplayTrajectoryData): Buffer {
  return compressJson(toColumnarTrajectory(trajectory));
}

export function decompressTrajectory(buffer: Buffer): ReplayTrajectoryData {
  return fromColumnarTrajectory(decompressJson<StoredTrajectory>(buffer));
}

/** Ambient °C written by builds before v6 (`25 - (146 - raw) * 0.176`), recomputed as `raw / 8 + 5.9`. */
export function recalibrateLegacyAmbientTemp(legacy: number): number {
  const raw = Math.max(0, Math.min(255, Math.round(146 - (25 - legacy) / 0.176)));
  return Number((raw / 8 + 5.9).toFixed(1));
}

// Rows written before v6 stored Virtual Energy as fuel and used the old ambient scale.
const PRE_V6_REPLAY_CACHE_VERSIONS: ReadonlySet<string> = new Set(['v3', 'v4', 'v5']);

/**
 * Brings a row written by an older compatible parser version up to what the current one would
 * store, on read: the samples are never rewritten (for deleted replays they are the only copy).
 * Before v6, Virtual Energy (Class 1 Type 51) was stored as `fuel`, ambient used a wrong scale,
 * track temperature came from a constant byte, and `rainPercent` was scaled by 25 instead of 255.
 */
export function upgradeStoredTrajectory(trajectory: ReplayTrajectoryData, parserVersion: string): ReplayTrajectoryData {
  if (!PRE_V6_REPLAY_CACHE_VERSIONS.has(parserVersion)) return trajectory;
  delete trajectory.trackTemp;
  if (typeof trajectory.ambientTemp === 'number') trajectory.ambientTemp = recalibrateLegacyAmbientTemp(trajectory.ambientTemp);
  for (const event of trajectory.weatherEvents ?? []) {
    delete event.trackTemp;
    if (typeof event.ambientTemp === 'number') event.ambientTemp = recalibrateLegacyAmbientTemp(event.ambientTemp);
    event.rainPercent = Math.round((event.rainIntensity / 255) * 100);
  }
  // A car without a Virtual Energy system (e.g. GTE) stored 0 on every point: it has no VE at all.
  const points = trajectory.points ?? [];
  const hasVirtualEnergy = points.some(point => (point.fuel ?? 0) > 0);
  for (const point of points) {
    delete point.trackTemp;
    if (typeof point.ambientTemp === 'number') point.ambientTemp = recalibrateLegacyAmbientTemp(point.ambientTemp);
    if (point.fuel !== undefined) {
      if (hasVirtualEnergy) point.virtualEnergy ??= point.fuel;
      delete point.fuel;
    }
  }
  if (!points.some(point => point.virtualEnergy !== undefined)) trajectory.energyTelemetryAvailable = false;
  return trajectory;
}

/** Same as upgradeStoredTrajectory for the replay metadata row. */
export function upgradeStoredReplayMetadata(metadata: ReplayMetadata, parserVersion: string): ReplayMetadata {
  if (!PRE_V6_REPLAY_CACHE_VERSIONS.has(parserVersion)) return metadata;
  delete metadata.trackTemp;
  if (typeof metadata.ambientTemp === 'number') metadata.ambientTemp = recalibrateLegacyAmbientTemp(metadata.ambientTemp);
  return metadata;
}

/**
 * Recomputes the garage state of a stored lap from its driver's pit events (see garageState.ts),
 * on read and for every parser version: laps stored before the rule took type 49 events for garage
 * returns and flagged the drive out to the pit exit as garage. The samples are never rewritten.
 * Remove this adapter only once every stored row, deleted replays included, has been rewritten
 * with the current rule.
 */
export function withGarageState(trajectory: ReplayTrajectoryData): ReplayTrajectoryData {
  if (!trajectory.points?.length) return trajectory;
  const slot = trajectory.driverSlot;
  applyGarageState(trajectory.points, (trajectory.pitEvents ?? []).filter(e => e.driverSlot === slot));
  return trajectory;
}
