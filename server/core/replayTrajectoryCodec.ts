import { ReplayTrajectoryData, ReplayTrajectoryPoint } from './types.js';
import { compressJson, decompressJson } from './dbSchema.js';

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
