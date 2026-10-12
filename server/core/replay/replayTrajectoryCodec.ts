import { ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { compressJson, decompressJson } from '../dbSchema.js';
import { applyGarageState, garageSpells, garageState } from '../../replay/decode/garageState.js';
import { LAP_EDGE_PADDING_SEC } from '../../replay/decode/replayLapPoints.js';

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

export function fromColumnarTrajectory(stored: StoredTrajectory, indices?: number[]): ReplayTrajectoryData {
  if (!isColumnar(stored)) return stored;

  const { pointsFormat: _format, pointsLength, constants, columns, ...rest } = stored;
  const length = indices?.length ?? pointsLength;
  const points: Record<string, PointValue>[] = new Array(length);

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

export function isColumnar(stored: StoredTrajectory): stored is Omit<ReplayTrajectoryData, 'points'> & ColumnarPoints {
  return (stored as ColumnarPoints).pointsFormat === 'columnar';
}

/**
 * Steering was stored positive to the right until the ISO 8855 conversion (positive to the left).
 * Every row written now is marked; an unmarked row is flipped on read and never rewritten, so
 * deleted replays keep their only copy. Lateral offsets are not stored: they are reprojected on read.
 */
export function toIso8855Steering<T extends { points?: ReplayTrajectoryPoint[]; signConvention?: 'iso8855' }>(stored: T): T {
  if (stored.signConvention === 'iso8855') return stored;
  const record = stored as T & Partial<Pick<ReplayTrajectoryData, 'leadInPoints' | 'leadOutPoints' | 'allLapsData'>>;
  for (const points of [record.points, record.leadInPoints, record.leadOutPoints]) {
    for (const point of points ?? []) {
      if (typeof point.steerYaw === 'number' && point.steerYaw !== 0) point.steerYaw = -point.steerYaw;
    }
  }
  for (const lap of record.allLapsData ?? []) toIso8855Steering(lap);
  stored.signConvention = 'iso8855';
  return stored;
}

/** Callers pass ISO 8855 data (everything decoded or read now is), so the row is marked as such. */
export function compressTrajectory(trajectory: ReplayTrajectoryData): Buffer {
  return compressJson(toColumnarTrajectory({ ...trajectory, signConvention: 'iso8855' }));
}

export function decompressTrajectory(buffer: Buffer): ReplayTrajectoryData {
  return toIso8855Steering(fromColumnarTrajectory(decompressJson<StoredTrajectory>(buffer)));
}

/** Decode only edge point objects; compressed columns still need a full JSON parse. */
export function decompressTrajectoryEdge(
  buffer: Buffer, parserVersion: string, boundarySec: number, direction: 'previous' | 'next',
): ReplayTrajectoryPoint[] {
  const stored = decompressJson<StoredTrajectory>(buffer);
  const indices: number[] = [];
  const select = (length: number, time: (i: number) => number | undefined): void => {
    for (let i = direction === 'previous' ? length - 1 : 0; i >= 0 && i < length; i += direction === 'previous' ? -1 : 1) {
      const t = time(i);
      if (t !== undefined && (direction === 'previous' ? t >= boundarySec : t <= boundarySec)) continue;
      if (t !== undefined && Math.abs(t - boundarySec) > LAP_EDGE_PADDING_SEC) break;
      indices.push(i);
      // Missing time breaks continuity. Keep the sample so the canonical edge selector sees it.
      if (t === undefined) break;
    }
    if (direction === 'previous') indices.reverse();
  };
  // Legacy adapters depend on the complete lap (e.g. whether fuel was actually Virtual Energy).
  if (!isColumnar(stored) || PRE_V6_REPLAY_CACHE_VERSIONS.has(parserVersion)) {
    const full = withGarageState(upgradeStoredTrajectory(toIso8855Steering(fromColumnarTrajectory(stored)), parserVersion));
    select(full.points.length, i => full.points[i].timeSec);
    return indices.map(i => full.points[i]);
  }
  const value = (key: string, i: number): PointValue | null | undefined => stored.constants[key] ?? stored.columns[key]?.[i];
  const number = (key: string, i: number): number | undefined => {
    const v = value(key, i);
    return typeof v === 'number' ? v : undefined;
  };
  select(stored.pointsLength, i => number('timeSec', i));
  if (indices.length === 0) return [];
  // Garage phases can start before the requested window: inspect cheap column samples for the
  // whole lap, rather than restarting the phase at the edge and misclassifying a slowing car.
  const state = garageState({ length: stored.pointsLength,
    timeSec: i => number('timeSec', i), speedKmh: i => number('speedKmh', i), inPit: i => value('inPit', i) === true,
  }, garageSpells((stored.pitEvents ?? []).filter(event => event.driverSlot === stored.driverSlot)));
  const trajectory = toIso8855Steering(fromColumnarTrajectory(stored, indices));
  trajectory.points.forEach((point, i) => {
    point.inGarage = state.inGarage[indices[i]];
    if (state.leavingGarage[indices[i]]) point.inPit = true;
  });
  return trajectory.points;
}

/** Ambient °C written by builds before v6 (`25 - (146 - raw) * 0.176`), recomputed as `raw / 8 + 5.9`. */
export function recalibrateLegacyAmbientTemp(legacy: number): number {
  const raw = Math.max(0, Math.min(255, Math.round(146 - (25 - legacy) / 0.176)));
  return Number((raw / 8 + 5.9).toFixed(1));
}

// Rows written before v6 stored Virtual Energy as fuel and used the old ambient scale.
const PRE_V6_REPLAY_CACHE_VERSIONS: ReadonlySet<string> = new Set(['v3', 'v4', 'v5']);

/** Old trajectory JSON used `isOutlap`; normalize that wire spelling on read, even for v6/v7 rows. */
function normalizeLegacyOutLapSpelling(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  const fields = value as Record<string, unknown>;
  if (typeof fields.isOutLap !== 'boolean' && typeof fields.isOutlap === 'boolean') {
    fields.isOutLap = fields.isOutlap;
  }
  delete fields.isOutlap;
}

function normalizeTrajectoryLapSpelling(trajectory: ReplayTrajectoryData): void {
  for (const lap of trajectory.laps ?? []) normalizeLegacyOutLapSpelling(lap);
  for (const lap of trajectory.allLapsData ?? []) normalizeTrajectoryLapSpelling(lap);
}

/**
 * Brings a row written by an older compatible parser version up to what the current one would
 * store, on read: the samples are never rewritten (for deleted replays they are the only copy).
 * Before v6, Virtual Energy (Class 1 Type 51) was stored as `fuel`, ambient used a wrong scale,
 * and track temperature came from a constant byte.
 */
export function upgradeStoredTrajectory(trajectory: ReplayTrajectoryData, parserVersion: string): ReplayTrajectoryData {
  normalizeTrajectoryLapSpelling(trajectory);
  if (!PRE_V6_REPLAY_CACHE_VERSIONS.has(parserVersion)) return trajectory;
  delete trajectory.trackTemp;
  if (typeof trajectory.ambientTemp === 'number') trajectory.ambientTemp = recalibrateLegacyAmbientTemp(trajectory.ambientTemp);
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
  for (const lap of metadata.laps ?? []) normalizeLegacyOutLapSpelling(lap);
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
