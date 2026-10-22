import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { decodeLapColumns, encodeLapColumns, type LapColumn, type LapValue } from './lapColumnsCodec.js';
import { LAP_EDGE_PADDING_SEC } from '../../replay/decode/replayLapPoints.js';

/**
 * Trajectory blobs are stored column-per-channel instead of one object per point: the channel
 * names stop repeating for every sample and each column compresses against like-typed values.
 * Channels that never vary within a lap collapse to a single constant. The columns are stored in
 * the binary lap format (lapColumnsCodec.ts), which never changes a value.
 *
 * Rows hold what the app serves: steering positive to the left (ISO 8855), Virtual Energy, the
 * calibrated ambient scale and the garage state, for every parser version (the 2026-10 rewrite
 * applied the former read-time fixes to every stored row, deleted replays included). A later rule
 * change rewrites the rows; it does not add a read fix.
 */

export interface ColumnarTrajectory extends Omit<ReplayTrajectoryData, 'points'> {
  pointsFormat: 'columnar';
  pointsLength: number;
  constants: Record<string, LapValue>;
  columns: Record<string, LapColumn>;
}

function isSameValue(left: LapValue | null, right: LapValue | null): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return false;
}

export function toColumnarTrajectory(trajectory: ReplayTrajectoryData): ColumnarTrajectory {
  const { points, ...rest } = trajectory;

  const gathered = new Map<string, LapColumn>();
  for (let index = 0; index < points.length; index++) {
    const point = points[index] as unknown as Record<string, LapValue | undefined>;
    for (const key of Object.keys(point)) {
      const value = point[key];
      if (value === undefined) continue;
      let column = gathered.get(key);
      if (!column) {
        column = new Array<LapValue | null>(points.length).fill(null);
        gathered.set(key, column);
      }
      column[index] = value;
    }
  }

  const constants: Record<string, LapValue> = {};
  const columns: Record<string, LapColumn> = {};
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

export function fromColumnarTrajectory(stored: ColumnarTrajectory, indices?: number[]): ReplayTrajectoryData {
  const { pointsFormat: _format, pointsLength, constants, columns, ...rest } = stored;
  const length = indices?.length ?? pointsLength;
  const points: Record<string, LapValue>[] = new Array(length);

  for (let index = 0; index < length; index++) {
    points[index] = { ...constants };
  }
  // Walk each channel once rather than looking up its column again for every sample.
  for (const [key, column] of Object.entries(columns)) {
    for (let index = 0; index < length; index++) {
      const value = column[indices?.[index] ?? index];
      if (value !== null) points[index][key] = value;
    }
  }

  return { ...rest, points: points as unknown as ReplayTrajectoryPoint[] };
}

/** Callers pass ISO 8855 data (everything decoded now is), so the row is marked as such. */
export function compressTrajectory(trajectory: ReplayTrajectoryData): Buffer {
  return encodeLapColumns(toColumnarTrajectory({ ...trajectory, signConvention: 'iso8855' }));
}

export function decompressTrajectory(buffer: Uint8Array): ReplayTrajectoryData {
  return fromColumnarTrajectory(decodeLapColumns<ColumnarTrajectory>(buffer));
}

/** Only the samples within LAP_EDGE_PADDING_SEC of `boundarySec`, as point objects. */
export function decompressTrajectoryEdge(buffer: Uint8Array, boundarySec: number, direction: 'previous' | 'next'): ReplayTrajectoryPoint[] {
  const stored = decodeLapColumns<ColumnarTrajectory>(buffer);
  const timeColumn = stored.columns.timeSec;
  const constantTime = stored.constants.timeSec;
  const time = (i: number): number | undefined => {
    const value = timeColumn ? timeColumn[i] : constantTime;
    return typeof value === 'number' ? value : undefined;
  };
  const indices: number[] = [];
  const length = stored.pointsLength;
  for (let i = direction === 'previous' ? length - 1 : 0; i >= 0 && i < length; i += direction === 'previous' ? -1 : 1) {
    const t = time(i);
    if (t !== undefined && (direction === 'previous' ? t >= boundarySec : t <= boundarySec)) continue;
    if (t !== undefined && Math.abs(t - boundarySec) > LAP_EDGE_PADDING_SEC) break;
    indices.push(i);
    // Missing time breaks continuity. Keep the sample so the canonical edge selector sees it.
    if (t === undefined) break;
  }
  if (direction === 'previous') indices.reverse();
  return indices.length === 0 ? [] : fromColumnarTrajectory(stored, indices).points;
}
