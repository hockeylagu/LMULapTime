import { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import {
  InterpolatedPoint,
  computeLapComparisons,
  interpolatePointAtDistance,
} from './replayComparison.js';
import {
  interpolateScalarAtDistance,
  getTrajectoryDistances,
  getDistancesInReferenceFrame,
} from './lapAlignment.js';
import { unwrapAngle } from './computedTelemetry.js';

interface BaseSegmentComparison {
  segmentIndex: number;
  entryDistM: number;
  exitDistM: number;
  lengthM: number;
  primaryTimeSec: number;
  timeDeltaSec: number;
}

export interface CornerTrackUsage {
  entryOffsetM?: number;
  entrySpaceLeftM?: number;
  apexMarginM?: number;
  apexSpaceLeftM?: number;
  exitWidthM?: number;
  exitTrackOutOffsetM?: number;
  exitSpaceLeftM?: number;
  totalSweepM?: number;
}

export interface CornerPhaseTiming {
  entry?: { startDistM: number; endDistM: number; timeDeltaSec: number };
  rotation: { startDistM: number; endDistM: number; timeDeltaSec: number };
  exit: { startDistM: number; endDistM: number; timeDeltaSec: number };
}

export interface CornerTypeSpecificDetails {
  exitWheelSlipActive?: boolean;
  steeringScrubDeg?: number;
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
  primaryInitialThrottleDistM?: number | null;
  baselineInitialThrottleDistM?: number | null;
  initialThrottleDeltaM?: number | null;

  // --- Enhanced Corner Quality & Technique Metrics ---
  turnDirection?: 'left' | 'right';
  cornerAngleDeg?: number;
  effectiveRadiusM?: number;
  apexRatioPct?: number;

  // Turn-In Point
  primaryTurnInDistM?: number | null;
  baselineTurnInDistM?: number | null;
  turnInDeltaM?: number | null;
  straightBrakingDistM?: number | null;

  // Trail-Braking
  trailBrakeDistM?: number;
  trailBrakeDurationSec?: number;

  // Rotation Dynamics
  primaryPeakYawRateDeg?: number;
  baselinePeakYawRateDeg?: number;
  peakYawRateDeltaDeg?: number;

  // Rotation Complete at Throttle
  primaryRotationAtThrottlePct?: number | null;
  baselineRotationAtThrottlePct?: number | null;
  rotationAtThrottleDeltaPct?: number | null;

  // Track Usage
  primaryTrackUsage?: CornerTrackUsage;
  baselineTrackUsage?: CornerTrackUsage;
  entrySpaceDeltaM?: number | null;
  apexSpaceDeltaM?: number | null;
  exitSpaceDeltaM?: number | null;

  // Isolated time deltas for physical corner phases. Entry is unavailable when turn-in
  // cannot be measured; rotation then begins at the detected corner entry.
  phaseTiming?: CornerPhaseTiming;

  typeSpecificDetails?: CornerTypeSpecificDetails;
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

export const SEGMENT_SCAN_STEP_M = 2;
export const BRAKE_ON_THRESHOLD_PCT = 10;
export const THROTTLE_ON_THRESHOLD_PCT = 90;
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
 */
export function findThresholdCrossingDistM(
  points: ReplayTrajectoryPoint[],
  dists: number[],
  fromDist: number,
  toDist: number,
  getValue: (p: InterpolatedPoint) => number,
  threshold: number,
  lookbackM = 0
): number | null {
  if (toDist <= fromDist || points.length === 0) return null;
  const valueAt = (d: number) => getValue(interpolatePointAtDistance(points, dists, d));
  const crossingBetween = (d0: number, v0: number, d1: number, v1: number) =>
    Math.round(v1 === v0 ? d1 : d0 + ((threshold - v0) / (v1 - v0)) * (d1 - d0));

  const startValue = valueAt(fromDist);
  const firstAfterStart = firstIndexAbove(dists, fromDist);

  if (startValue >= threshold) {
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
    if (v >= threshold) return crossingBetween(prevD, prevV, dists[k], v);
    prevD = dists[k];
    prevV = v;
  }
  const endValue = valueAt(toDist);
  return endValue >= threshold ? crossingBetween(prevD, prevV, toDist, endValue) : null;
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

/**
 * Detects corners (braking -> apex -> acceleration) from the PRIMARY lap's speed trace and
 * builds a complete, contiguous breakdown of the WHOLE lap (corners + the straights between
 * them) comparing primary vs baseline. All distances are in the primary lap's frame; corner
 * numbering can therefore change when the primary lap changes. Each segment's `timeDeltaSec` isolates the time
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
  minProminenceKmh = 6,
  trackLengthM?: number,
  nominalWidthM?: number
): LapSegmentComparison[] {
  if (!primaryPoints?.length || !baselinePoints?.length) return [];

  // Every segment window and pedal point below is in the PRIMARY lap's distance frame. The
  // baseline's distances are expressed in that same frame (matched on track station, like the
  // telemetry channels) so its brake/throttle points refer to the same physical spot - its own
  // driven distance drifts metres away from the primary's by mid-lap.
  const primaryDists = getTrajectoryDistances(primaryPoints, trackLengthM);
  const baselineDists = getDistancesInReferenceFrame(baselinePoints, primaryPoints, trackLengthM);
  const primaryMinSteerAmplitude = computeMaxAbsSteer(primaryPoints) * STEER_REVERSAL_FRACTION;
  const turningPoints = findSpeedTurningPoints(primaryPoints, primaryDists, minProminenceKmh, primaryMinSteerAmplitude);
  const totalDistM = primaryDists[primaryDists.length - 1] || 0;
  const startDistM = primaryDists[0] || 0;

  // A dangling min/max at either end of the lap - e.g. the last corner leads straight onto
  // the line with no further speed dip before the data ends - has no closing boundary of the
  // opposite type, so the corner-building loop below (which requires a max on both sides of
  // every min) would otherwise silently drop it instead of treating it as a real corner.
  // Close it off using the lap's own start/end point as an implicit boundary.
  if (turningPoints.length > 0 && turningPoints[0].type === 'min' && turningPoints[0].distM - startDistM >= MIN_STRAIGHT_LENGTH_M) {
    turningPoints.unshift({ index: 0, distM: startDistM, type: 'max' });
  }
  if (
    turningPoints.length > 0 &&
    turningPoints[turningPoints.length - 1].type === 'min' &&
    totalDistM - turningPoints[turningPoints.length - 1].distM >= MIN_STRAIGHT_LENGTH_M
  ) {
    turningPoints.push({ index: primaryPoints.length - 1, distM: totalDistM, type: 'max' });
  }

  // Segment and phase deltas are differences of the SAME cumulative delta trace the telemetry
  // delta channel shows (each lap timed from its own S/F crossing, extrapolated at the lap
  // edges), so the segments add up to the lap delta and never disagree with the chart. The
  // trace has one value per primary sample, so it is read at primary-frame distances directly.
  const channelDeltas = computeLapComparisons(primaryPoints, baselinePoints, trackLengthM).map(c => c.deltaTimeSec);
  const deltaAt = (distM: number): number => interpolateScalarAtDistance(channelDeltas, primaryDists, distM, true);

  const buildStraight = (fromDist: number, toDist: number): StraightSegmentComparison | null => {
    if (toDist - fromDist < MIN_STRAIGHT_LENGTH_M) return null;
    const primaryAtEntry = interpolatePointAtDistance(primaryPoints, primaryDists, fromDist);
    const primaryAtExit = interpolatePointAtDistance(primaryPoints, primaryDists, toDist);
    const primaryTop = maxSpeedInRangeKmh(primaryPoints, primaryDists, fromDist, toDist);
    const baselineTop = maxSpeedInRangeKmh(baselinePoints, baselineDists, fromDist, toDist);
    const baselineAtExit = interpolatePointAtDistance(baselinePoints, baselineDists, toDist).speedKmh;
    return {
      type: 'straight',
      segmentIndex: 0,
      entryDistM: Math.round(fromDist),
      exitDistM: Math.round(toDist),
      lengthM: Math.round(toDist - fromDist),
      primaryTimeSec: Number((primaryAtExit.timeSec - primaryAtEntry.timeSec).toFixed(3)),
      primaryTopSpeedKmh: Math.round(primaryTop),
      baselineTopSpeedKmh: Math.round(baselineTop),
      topSpeedDeltaKmh: Math.round(primaryTop - baselineTop),
      primaryExitSpeedKmh: Math.round(primaryAtExit.speedKmh),
      baselineExitSpeedKmh: Math.round(baselineAtExit),
      exitSpeedDeltaKmh: Math.round(primaryAtExit.speedKmh - baselineAtExit),
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

    const primaryBrakingDistM = findThresholdCrossingDistM(primaryPoints, primaryDists, entry.distM, min.distM, p => p.brake, BRAKE_ON_THRESHOLD_PCT, BRAKE_ONSET_LOOKBACK_M);
    const baselineBrakingDistM = findThresholdCrossingDistM(baselinePoints, baselineDists, entry.distM, min.distM, p => p.brake, BRAKE_ON_THRESHOLD_PCT, BRAKE_ONSET_LOOKBACK_M);
    const throttleLookbackM = throttleOnsetLookbackM(entry.distM, min.distM);
    const primaryThrottleOnDistM = findThresholdCrossingDistM(primaryPoints, primaryDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT, throttleLookbackM);
    const baselineThrottleOnDistM = findThresholdCrossingDistM(baselinePoints, baselineDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT, throttleLookbackM);

    // --- Enhanced Technique & Geometry Metrics ---
    const hEntry = getHeadingAtDistance(primaryPoints, primaryDists, entry.distM);
    const hExit = getHeadingAtDistance(primaryPoints, primaryDists, exit.distM);
    const dHeadingRad = unwrapAngle(hExit - hEntry);
    const cornerAngleDeg = Math.round(Math.abs(dHeadingRad) * (180 / Math.PI));

    let steerSum = 0;
    let steerCount = 0;
    let primaryPeakYawRateDeg = 0;
    let baselinePeakYawRateDeg = 0;
    let trailBrakeDistM = 0;
    let trailBrakeDurationSec = 0;
    let previousTrailBrakeSample: InterpolatedPoint | null = null;
    let previousTrailBrakeDistM: number | null = null;
    let maxUndersteerDeg = 0;
    let exitWheelSlipActive = false;

    for (let d = entry.distM; d <= exit.distM; d += SEGMENT_SCAN_STEP_M) {
      const p = interpolatePointAtDistance(primaryPoints, primaryDists, d);
      steerSum += p.steerYaw || 0;
      steerCount++;
      if (p.yawRateDeg !== undefined) {
        primaryPeakYawRateDeg = Math.max(primaryPeakYawRateDeg, Math.abs(p.yawRateDeg));
      }
      if ((p.brake || 0) >= 5 && Math.abs(p.steerYaw || 0) >= 5) {
        if (previousTrailBrakeSample && previousTrailBrakeDistM !== null) {
          trailBrakeDistM += d - previousTrailBrakeDistM;
          trailBrakeDurationSec += Math.max(0, p.timeSec - previousTrailBrakeSample.timeSec);
        }
        previousTrailBrakeSample = p;
        previousTrailBrakeDistM = d;
      } else {
        previousTrailBrakeSample = null;
        previousTrailBrakeDistM = null;
      }
      if (p.understeerDeg !== undefined) {
        maxUndersteerDeg = Math.max(maxUndersteerDeg, Math.abs(p.understeerDeg));
      }
      if (d >= min.distM) {
        if (p.tcActive === true || (p.tireSlipPct !== undefined && p.tireSlipPct > 12) || p.wheelLockActive === true) {
          exitWheelSlipActive = true;
        }
      }
    }

    if (baselinePoints && baselinePoints.length > 0) {
      for (let d = entry.distM; d <= exit.distM; d += SEGMENT_SCAN_STEP_M) {
        const bp = interpolatePointAtDistance(baselinePoints, baselineDists, d);
        if (bp.yawRateDeg !== undefined) {
          baselinePeakYawRateDeg = Math.max(baselinePeakYawRateDeg, Math.abs(bp.yawRateDeg));
        }
      }
    }

    const meanSteer = steerCount > 0 ? steerSum / steerCount : 0;
    const turnDirection: 'left' | 'right' = meanSteer !== 0
      ? (meanSteer > 0 ? 'right' : 'left')
      : (dHeadingRad >= 0 ? 'right' : 'left');

    const lengthM = Math.max(1, Math.round(exit.distM - entry.distM));
    const effectiveRadiusM = cornerAngleDeg > 0
      ? Math.round(lengthM / Math.max(0.05, Math.abs(dHeadingRad)))
      : Math.round(lengthM);

    const apexSpan = exit.distM - entry.distM;
    const apexRatioPct = apexSpan > 0 ? Math.round(((min.distM - entry.distM) / apexSpan) * 100) : 50;

    // Turn-In Point
    const primaryTurnInDistM = findThresholdCrossingDistM(
      primaryPoints,
      primaryDists,
      entry.distM,
      min.distM,
      p => Math.abs(p.steerYaw || 0),
      5
    );
    const baselineTurnInDistM = findThresholdCrossingDistM(
      baselinePoints,
      baselineDists,
      entry.distM,
      min.distM,
      p => Math.abs(p.steerYaw || 0),
      5
    );
    const turnInDeltaM = primaryTurnInDistM !== null && baselineTurnInDistM !== null
      ? primaryTurnInDistM - baselineTurnInDistM
      : null;
    const straightBrakingDistM = primaryBrakingDistM !== null && primaryTurnInDistM !== null && primaryTurnInDistM >= primaryBrakingDistM
      ? primaryTurnInDistM - primaryBrakingDistM
      : null;

    const phaseDelta = (startDistM: number, endDistM: number): number =>
      Number((deltaAt(endDistM) - deltaAt(startDistM)).toFixed(3));
    const rotationStartDistM = primaryTurnInDistM ?? entry.distM;
    const phaseTiming: CornerPhaseTiming = {
      entry: primaryTurnInDistM !== null
        ? {
            startDistM: Math.round(entry.distM),
            endDistM: primaryTurnInDistM,
            timeDeltaSec: phaseDelta(entry.distM, primaryTurnInDistM),
          }
        : undefined,
      rotation: {
        startDistM: Math.round(rotationStartDistM),
        endDistM: Math.round(min.distM),
        timeDeltaSec: phaseDelta(rotationStartDistM, min.distM),
      },
      exit: {
        startDistM: Math.round(min.distM),
        endDistM: Math.round(exit.distM),
        timeDeltaSec: phaseDelta(min.distM, exit.distM),
      },
    };

    // Trail-Braking
    const roundedTrailBrakeDistM = Math.round(trailBrakeDistM);
    const roundedTrailBrakeDurationSec = trailBrakeDistM > 0
      ? Number(trailBrakeDurationSec.toFixed(2))
      : undefined;

    // Rotation Complete at Throttle
    const initialPrimaryThrottleDistM = findThresholdCrossingDistM(
      primaryPoints,
      primaryDists,
      min.distM,
      exit.distM,
      p => p.throttle,
      15,
      throttleLookbackM
    ) ?? primaryThrottleOnDistM;

    const initialBaselineThrottleDistM = findThresholdCrossingDistM(
      baselinePoints,
      baselineDists,
      min.distM,
      exit.distM,
      p => p.throttle,
      15,
      throttleLookbackM
    ) ?? baselineThrottleOnDistM;

    let primaryRotationAtThrottlePct: number | null = null;
    if (initialPrimaryThrottleDistM !== null && Math.abs(dHeadingRad) > 0.05) {
      const hThrottle = getHeadingAtDistance(primaryPoints, primaryDists, initialPrimaryThrottleDistM);
      const rotRad = Math.abs(unwrapAngle(hThrottle - hEntry));
      primaryRotationAtThrottlePct = Math.min(100, Math.max(0, Math.round((rotRad / Math.abs(dHeadingRad)) * 100)));
    }

    let baselineRotationAtThrottlePct: number | null = null;
    if (initialBaselineThrottleDistM !== null && Math.abs(dHeadingRad) > 0.05) {
      const bhEntry = getHeadingAtDistance(baselinePoints, baselineDists, entry.distM);
      const bhThrottle = getHeadingAtDistance(baselinePoints, baselineDists, initialBaselineThrottleDistM);
      const bhExit = getHeadingAtDistance(baselinePoints, baselineDists, exit.distM);
      const bTotalRot = Math.abs(unwrapAngle(bhExit - bhEntry));
      if (bTotalRot > 0.05) {
        const bRotRad = Math.abs(unwrapAngle(bhThrottle - bhEntry));
        baselineRotationAtThrottlePct = Math.min(100, Math.max(0, Math.round((bRotRad / bTotalRot) * 100)));
      }
    }

    const rotationAtThrottleDeltaPct = primaryRotationAtThrottlePct !== null && baselineRotationAtThrottlePct !== null
      ? primaryRotationAtThrottlePct - baselineRotationAtThrottlePct
      : null;

    // Track Usage (with chord sagitta geometric fallback)
    const dxChord = primaryAtExit.x - primaryAtEntry.x;
    const dzChord = primaryAtExit.z - primaryAtEntry.z;
    const chordLen = Math.sqrt(dxChord * dxChord + dzChord * dzChord);
    const chordSagittaM = chordLen > 1
      ? Number((Math.abs(dzChord * primaryAtMin.x - dxChord * primaryAtMin.z + primaryAtExit.x * primaryAtEntry.z - primaryAtExit.z * primaryAtEntry.x) / chordLen).toFixed(1))
      : undefined;

    const bdxChord = baselineAtExit.x - baselineAtEntry.x;
    const bdzChord = baselineAtExit.z - baselineAtEntry.z;
    const bchordLen = Math.sqrt(bdxChord * bdxChord + bdzChord * bdzChord);
    const bchordSagittaM = bchordLen > 1
      ? Number((Math.abs(bdzChord * baselineAtMin.x - bdxChord * baselineAtMin.z + baselineAtExit.x * baselineAtEntry.z - baselineAtExit.z * baselineAtEntry.x) / bchordLen).toFixed(1))
      : undefined;

    // Corner Exit Track-Out & Space Left
    // Scan from apex (min.distM) up to the end of corner exit (min.distM + 120m or exit.distM)
    const exitScanEndM = Math.min(exit.distM, min.distM + 120);
    let primaryTrackOutOffsetM: number | undefined;
    let baselineTrackOutOffsetM: number | undefined;

    if (primaryAtMin.lateralOffsetM !== undefined) {
      let extremeOffset = primaryAtMin.lateralOffsetM;
      for (let d = min.distM; d <= exitScanEndM; d += SEGMENT_SCAN_STEP_M) {
        const pt = interpolatePointAtDistance(primaryPoints, primaryDists, d);
        if (pt.lateralOffsetM !== undefined) {
          if (turnDirection === 'right') {
            if (pt.lateralOffsetM < extremeOffset) extremeOffset = pt.lateralOffsetM;
          } else {
            if (pt.lateralOffsetM > extremeOffset) extremeOffset = pt.lateralOffsetM;
          }
        }
      }
      for (let i = 0; i < primaryPoints.length; i++) {
        const d = primaryDists[i];
        if (d >= min.distM && d <= exitScanEndM) {
          const off = primaryPoints[i].lateralOffsetM;
          if (off !== undefined) {
            if (turnDirection === 'right') {
              if (off < extremeOffset) extremeOffset = off;
            } else {
              if (off > extremeOffset) extremeOffset = off;
            }
          }
        }
      }
      primaryTrackOutOffsetM = Number(extremeOffset.toFixed(2));
    }

    if (baselinePoints && baselinePoints.length > 0 && baselineAtMin.lateralOffsetM !== undefined) {
      let bExtremeOffset = baselineAtMin.lateralOffsetM;
      for (let d = min.distM; d <= exitScanEndM; d += SEGMENT_SCAN_STEP_M) {
        const bpt = interpolatePointAtDistance(baselinePoints, baselineDists, d);
        if (bpt.lateralOffsetM !== undefined) {
          if (turnDirection === 'right') {
            if (bpt.lateralOffsetM < bExtremeOffset) bExtremeOffset = bpt.lateralOffsetM;
          } else {
            if (bpt.lateralOffsetM > bExtremeOffset) bExtremeOffset = bpt.lateralOffsetM;
          }
        }
      }
      for (let i = 0; i < baselinePoints.length; i++) {
        const d = baselineDists[i];
        if (d >= min.distM && d <= exitScanEndM) {
          const off = baselinePoints[i].lateralOffsetM;
          if (off !== undefined) {
            if (turnDirection === 'right') {
              if (off < bExtremeOffset) bExtremeOffset = off;
            } else {
              if (off > bExtremeOffset) bExtremeOffset = off;
            }
          }
        }
      }
      baselineTrackOutOffsetM = Number(bExtremeOffset.toFixed(2));
    }

    // Physical corner half-widths decoupled per phase:
    // Uses circuit nominal width (or 12.0m fallback). Each phase adapts to clean track limits / curbing
    // locally rather than allowing an entry apron or straightaway excursion to distort the apex or exit road width.
    const nominalHalfWidthM = (nominalWidthM ?? 12.0) / 2;

    // 1) Entry Space Left: distance to outside entry track edge
    const entryHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtEntry.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryAtEntry.lateralOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const primaryEntrySpaceLeftM = primaryAtEntry.lateralOffsetM !== undefined
      ? Number((entryHalfWidthM - Math.abs(primaryAtEntry.lateralOffsetM)).toFixed(1))
      : undefined;
    const baselineEntrySpaceLeftM = baselineAtEntry.lateralOffsetM !== undefined
      ? Number((entryHalfWidthM - Math.abs(baselineAtEntry.lateralOffsetM)).toFixed(1))
      : undefined;
    const entrySpaceDeltaM = primaryEntrySpaceLeftM !== undefined && baselineEntrySpaceLeftM !== undefined
      ? Number((primaryEntrySpaceLeftM - baselineEntrySpaceLeftM).toFixed(1))
      : null;

    // 2) Apex Space Left: distance to inside apex curb
    const apexHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtMin.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryAtMin.lateralOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const primaryApexSpaceLeftM = primaryAtMin.lateralOffsetM !== undefined
      ? Number((apexHalfWidthM - Math.abs(primaryAtMin.lateralOffsetM)).toFixed(1))
      : undefined;
    const baselineApexSpaceLeftM = baselineAtMin.lateralOffsetM !== undefined
      ? Number((apexHalfWidthM - Math.abs(baselineAtMin.lateralOffsetM)).toFixed(1))
      : undefined;
    const apexSpaceDeltaM = primaryApexSpaceLeftM !== undefined && baselineApexSpaceLeftM !== undefined
      ? Number((primaryApexSpaceLeftM - baselineApexSpaceLeftM).toFixed(1))
      : null;

    // 3) Exit Space Left: distance to outside exit track edge at track-out
    const exitHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtExit.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryTrackOutOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const primaryExitSpaceLeftM = primaryTrackOutOffsetM !== undefined
      ? Number((exitHalfWidthM - Math.abs(primaryTrackOutOffsetM)).toFixed(1))
      : undefined;
    const baselineExitSpaceLeftM = baselineTrackOutOffsetM !== undefined
      ? Number((exitHalfWidthM - Math.abs(baselineTrackOutOffsetM)).toFixed(1))
      : undefined;
    const exitSpaceDeltaM = primaryExitSpaceLeftM !== undefined && baselineExitSpaceLeftM !== undefined
      ? Number((primaryExitSpaceLeftM - baselineExitSpaceLeftM).toFixed(1))
      : null;

    const primaryTrackUsage: CornerTrackUsage = {
      entryOffsetM: primaryAtEntry.lateralOffsetM,
      entrySpaceLeftM: primaryEntrySpaceLeftM,
      apexMarginM: primaryAtMin.lateralOffsetM,
      apexSpaceLeftM: primaryApexSpaceLeftM,
      exitWidthM: primaryAtExit.lateralOffsetM,
      exitTrackOutOffsetM: primaryTrackOutOffsetM,
      exitSpaceLeftM: primaryExitSpaceLeftM,
      totalSweepM: primaryAtEntry.lateralOffsetM !== undefined && primaryAtExit.lateralOffsetM !== undefined && primaryAtMin.lateralOffsetM !== undefined
        ? Number((Math.abs(primaryAtEntry.lateralOffsetM - primaryAtMin.lateralOffsetM) + Math.abs(primaryAtExit.lateralOffsetM - primaryAtMin.lateralOffsetM)).toFixed(1))
        : chordSagittaM,
    };

    const baselineTrackUsage: CornerTrackUsage = {
      entryOffsetM: baselineAtEntry.lateralOffsetM,
      entrySpaceLeftM: baselineEntrySpaceLeftM,
      apexMarginM: baselineAtMin.lateralOffsetM,
      apexSpaceLeftM: baselineApexSpaceLeftM,
      exitWidthM: baselineAtExit.lateralOffsetM,
      exitTrackOutOffsetM: baselineTrackOutOffsetM,
      exitSpaceLeftM: baselineExitSpaceLeftM,
      totalSweepM: baselineAtEntry.lateralOffsetM !== undefined && baselineAtExit.lateralOffsetM !== undefined && baselineAtMin.lateralOffsetM !== undefined
        ? Number((Math.abs(baselineAtEntry.lateralOffsetM - baselineAtMin.lateralOffsetM) + Math.abs(baselineAtExit.lateralOffsetM - baselineAtMin.lateralOffsetM)).toFixed(1))
        : bchordSagittaM,
    };

    const timeDeltaSec = Number((deltaAt(exit.distM) - deltaAt(entry.distM)).toFixed(3));

    const typeSpecificDetails: CornerTypeSpecificDetails = {
      steeringScrubDeg: maxUndersteerDeg > 0 ? Number(maxUndersteerDeg.toFixed(1)) : undefined,
      exitWheelSlipActive: exitWheelSlipActive ? true : undefined,
    };

    return {
      type: 'corner',
      segmentIndex: 0,
      cornerNumber,
      entryDistM: Math.round(entry.distM),
      minDistM: Math.round(min.distM),
      exitDistM: Math.round(exit.distM),
      lengthM,
      primaryTimeSec: Number((primaryAtExit.timeSec - primaryAtEntry.timeSec).toFixed(3)),
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
      primaryInitialThrottleDistM: initialPrimaryThrottleDistM,
      baselineInitialThrottleDistM: initialBaselineThrottleDistM,
      initialThrottleDeltaM: initialPrimaryThrottleDistM !== null && initialBaselineThrottleDistM !== null
        ? Math.round(initialPrimaryThrottleDistM - initialBaselineThrottleDistM)
        : null,
      timeDeltaSec,
      turnDirection,
      cornerAngleDeg,
      effectiveRadiusM,
      apexRatioPct,
      primaryTurnInDistM,
      baselineTurnInDistM,
      turnInDeltaM,
      straightBrakingDistM,
      trailBrakeDistM: roundedTrailBrakeDistM,
      trailBrakeDurationSec: roundedTrailBrakeDurationSec,
      primaryPeakYawRateDeg: Number(primaryPeakYawRateDeg.toFixed(1)),
      baselinePeakYawRateDeg: Number(baselinePeakYawRateDeg.toFixed(1)),
      peakYawRateDeltaDeg: Number((primaryPeakYawRateDeg - baselinePeakYawRateDeg).toFixed(1)),
      primaryRotationAtThrottlePct,
      baselineRotationAtThrottlePct,
      rotationAtThrottleDeltaPct,
      primaryTrackUsage,
      baselineTrackUsage,
      entrySpaceDeltaM,
      apexSpaceDeltaM,
      exitSpaceDeltaM,
      phaseTiming,
      typeSpecificDetails,
    };
  };

  const segments: LapSegmentComparison[] = [];
  let cornerNumber = 0;
  let prevBoundaryDist = startDistM;

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

