import { CenterlineSpatialIndex, projectTrajectoryToCenterline } from '../tracks/trackProjection.js';
import type { ReplayTrajectoryPoint } from '../core/types.js';

/**
 * Every car's place on the track through a replay, at a low rate: enough to tell who was right
 * in front of whom and where, without decoding the full-rate laps again.
 */
export const POSITION_SAMPLE_HZ = 5;

/**
 * Bumped when the stored index layout or the way it is built changes.
 * v2: garage state recomputed from the pit events (cars no longer dropped after a pit stop).
 */
export const RACE_POSITIONS_VERSION = 'v2';

/** Samples further apart than this in time are a gap in the recording (pits, garage): no position between them. */
const MAX_SAMPLE_GAP_SEC = 1.5;

export interface DriverPositions {
  slot: number;
  /** Replay time of each sample, ascending (seconds). */
  times: number[];
  /**
   * Distance along the track, unwrapped across laps (metres). It starts from the first sample's
   * station, so it differs from the true race distance by a whole number of laps: the station is
   * the distance modulo the track length.
   */
  distances: number[];
  /** The replay's lap cuts: when each lap started and ended on the replay clock. */
  laps: Array<{ lapNumber: number; startSec: number; endSec: number }>;
}

export interface RacePositions {
  version: string;
  trackLengthM: number;
  drivers: DriverPositions[];
}

/** One stored lap of one car, reduced to what the index needs. */
export interface LapSamples {
  lapNumber: number;
  times: number[];
  x: number[];
  z: number[];
  /** Whether each sample is on the track (not in the pits or the garage, not a teleport). */
  onTrack: boolean[];
}

/**
 * Projects a car's laps onto the centreline and joins them into one unwrapped distance series.
 * Samples off the track are dropped, which leaves a time gap no position is read across.
 */
export function buildDriverPositions(slot: number, laps: LapSamples[], centerline: CenterlineSpatialIndex): DriverPositions {
  const trackLengthM = centerline.totalLengthM;
  const times: number[] = [];
  const distances: number[] = [];
  const lapSpans: DriverPositions['laps'] = [];
  let offset = 0;
  let previous: number | null = null;

  for (const lap of [...laps].sort((a, b) => a.lapNumber - b.lapNumber)) {
    if (lap.times.length === 0) continue;
    lapSpans.push({ lapNumber: lap.lapNumber, startSec: lap.times[0], endSec: lap.times[lap.times.length - 1] });
    const kept = lap.times.map((_, i) => i).filter((i) => lap.onTrack[i]);
    if (kept.length < 2) continue;
    const points = kept.map((i) => ({ x: lap.x[i], y: 0, z: lap.z[i] }) as ReplayTrajectoryPoint);
    const { stations } = projectTrajectoryToCenterline(points, centerline, { clampSeam: false });
    kept.forEach((sampleIndex, k) => {
      const time = lap.times[sampleIndex];
      if (times.length > 0 && time <= times[times.length - 1]) return;
      let distance = stations[k] + offset;
      // Crossing the line wraps the station back to 0: carry the distance on.
      if (previous !== null) {
        while (distance < previous - trackLengthM / 2) { offset += trackLengthM; distance += trackLengthM; }
        while (distance > previous + trackLengthM / 2) { offset -= trackLengthM; distance -= trackLengthM; }
      }
      times.push(time);
      distances.push(Math.round(distance * 10) / 10);
      previous = distance;
    });
  }
  return { slot, times, distances, laps: lapSpans };
}

/** How many of the ascending values are at or below `time`. */
export function countAtOrBelow(sorted: number[], time: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= time) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** The car's unwrapped distance at `time`, or null when it was not recorded on track then. */
export function distanceAt(driver: DriverPositions, time: number): number | null {
  const after = countAtOrBelow(driver.times, time);
  const before = after - 1;
  if (before < 0) return null;
  if (after >= driver.times.length) return driver.times[before] === time ? driver.distances[before] : null;
  const t0 = driver.times[before];
  const t1 = driver.times[after];
  if (t1 - t0 > MAX_SAMPLE_GAP_SEC) return null;
  return driver.distances[before] + (driver.distances[after] - driver.distances[before]) * ((time - t0) / (t1 - t0));
}

const lapStartCache = new WeakMap<DriverPositions, number[]>();

export const positiveModulo =(value: number, length: number) => ((value % length) + length) % length;

/**
 * Laps covered at `time`, as a fraction (lap 3 half done = 2.5): the replay's lap number plus
 * how far round the lap the car is. A lap cut can land a few metres either side of the line, so
 * a station in the far half right after a lap started still belongs to the previous lap.
 */
export function lapProgressAt(driver: DriverPositions, distance: number, time: number, trackLengthM: number): number | null {
  let starts = lapStartCache.get(driver);
  if (!starts) {
    starts = driver.laps.map((lap) => lap.startSec);
    lapStartCache.set(driver, starts);
  }
  const index = countAtOrBelow(starts, time) - 1;
  const lap = driver.laps[index];
  if (!lap) return null;
  const fraction = positiveModulo(distance, trackLengthM) / trackLengthM;
  const halfway = (lap.startSec + lap.endSec) / 2;
  if (fraction > 0.5 && time < halfway) return lap.lapNumber - 2 + fraction;
  if (fraction < 0.5 && time > halfway) return lap.lapNumber + fraction;
  return lap.lapNumber - 1 + fraction;
}
