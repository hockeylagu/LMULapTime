import { ReplayTrajectoryPoint } from '../../server/types.js';
import { InterpolatedPoint, computeCumulativeDistances, interpolatePointAtDistance } from './replayComparison.js';

interface BaseSegmentComparison {
  segmentIndex: number;
  entryDistM: number;
  exitDistM: number;
  lengthM: number;
  timeDeltaSec: number;
}

export interface CornerSegmentComparison extends BaseSegmentComparison {
  type: 'corner';
  cornerNumber: number;
  minDistM: number;
  primaryEntrySpeedKmh: number;
  baselineEntrySpeedKmh: number;
  entrySpeedDeltaKmh: number;
  primaryMinSpeedKmh: number;
  baselineMinSpeedKmh: number;
  minSpeedDeltaKmh: number;
  primaryExitSpeedKmh: number;
  baselineExitSpeedKmh: number;
  exitSpeedDeltaKmh: number;
  // Distance (m) into the corner window where brake/throttle first crosses its threshold; null
  // if it never crosses (e.g. a flat-out kink, or partial throttle the whole way through).
  primaryBrakingDistM: number | null;
  baselineBrakingDistM: number | null;
  brakingPointDeltaM: number | null;
  primaryThrottleOnDistM: number | null;
  baselineThrottleOnDistM: number | null;
  throttleOnDeltaM: number | null;
}

export interface StraightSegmentComparison extends BaseSegmentComparison {
  type: 'straight';
  primaryTopSpeedKmh: number;
  baselineTopSpeedKmh: number;
  topSpeedDeltaKmh: number;
  // Speed at the straight's own end boundary (not just the fastest point anywhere along it) -
  // for the lap's final straight, this boundary IS the start/finish line.
  primaryExitSpeedKmh: number;
  baselineExitSpeedKmh: number;
  exitSpeedDeltaKmh: number;
}

export type LapSegmentComparison = CornerSegmentComparison | StraightSegmentComparison;

