export interface SpeedTurningPoint {
  index: number;
  distM: number;
  type: 'max' | 'min';
}

/** A speed swing smaller than this is telemetry noise, not a corner (km/h); just above the ~5 km/h noise floor. */
export const CORNER_MIN_PROMINENCE_KMH = 6;

// A steering reversal only forces a turn point at this much smaller speed swing than the
// normal prominence threshold - it still needs a genuine (if small) speed change, just not a
// full recovery, so pure flat-out kinks with zero speed change still don't count.
const MIN_LINKED_PROMINENCE_KMH = 2;

// A steering reversal only counts as "genuine" if the lock built up to at least this fraction
// of whatever the strongest steering input anywhere in the lap was - keeps small wheel
// corrections mid-corner from being mistaken for a full direction change.
export const STEER_REVERSAL_FRACTION = 0.25;

/**
 * Extracts alternating local speed maxima/minima from a speed-vs-distance trace, requiring
 * each swing to exceed `minProminenceKmh` before it counts, to reject telemetry noise.
 * A corner is a max -> min -> max run: it starts where the speed starts to drop for it (a brake,
 * a lift or a coast) and ends where it drops for the next.
 *
 * `minSteerReversalAmplitude` (if > 0) lets a genuine steering-direction reversal force a turn
 * point early, once the speed swing since the last extreme reaches just `MIN_LINKED_PROMINENCE_KMH`
 * instead of the full `minProminenceKmh` - this is what separates linked corners/esses where
 * the car changes direction again before speed fully recovers between apexes.
 */
export function findSpeedTurningPoints(
  speedKmh: ReadonlyArray<number | null | undefined>,
  steer: ReadonlyArray<number | null | undefined>,
  dists: readonly number[],
  minProminenceKmh: number,
  minSteerReversalAmplitude = 0
): SpeedTurningPoint[] {
  if (speedKmh.length < 3) return [];
  const turningPoints: SpeedTurningPoint[] = [];
  let direction: 'up' | 'down' | null = null;
  let extremeIdx = 0;
  let extremeVal = speedKmh[0] || 0;

  // Tracks the steering trace's own running sign/extreme so a genuine direction reversal
  // (sign flip after building up real lock) can be detected at each sample.
  let steerSign = 0;
  let steerExtreme = 0;

  for (let i = 1; i < speedKmh.length; i++) {
    const v = speedKmh[i] || 0;

    let steerReversed = false;
    if (minSteerReversalAmplitude > 0) {
      const value = steer[i] || 0;
      const curSteerSign = value > 0 ? 1 : value < 0 ? -1 : 0;
      if (curSteerSign !== 0) {
        if (steerSign === 0) {
          steerSign = curSteerSign;
          steerExtreme = Math.abs(value);
        } else if (curSteerSign === steerSign) {
          steerExtreme = Math.max(steerExtreme, Math.abs(value));
        } else {
          steerReversed = steerExtreme >= minSteerReversalAmplitude;
          steerSign = curSteerSign;
          steerExtreme = Math.abs(value);
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

/** The lap's largest steering value either way: the reversal threshold scales with it, whatever the unit. */
export function maxAbsSteer(steer: ReadonlyArray<number | null | undefined>): number {
  let maxAbs = 0;
  for (const value of steer) maxAbs = Math.max(maxAbs, Math.abs(value || 0));
  return maxAbs;
}
