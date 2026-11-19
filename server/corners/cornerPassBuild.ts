import { decodeLapColumns } from '../core/replay/lapColumnsCodec.js';
import { channel, type StoredLap, type StoredLapBlob } from '../traffic/lapSamples.js';
import { buildCenterlineSpatialIndex, projectTrajectoryToCenterline, type CenterlineSpatialIndex } from '../tracks/trackProjection.js';
import type { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';
import { buildCornerPasses, type CarLaps, type PassLapSamples, type PassSegment } from './cornerPasses.js';

/** What a replay's pass build needs: its stored laps and its layout's centre line, cut into turn segments. */
export interface CornerPassInput {
  laps: StoredLapBlob[];
  centerline: Array<[number, number]>;
  /** Where the start line is on the centre line (metres from its first point). */
  startStationM: number;
  segments: PassSegment[];
}

const PASS_KEYS = ['timeSec', 'x', 'z', 'speedKmh', 'throttle', 'brake', 'steerYaw', 'inPit', 'inGarage', 'isTeleport'];

const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Grid cell size and how far from the centre line a sample may be and still be driving the track (metres). The
 * grid accepts at most (reach + 1) cells diagonally, 49.5 m: under the 50 m from which the projection searches
 * the whole track.
 */
const NEAR_CELL_M = 5;
const NEAR_TRACK_M = 30;

/**
 * Whether a point is within about NEAR_TRACK_M of the centre line, from a grid of the cells around its points.
 * A sample far off it (a retired car parked behind the barriers for the rest of the race) would make the
 * projection search the whole track for every sample.
 */
export function nearTrackTest(index: CenterlineSpatialIndex): (x: number, z: number) => boolean {
  const cells = new Set<number>();
  const reach = Math.ceil(NEAR_TRACK_M / NEAR_CELL_M);
  const key = (ix: number, iz: number) => ix * 1_000_003 + iz;
  for (let k = 0; k < index.points.length; k++) {
    const [px, pz] = index.points[k];
    // Along each centre line segment every few metres, so long straight segments leave no hole.
    const steps = Math.max(1, Math.ceil((index.segmentLengths[k] ?? 0) / NEAR_CELL_M));
    for (let s = 0; s < steps; s++) {
      const along = (s / steps) * (index.segmentLengths[k] ?? 0);
      const ix = Math.floor((px + index.tangents[k].x * along) / NEAR_CELL_M);
      const iz = Math.floor((pz + index.tangents[k].z * along) / NEAR_CELL_M);
      for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) cells.add(key(ix + dx, iz + dz));
    }
  }
  return (x, z) => cells.has(key(Math.floor(x / NEAR_CELL_M), Math.floor(z / NEAR_CELL_M)));
}

/** One stored lap at full rate, its driving samples placed on the centre line from the start line. */
export function readPassLap(
  lapNumber: number, blob: Uint8Array, index: CenterlineSpatialIndex, startStationM: number,
  nearTrack: (x: number, z: number) => boolean
): PassLapSamples {
  const stored = decodeLapColumns<StoredLap>(blob, PASS_KEYS);
  const [time, x, z, speed, throttle, brake, steer, inPit, inGarage, teleport] = PASS_KEYS.map(key => channel(stored, key));
  const lengthM = index.totalLengthM;
  const lap: PassLapSamples = { lapNumber, times: [], stations: [], speedKmh: [], throttle: [], brake: [], steer: [], usable: [] };
  const points: ReplayTrajectoryPoint[] = [];
  const driving: number[] = [];
  for (let i = 0; i < stored.pointsLength; i++) {
    const t = numberOrNull(time[i]);
    const px = numberOrNull(x[i]);
    const pz = numberOrNull(z[i]);
    // The pit lane is off the centre line and a lap through it has no comparable corner time: its samples
    // leave a gap, as the garage's do, and so do a parked car's far off the track.
    const usable = t !== null && px !== null && pz !== null && inPit[i] !== true && inGarage[i] !== true && teleport[i] !== true
      && nearTrack(px, pz);
    lap.times.push(t ?? Number.NaN);
    lap.stations.push(Number.NaN);
    lap.speedKmh.push(numberOrNull(speed[i]));
    lap.throttle.push(numberOrNull(throttle[i]));
    lap.brake.push(numberOrNull(brake[i]));
    lap.steer.push(numberOrNull(steer[i]));
    lap.usable.push(usable);
    if (usable) {
      points.push({ x: px, y: 0, z: pz });
      driving.push(i);
    }
  }
  if (points.length > 0) {
    const { stations } = projectTrajectoryToCenterline(points, index, { clampSeam: false });
    driving.forEach((sampleIndex, k) => {
      lap.stations[sampleIndex] = ((stations[k] - startStationM) % lengthM + lengthM) % lengthM;
    });
  }
  return lap;
}

/** A replay's corner passes from its stored laps (the work the worker thread does). */
export function buildReplayCornerPasses(input: CornerPassInput): CornerPass[] {
  const index = buildCenterlineSpatialIndex(input.centerline);
  const nearTrack = nearTrackTest(index);
  const bySlot = new Map<number, CarLaps>();
  for (const stored of input.laps) {
    const car = bySlot.get(stored.slot) ?? { slot: stored.slot, laps: [] };
    car.laps.push(readPassLap(stored.lapNumber, stored.blob, index, input.startStationM, nearTrack));
    bySlot.set(stored.slot, car);
  }
  return buildCornerPasses([...bySlot.values()], input.segments, index.totalLengthM);
}
