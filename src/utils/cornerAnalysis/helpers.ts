import { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { InterpolatedPoint, interpolatePointAtDistance } from '../replayComparison.js';

export interface SpeedTurningPoint {
  index: number;
  distM: number;
  type: 'max' | 'min';
}

// A steering reversal only forces a turn point at this much smaller speed swing than the
// normal prominence threshold - it still needs a genuine (if small) speed change, just not a
// full recovery, so pure flat-out kinks with zero speed change still don't count.
const MIN_LINKED_PROMINENCE_KMH = 2;

/**
 * Extracts alternating local speed maxima/minima from a speed-vs-distance trace, requiring
 * each swing to exceed `minProminenceKmh` before it counts, to reject telemetry noise.
 *
 * `minSteerReversalAmplitude` (if > 0) lets a genuine steering-direction reversal force a turn
 * point early, once the speed swing since the last extreme reaches just `MIN_LINKED_PROMINENCE_KMH`
 * instead of the full `minProminenceKmh` - this is what separates linked corners/esses where
 * the car changes direction again before speed fully recovers between apexes.
 */
export function findSpeedTurningPoints(
  points: ReplayTrajectoryPoint[],
  dists: number[],
  minProminenceKmh: number,
  minSteerReversalAmplitude = 0
): SpeedTurningPoint[] {
  if (points.length < 3) return [];
  const turningPoints: SpeedTurningPoint[] = [];
  let direction: 'up' | 'down' | null = null;
  let extremeIdx = 0;
  let extremeVal = points[0].speedKmh || 0;

  // Tracks the steering trace's own running sign/extreme so a genuine direction reversal
  // (sign flip after building up real lock) can be detected at each sample.
  let steerSign = 0;
  let steerExtreme = 0;

  for (let i = 1; i < points.length; i++) {
    const v = points[i].speedKmh || 0;

    let steerReversed = false;
    if (minSteerReversalAmplitude > 0) {
      const steer = points[i].steerYaw || 0;
      const curSteerSign = steer > 0 ? 1 : steer < 0 ? -1 : 0;
      if (curSteerSign !== 0) {
        if (steerSign === 0) {
          steerSign = curSteerSign;
          steerExtreme = Math.abs(steer);
        } else if (curSteerSign === steerSign) {
          steerExtreme = Math.max(steerExtreme, Math.abs(steer));
        } else {
          steerReversed = steerExtreme >= minSteerReversalAmplitude;
          steerSign = curSteerSign;
          steerExtreme = Math.abs(steer);
        }
      }
    }

    if (direction === null) {
      if (v > extremeVal) direction = 'up';
      else if (v < extremeVal) direction = 'down';
      continue;
    }
    if (direction === 'up') {
      if (v >= extremeVal) {
        extremeVal = v;
        extremeIdx = i;
      } else if (extremeVal - v >= minProminenceKmh || (steerReversed && extremeVal - v >= MIN_LINKED_PROMINENCE_KMH)) {
        turningPoints.push({ index: extremeIdx, distM: dists[extremeIdx], type: 'max' });
        direction = 'down';
        extremeVal = v;
        extremeIdx = i;
      }
    } else {
      if (v <= extremeVal) {
        extremeVal = v;
        extremeIdx = i;
      } else if (v - extremeVal >= minProminenceKmh || (steerReversed && v - extremeVal >= MIN_LINKED_PROMINENCE_KMH)) {
        turningPoints.push({ index: extremeIdx, distM: dists[extremeIdx], type: 'min' });
        direction = 'up';
        extremeVal = v;
        extremeIdx = i;
      }
    }
  }
  return turningPoints;
}

export const SEGMENT_SCAN_STEP_M = 2;
export const BRAKE_ON_THRESHOLD_PCT = 10;
export const THROTTLE_ON_THRESHOLD_PCT = 90;
// Throttle counts as on once its mean over this long after the crossing (or until the corner's
// exit) is at/over the threshold. A single sample over 90% - a VCR quantisation spike, a stab the driver takes
// back - is not the pick-up, and whether one such sample survives depends on the resolution.
export const THROTTLE_ON_MIN_HOLD_SEC = 0.4;
export const MIN_STRAIGHT_LENGTH_M = 5;

// A steering reversal only counts as "genuine" if the lock built up to at least this fraction
// of whatever the strongest steering input anywhere in the lap was - keeps small wheel
// corrections mid-corner from being mistaken for a full direction change.
export const STEER_REVERSAL_FRACTION = 0.25;

/**
 * Returns the largest absolute steering value seen anywhere in the lap, used to scale the
 * reversal-detection threshold above so it works regardless of whether steerYaw is in raw
 * degrees or a normalized -1..1 range (different telemetry sources use different units).
 */
export function computeMaxAbsSteer(points: ReplayTrajectoryPoint[]): number {
  let maxAbs = 0;
  for (const p of points) maxAbs = Math.max(maxAbs, Math.abs(p.steerYaw || 0));
  return maxAbs;
}

// How far before a corner's entry (speed peak) a brake application may have started. A lap
// compared against another lap's corner windows can brake before that lap's speed peak.
export const BRAKE_ONSET_LOOKBACK_M = 150;

/**
 * Throttle pick-up is searched from the apex, but a lap can be back on the throttle before
 * the (other lap's) apex - look back as far as the corner entry, never into the straight before.
 */
export function throttleOnsetLookbackM(entryDistM: number, apexDistM: number): number {
  return Math.max(0, apexDistM - entryDistM);
}

function firstIndexAbove(dists: number[], d: number): number {
  let low = 0;
  let high = dists.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (dists[mid] <= d) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Returns the distance where the channel first reaches `threshold` between fromDist and
 * toDist, linearly interpolated between recorded samples, or null if it never does.
 *
 * When the channel is already at/over the threshold at fromDist and `lookbackM` > 0, the
 * application started before the window: samples are walked backwards (up to lookbackM) to
 * where it began, instead of reporting the window start as the onset. If it never drops below
 * the threshold within the lookback (e.g. a corner taken flat), the window start is returned.
 *
 * With `minHoldSec` > 0 a crossing only counts if the channel's mean over that long after it
 * (cut short at toDist) is at/over the threshold; crossings that fall back sooner are skipped.
 */
export function findThresholdCrossingDistM(
  points: ReplayTrajectoryPoint[],
  dists: number[],
  fromDist: number,
  toDist: number,
  getValue: (p: InterpolatedPoint) => number,
  threshold: number,
  lookbackM = 0,
  minHoldSec = 0
): number | null {
  if (toDist <= fromDist || points.length === 0) return null;
  const valueAt = (d: number) => getValue(interpolatePointAtDistance(points, dists, d));
  const crossingBetween = (d0: number, v0: number, d1: number, v1: number) =>
    Math.round(v1 === v0 ? d1 : d0 + ((threshold - v0) / (v1 - v0)) * (d1 - d0));
  const timeAt = (d: number) => interpolatePointAtDistance(points, dists, d).timeSec;
  const holds = (d: number) => holdsAboveThreshold(points, dists, d, Math.min(timeAt(d) + minHoldSec, timeAt(toDist)), valueAt, threshold);

  const startValue = valueAt(fromDist);
  const firstAfterStart = firstIndexAbove(dists, fromDist);

  if (startValue >= threshold && (minHoldSec <= 0 || holds(fromDist))) {
    if (lookbackM <= 0) return Math.round(fromDist);
    const limit = fromDist - lookbackM;
    let laterD = fromDist;
    let laterV = startValue;
    for (let k = firstAfterStart - 1; k >= 0 && dists[k] >= limit; k--) {
      if (dists[k] >= laterD) continue;
      const v = valueAt(dists[k]);
      if (v < threshold) return crossingBetween(dists[k], v, laterD, laterV);
      laterD = dists[k];
      laterV = v;
    }
    return Math.round(fromDist);
  }

  let prevD = fromDist;
  let prevV = startValue;
  for (let k = firstAfterStart; k < dists.length && dists[k] < toDist; k++) {
    if (dists[k] <= prevD) continue;
    const v = valueAt(dists[k]);
    if (v >= threshold && prevV < threshold) {
      const crossing = crossingBetween(prevD, prevV, dists[k], v);
      if (minHoldSec <= 0 || holds(crossing)) return crossing;
    }
    prevD = dists[k];
    prevV = v;
  }
  const endValue = valueAt(toDist);
  return endValue >= threshold ? crossingBetween(prevD, prevV, toDist, endValue) : null;
}

/**
 * Whether the channel's mean, from distance fromD until lap time untilSec, is at/over the
 * threshold. The mean is taken over time on the linearly interpolated trace, so a single
 * sample dipping just under it doesn't fail the hold, a single spike doesn't pass it, and the
 * answer doesn't depend on how densely the lap is sampled. Laps without timestamps cannot
 * measure a hold, so they always pass.
 */
function holdsAboveThreshold(
  points: ReplayTrajectoryPoint[],
  dists: number[],
  fromD: number,
  untilSec: number,
  valueAt: (d: number) => number,
  threshold: number
): boolean {
  const t0 = points[0].timeSec ?? 0;
  const timeOf = (k: number) => (points[k].timeSec ?? 0) - t0;
  if (timeOf(points.length - 1) <= 0) return true;
  const startSec = interpolatePointAtDistance(points, dists, fromD).timeSec;
  if (untilSec - startSec <= 1e-6) return true;
  let prevT = startSec;
  let prevV = valueAt(fromD);
  let area = 0;
  for (let k = firstIndexAbove(dists, fromD); k < points.length && prevT < untilSec; k++) {
    const t = timeOf(k);
    if (t <= prevT) continue;
    let v = valueAt(dists[k]);
    let segEnd = t;
    if (t > untilSec) {
      v = prevV + ((untilSec - prevT) / (t - prevT)) * (v - prevV);
      segEnd = untilSec;
    }
    area += ((prevV + v) / 2) * (segEnd - prevT);
    prevT = segEnd;
    prevV = v;
  }
  return area / (prevT - startSec || 1) >= threshold;
}

/**
 * Returns the highest speed sampled between fromDist and toDist (fixed-step scan) for one lap.
 */
export function maxSpeedInRangeKmh(points: ReplayTrajectoryPoint[], dists: number[], fromDist: number, toDist: number): number {
  let maxV = 0;
  for (let d = fromDist; d <= toDist; d += SEGMENT_SCAN_STEP_M) {
    maxV = Math.max(maxV, interpolatePointAtDistance(points, dists, d).speedKmh);
  }
  maxV = Math.max(maxV, interpolatePointAtDistance(points, dists, toDist).speedKmh);
  return maxV;
}

export function getHeadingAtDistance(points: ReplayTrajectoryPoint[], dists: number[], d: number, spanM = 4): number {
  if (points.length < 2 || dists.length < 2) return 0;
  const maxD = dists[dists.length - 1] || d;
  const pPrev = interpolatePointAtDistance(points, dists, Math.max(0, d - spanM));
  const pNext = interpolatePointAtDistance(points, dists, Math.min(maxD, d + spanM));
  const dx = pNext.x - pPrev.x;
  const dz = pNext.z - pPrev.z;
  if (Math.hypot(dx, dz) < 0.05) return 0;
  return Math.atan2(dx, dz);
}