interface SpeedTurningPoint {
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
function findSpeedTurningPoints(
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

const SEGMENT_SCAN_STEP_M = 2;
const BRAKE_ON_THRESHOLD_PCT = 10;
const THROTTLE_ON_THRESHOLD_PCT = 90;
const MIN_STRAIGHT_LENGTH_M = 5;

// A steering reversal only counts as "genuine" if the lock built up to at least this fraction
// of whatever the strongest steering input anywhere in the lap was - keeps small wheel
// corrections mid-corner from being mistaken for a full direction change.
const STEER_REVERSAL_FRACTION = 0.25;

/**
 * Returns the largest absolute steering value seen anywhere in the lap, used to scale the
 * reversal-detection threshold above so it works regardless of whether steerYaw is in raw
 * degrees or a normalized -1..1 range (different telemetry sources use different units).
 */
function computeMaxAbsSteer(points: ReplayTrajectoryPoint[]): number {
  let maxAbs = 0;
  for (const p of points) maxAbs = Math.max(maxAbs, Math.abs(p.steerYaw || 0));
  return maxAbs;
}

/**
 * Scans forward from fromDist to toDist (in fixed steps) and returns the distance where the
 * sampled channel first reaches `threshold`, or null if it never does within the window.
 */
function findThresholdCrossingDistM(
  points: ReplayTrajectoryPoint[],
  dists: number[],
  fromDist: number,
  toDist: number,
  getValue: (p: InterpolatedPoint) => number,
  threshold: number
): number | null {
  if (toDist <= fromDist) return null;
  for (let d = fromDist; d < toDist; d += SEGMENT_SCAN_STEP_M) {
    if (getValue(interpolatePointAtDistance(points, dists, d)) >= threshold) return Math.round(d);
  }
  return getValue(interpolatePointAtDistance(points, dists, toDist)) >= threshold ? Math.round(toDist) : null;
}

/**
 * Returns the highest speed sampled between fromDist and toDist (fixed-step scan) for one lap.
 */
function maxSpeedInRangeKmh(points: ReplayTrajectoryPoint[], dists: number[], fromDist: number, toDist: number): number {
  let maxV = 0;
  for (let d = fromDist; d <= toDist; d += SEGMENT_SCAN_STEP_M) {
    maxV = Math.max(maxV, interpolatePointAtDistance(points, dists, d).speedKmh);
  }
  maxV = Math.max(maxV, interpolatePointAtDistance(points, dists, toDist).speedKmh);
  return maxV;
}

/**
 * Detects corners (braking -> apex -> acceleration) from the baseline lap's speed trace and
 * builds a complete, contiguous breakdown of the WHOLE lap (corners + the straights between
 * them) comparing primary vs baseline. Each segment's `timeDeltaSec` isolates the time
 * gained/lost across just that stretch (not cumulative drift from earlier on), so the full
 * list sums to the lap's total time delta - together this explains where the overall gap
 * comes from, not just how big it is.
 *
 * NOTE ON NUMBERING: T1/T2/T3... are just detected dips numbered in lap order, not the
 * track's official turn numbers (we have no ground-truth layout to map to - see repo memory
 * track-geometry-sources.md). A genuine but small/fast corner whose speed loss falls below
 * `minProminenceKmh` gets silently skipped, which shifts every later corner's number down by
 * one relative to reality. The default here (6) sits just above the ~5 km/h noise floor
 * (see the "ignores noise dips" test) to catch small real corners without flagging jitter.
 *
 * LINKED CORNERS (esses/chicanes): a genuine steering-direction reversal can force a turn
 * point once the speed swing reaches `MIN_LINKED_PROMINENCE_KMH` (much lower than the normal
 * `minProminenceKmh`) - see `findSpeedTurningPoints`. Speed alone can't separate corners where
 * the car never gets back up to speed between apexes, but a steering reversal proves the car
 * changed direction.
 */
export function computeLapSegmentComparisons(
  primaryPoints: ReplayTrajectoryPoint[],
  baselinePoints: ReplayTrajectoryPoint[],
  minProminenceKmh = 6
): LapSegmentComparison[] {
  if (!primaryPoints?.length || !baselinePoints?.length) return [];

  const primaryDists = computeCumulativeDistances(primaryPoints);
  const baselineDists = computeCumulativeDistances(baselinePoints);
  const minSteerAmplitude = computeMaxAbsSteer(baselinePoints) * STEER_REVERSAL_FRACTION;
  const turningPoints = findSpeedTurningPoints(baselinePoints, baselineDists, minProminenceKmh, minSteerAmplitude);
  const totalDistM = baselineDists[baselineDists.length - 1] || 0;

  // A dangling min/max at either end of the lap - e.g. the last corner leads straight onto
  // the line with no further speed dip before the data ends - has no closing boundary of the
  // opposite type, so the corner-building loop below (which requires a max on both sides of
  // every min) would otherwise silently drop it instead of treating it as a real corner.
  // Close it off using the lap's own start/end point as an implicit boundary.
  if (turningPoints.length > 0 && turningPoints[0].type === 'min' && turningPoints[0].distM >= MIN_STRAIGHT_LENGTH_M) {
    turningPoints.unshift({ index: 0, distM: 0, type: 'max' });
  }
  if (
    turningPoints.length > 0 &&
    turningPoints[turningPoints.length - 1].type === 'min' &&
    totalDistM - turningPoints[turningPoints.length - 1].distM >= MIN_STRAIGHT_LENGTH_M
  ) {
    turningPoints.push({ index: baselinePoints.length - 1, distM: totalDistM, type: 'max' });
  }

  const deltaAt = (distM: number): number => {
    const p = interpolatePointAtDistance(primaryPoints, primaryDists, distM);
    const b = interpolatePointAtDistance(baselinePoints, baselineDists, distM);
    return p.timeSec - b.timeSec;
  };

  const buildStraight = (fromDist: number, toDist: number): StraightSegmentComparison | null => {
    if (toDist - fromDist < MIN_STRAIGHT_LENGTH_M) return null;
    const primaryTop = maxSpeedInRangeKmh(primaryPoints, primaryDists, fromDist, toDist);
    const baselineTop = maxSpeedInRangeKmh(baselinePoints, baselineDists, fromDist, toDist);
    const primaryAtExit = interpolatePointAtDistance(primaryPoints, primaryDists, toDist).speedKmh;
    const baselineAtExit = interpolatePointAtDistance(baselinePoints, baselineDists, toDist).speedKmh;
    return {
      type: 'straight',
      segmentIndex: 0,
      entryDistM: Math.round(fromDist),
      exitDistM: Math.round(toDist),
      lengthM: Math.round(toDist - fromDist),
      primaryTopSpeedKmh: Math.round(primaryTop),
      baselineTopSpeedKmh: Math.round(baselineTop),
      topSpeedDeltaKmh: Math.round(primaryTop - baselineTop),
      primaryExitSpeedKmh: Math.round(primaryAtExit),
      baselineExitSpeedKmh: Math.round(baselineAtExit),
      exitSpeedDeltaKmh: Math.round(primaryAtExit - baselineAtExit),
      timeDeltaSec: Number((deltaAt(toDist) - deltaAt(fromDist)).toFixed(3)),
    };
  };

  const buildCorner = (cornerNumber: number, entry: SpeedTurningPoint, min: SpeedTurningPoint, exit: SpeedTurningPoint): CornerSegmentComparison => {
    const primaryAtEntry = interpolatePointAtDistance(primaryPoints, primaryDists, entry.distM);
    const primaryAtMin = interpolatePointAtDistance(primaryPoints, primaryDists, min.distM);
    const primaryAtExit = interpolatePointAtDistance(primaryPoints, primaryDists, exit.distM);
    const baselineAtEntry = interpolatePointAtDistance(baselinePoints, baselineDists, entry.distM);
    const baselineAtMin = interpolatePointAtDistance(baselinePoints, baselineDists, min.distM);
    const baselineAtExit = interpolatePointAtDistance(baselinePoints, baselineDists, exit.distM);

    const primaryBrakingDistM = findThresholdCrossingDistM(primaryPoints, primaryDists, entry.distM, min.distM, p => p.brake, BRAKE_ON_THRESHOLD_PCT);
    const baselineBrakingDistM = findThresholdCrossingDistM(baselinePoints, baselineDists, entry.distM, min.distM, p => p.brake, BRAKE_ON_THRESHOLD_PCT);
    const primaryThrottleOnDistM = findThresholdCrossingDistM(primaryPoints, primaryDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT);
    const baselineThrottleOnDistM = findThresholdCrossingDistM(baselinePoints, baselineDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT);

    return {
      type: 'corner',
      segmentIndex: 0,
      cornerNumber,
      entryDistM: Math.round(entry.distM),
      minDistM: Math.round(min.distM),
      exitDistM: Math.round(exit.distM),
      lengthM: Math.round(exit.distM - entry.distM),
      primaryEntrySpeedKmh: Math.round(primaryAtEntry.speedKmh),
      baselineEntrySpeedKmh: Math.round(baselineAtEntry.speedKmh),
      entrySpeedDeltaKmh: Math.round(primaryAtEntry.speedKmh - baselineAtEntry.speedKmh),
      primaryMinSpeedKmh: Math.round(primaryAtMin.speedKmh),
      baselineMinSpeedKmh: Math.round(baselineAtMin.speedKmh),
      minSpeedDeltaKmh: Math.round(primaryAtMin.speedKmh - baselineAtMin.speedKmh),
      primaryExitSpeedKmh: Math.round(primaryAtExit.speedKmh),
      baselineExitSpeedKmh: Math.round(baselineAtExit.speedKmh),
      exitSpeedDeltaKmh: Math.round(primaryAtExit.speedKmh - baselineAtExit.speedKmh),
      primaryBrakingDistM,
      baselineBrakingDistM,
      brakingPointDeltaM: primaryBrakingDistM !== null && baselineBrakingDistM !== null ? Math.round(primaryBrakingDistM - baselineBrakingDistM) : null,
      primaryThrottleOnDistM,
      baselineThrottleOnDistM,
      throttleOnDeltaM: primaryThrottleOnDistM !== null && baselineThrottleOnDistM !== null ? Math.round(primaryThrottleOnDistM - baselineThrottleOnDistM) : null,
      // Isolating the delta swing across just this segment (rather than the raw cumulative
      // delta at either end) attributes time gained/lost to this specific corner.
      timeDeltaSec: Number((deltaAt(exit.distM) - deltaAt(entry.distM)).toFixed(3)),
    };
  };

  const segments: LapSegmentComparison[] = [];
  let cornerNumber = 0;
  let prevBoundaryDist = 0;

  for (let i = 1; i < turningPoints.length - 1; i++) {
    const min = turningPoints[i];
    const entry = turningPoints[i - 1];
    const exit = turningPoints[i + 1];
    if (min.type !== 'min' || entry.type !== 'max' || exit.type !== 'max') continue;

    const straight = buildStraight(prevBoundaryDist, entry.distM);
    if (straight) segments.push(straight);

    cornerNumber++;
    segments.push(buildCorner(cornerNumber, entry, min, exit));
    prevBoundaryDist = exit.distM;
  }

  const trailing = buildStraight(prevBoundaryDist, totalDistM);
  if (trailing) segments.push(trailing);

  segments.forEach((s, idx) => { s.segmentIndex = idx; });
  return segments;
}
