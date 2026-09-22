import { ReplayTrajectoryPoint } from '../../server/core/types';
import {
  InterpolatedPoint,
  interpolatePointAtDistance,
  getTrajectoryDistances,
  getMonotonicStations,
} from './replayComparison.js';
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
  apexMarginM?: number;
  exitWidthM?: number;
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

function getHeadingAtDistance(points: ReplayTrajectoryPoint[], dists: number[], d: number, spanM = 4): number {
  if (points.length < 2 || dists.length < 2) return 0;
  const maxD = dists[dists.length - 1] || d;
  const pPrev = interpolatePointAtDistance(points, dists, Math.max(0, d - spanM));
  const pNext = interpolatePointAtDistance(points, dists, Math.min(maxD, d + spanM));
  const dx = pNext.x - pPrev.x;
  const dz = pNext.z - pPrev.z;
  if (Math.hypot(dx, dz) < 0.05) return 0;
  return Math.atan2(dx, dz);
}

function interpolateCoordinateAtDistance(dists: number[], coordinates: number[], targetDistM: number): number {
  if (dists.length === 0 || coordinates.length === 0) return targetDistM;
  if (targetDistM <= dists[0]) return coordinates[0];
  const lastIndex = dists.length - 1;
  if (targetDistM >= dists[lastIndex]) return coordinates[lastIndex];

  for (let index = 1; index < dists.length; index++) {
    if (dists[index] < targetDistM) continue;
    const distanceSpan = dists[index] - dists[index - 1];
    if (distanceSpan <= 0) return coordinates[index];
    const ratio = (targetDistM - dists[index - 1]) / distanceSpan;
    return coordinates[index - 1] + ratio * (coordinates[index] - coordinates[index - 1]);
  }

  return coordinates[lastIndex];
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
  minProminenceKmh = 6,
  trackLengthM?: number
): LapSegmentComparison[] {
  if (!primaryPoints?.length || !baselinePoints?.length) return [];

  // Both laps are re-zeroed to the SAME physical start/finish crossing (not just each
  // recording's own point[0]) - critical so brake/throttle distances below are comparable.
  const primaryDists = getTrajectoryDistances(primaryPoints, trackLengthM);
  const baselineDists = getTrajectoryDistances(baselinePoints, trackLengthM);
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

  const canMatchByStation =
    Boolean(trackLengthM && trackLengthM > 0) &&
    primaryPoints[0]?.stationM !== undefined &&
    baselinePoints[0]?.stationM !== undefined;

  let primaryRefCoords: number[];
  let baselineRefCoords: number[];

  if (canMatchByStation && trackLengthM) {
    primaryRefCoords = getMonotonicStations(primaryPoints, trackLengthM);
    baselineRefCoords = getMonotonicStations(baselinePoints, trackLengthM);
  } else {
    primaryRefCoords = primaryDists;
    baselineRefCoords = baselineDists;
  }

  const deltaAt = (stationOrDistM: number): number => {
    const p = interpolatePointAtDistance(primaryPoints, primaryRefCoords, stationOrDistM);
    const b = interpolatePointAtDistance(baselinePoints, baselineRefCoords, stationOrDistM);
    return p.timeSec - b.timeSec;
  };

  const buildStraight = (
    fromDist: number,
    toDist: number,
    fromCoord: number,
    toCoord: number
  ): StraightSegmentComparison | null => {
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
      timeDeltaSec: Number((deltaAt(toCoord) - deltaAt(fromCoord)).toFixed(3)),
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

    const coordinateAtDistance = (distanceM: number): number =>
      canMatchByStation
        ? interpolateCoordinateAtDistance(primaryDists, primaryRefCoords, distanceM)
        : distanceM;
    const phaseDelta = (startDistM: number, endDistM: number): number =>
      Number((deltaAt(coordinateAtDistance(endDistM)) - deltaAt(coordinateAtDistance(startDistM))).toFixed(3));
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
      15
    ) ?? primaryThrottleOnDistM;

    const initialBaselineThrottleDistM = findThresholdCrossingDistM(
      baselinePoints,
      baselineDists,
      min.distM,
      exit.distM,
      p => p.throttle,
      15
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

    const primaryTrackUsage: CornerTrackUsage = {
      entryOffsetM: primaryAtEntry.lateralOffsetM,
      apexMarginM: primaryAtMin.lateralOffsetM,
      exitWidthM: primaryAtExit.lateralOffsetM,
      totalSweepM: primaryAtEntry.lateralOffsetM !== undefined && primaryAtExit.lateralOffsetM !== undefined && primaryAtMin.lateralOffsetM !== undefined
        ? Number((Math.abs(primaryAtEntry.lateralOffsetM - primaryAtMin.lateralOffsetM) + Math.abs(primaryAtExit.lateralOffsetM - primaryAtMin.lateralOffsetM)).toFixed(1))
        : chordSagittaM,
    };

    const baselineTrackUsage: CornerTrackUsage = {
      entryOffsetM: baselineAtEntry.lateralOffsetM,
      apexMarginM: baselineAtMin.lateralOffsetM,
      exitWidthM: baselineAtExit.lateralOffsetM,
      totalSweepM: baselineAtEntry.lateralOffsetM !== undefined && baselineAtExit.lateralOffsetM !== undefined && baselineAtMin.lateralOffsetM !== undefined
        ? Number((Math.abs(baselineAtEntry.lateralOffsetM - baselineAtMin.lateralOffsetM) + Math.abs(baselineAtExit.lateralOffsetM - baselineAtMin.lateralOffsetM)).toFixed(1))
        : bchordSagittaM,
    };

    const entryCoord = canMatchByStation && primaryRefCoords[entry.index] !== undefined
      ? primaryRefCoords[entry.index]
      : entry.distM;
    const exitCoord = canMatchByStation && primaryRefCoords[exit.index] !== undefined
      ? primaryRefCoords[exit.index]
      : exit.distM;
    const timeDeltaSec = Number((deltaAt(exitCoord) - deltaAt(entryCoord)).toFixed(3));

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
      phaseTiming,
      typeSpecificDetails,
    };
  };

  const segments: LapSegmentComparison[] = [];
  let cornerNumber = 0;
  let prevBoundaryDist = startDistM;
  let prevBoundaryCoord = canMatchByStation && primaryRefCoords[0] !== undefined ? primaryRefCoords[0] : startDistM;

  for (let i = 1; i < turningPoints.length - 1; i++) {
    const min = turningPoints[i];
    const entry = turningPoints[i - 1];
    const exit = turningPoints[i + 1];
    if (min.type !== 'min' || entry.type !== 'max' || exit.type !== 'max') continue;

    const entryCoord = canMatchByStation && primaryRefCoords[entry.index] !== undefined
      ? primaryRefCoords[entry.index]
      : entry.distM;
    const exitCoord = canMatchByStation && primaryRefCoords[exit.index] !== undefined
      ? primaryRefCoords[exit.index]
      : exit.distM;

    const straight = buildStraight(prevBoundaryDist, entry.distM, prevBoundaryCoord, entryCoord);
    if (straight) segments.push(straight);

    cornerNumber++;
    segments.push(buildCorner(cornerNumber, entry, min, exit));
    prevBoundaryDist = exit.distM;
    prevBoundaryCoord = exitCoord;
  }

  const trailingCoord = canMatchByStation && primaryRefCoords[primaryRefCoords.length - 1] !== undefined
    ? primaryRefCoords[primaryRefCoords.length - 1]
    : totalDistM;
  const trailing = buildStraight(prevBoundaryDist, totalDistM, prevBoundaryCoord, trailingCoord);
  if (trailing) segments.push(trailing);

  segments.forEach((s, idx) => { s.segmentIndex = idx; });
  return segments;
}

export interface LapMetricSample {
  lapNumber: number;
  value: number;
}

export interface ConsistencyMetricStat {
  count: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  consistencyPct: number;
  // Raw per-lap values (sorted by lap number) - lets the UI drill down into exactly how a
  // metric varied lap to lap, not just its aggregate spread.
  samples: LapMetricSample[];
}

function computeMetricStat(samples: LapMetricSample[]): ConsistencyMetricStat | null {
  if (samples.length < 2) return null;
  const values = samples.map(s => s.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg,
    stdDev,
    consistencyPct: avg !== 0 ? (stdDev / Math.abs(avg)) * 100 : 0,
    samples: [...samples].sort((a, b) => a.lapNumber - b.lapNumber),
  };
}

function pushTo(map: Map<number, LapMetricSample[]>, key: number, lapNumber: number, value: number): void {
  const list = map.get(key);
  if (list) list.push({ lapNumber, value });
  else map.set(key, [{ lapNumber, value }]);
}

function findSampleValue(samples: LapMetricSample[], lapNumber: number): number | undefined {
  return samples.find(s => s.lapNumber === lapNumber)?.value;
}

/**
 * Overrides a metric's Best/Worst to be its value on the lap that had the best/worst CORNER
 * TIME (rather than that metric's own independent extremes), so Best/Worst across a corner's
 * whole row set - Brake Pt, Throttle Pt, Entry, Apex, Exit - all describe the same two laps:
 * the driver's best and worst pass through that corner.
 */
function applyTimeRelativeBestWorst(
  stat: ConsistencyMetricStat | null,
  bestLapNumber: number,
  worstLapNumber: number
): ConsistencyMetricStat | null {
  if (!stat) return null;
  const bestValue = findSampleValue(stat.samples, bestLapNumber);
  const worstValue = findSampleValue(stat.samples, worstLapNumber);
  return {
    ...stat,
    min: bestValue ?? stat.min,
    max: worstValue ?? stat.max,
  };
}

function bestAndWorstTimeLaps(timeStat: ConsistencyMetricStat): { bestLapNumber: number; worstLapNumber: number } {
  let best = timeStat.samples[0];
  let worst = timeStat.samples[0];
  for (const sample of timeStat.samples) {
    if (sample.value < best.value) best = sample;
    if (sample.value > worst.value) worst = sample;
  }
  return { bestLapNumber: best.lapNumber, worstLapNumber: worst.lapNumber };
}

export interface CornerConsistencyStat {
  cornerNumber: number;
  lapsSampled: number;
  // Apex distance (m) along the reference lap's own path - useful for plotting this corner's
  // location on that lap's track map.
  minDistM: number;
  time: ConsistencyMetricStat;
  // Meters before the apex where braking began (see computeCornerConsistencyStats).
  brakingDistM: ConsistencyMetricStat | null;
  // Meters after the apex where throttle was reapplied.
  throttleOnDistM: ConsistencyMetricStat | null;
  entrySpeedKmh: ConsistencyMetricStat | null;
  apexSpeedKmh: ConsistencyMetricStat | null;
  exitSpeedKmh: ConsistencyMetricStat | null;
  turnInDistM?: ConsistencyMetricStat | null;
  rotationAtThrottlePct?: ConsistencyMetricStat | null;
}

export interface CornerConsistencyLapInput {
  lapNumber: number;
  points: ReplayTrajectoryPoint[];
}

/**
 * Measures how repeatably each corner is driven across multiple laps of the same replay.
 * Corner boundaries (entry/apex/exit) are detected once from a fixed reference lap (compared
 * against itself), so every lap is timed and sampled at those same reference distances -
 * each corner's time uses the same entry->exit window as computeLapSegmentComparisons' "vs
 * Baseline" corner table, so the two always agree on what that corner's time means. Brake/
 * throttle onset points are still reported relative to the apex (see below) for readability.
 */
export function computeCornerConsistencyStats(
  laps: CornerConsistencyLapInput[],
  referencePoints: ReplayTrajectoryPoint[],
  trackLengthM?: number
): CornerConsistencyStat[] {
  if (!referencePoints?.length || !laps?.length) return [];

  const canonicalCorners = computeLapSegmentComparisons(referencePoints, referencePoints, 6, trackLengthM)
    .filter((s): s is CornerSegmentComparison => s.type === 'corner')
    .sort((a, b) => a.minDistM - b.minDistM);
  if (canonicalCorners.length === 0) return [];

  const timesByCorner = new Map<number, LapMetricSample[]>();
  const brakingByCorner = new Map<number, LapMetricSample[]>();
  const throttleByCorner = new Map<number, LapMetricSample[]>();
  const entrySpeedByCorner = new Map<number, LapMetricSample[]>();
  const apexSpeedByCorner = new Map<number, LapMetricSample[]>();
  const exitSpeedByCorner = new Map<number, LapMetricSample[]>();
  const turnInByCorner = new Map<number, LapMetricSample[]>();
  const rotationByCorner = new Map<number, LapMetricSample[]>();

  for (const lap of laps) {
    if (!lap.points?.length) continue;
    const lapDists = getTrajectoryDistances(lap.points, trackLengthM);

    for (const corner of canonicalCorners) {
      // Same entry->exit window computeLapSegmentComparisons uses for the "vs Baseline" corner
      // table, so a corner's time here always agrees with what that table calls its Δ Time -
      // apex-to-apex would measure a different (overlapping but distinct) stretch of track.
      const entryT = interpolatePointAtDistance(lap.points, lapDists, corner.entryDistM).timeSec;
      const exitT = interpolatePointAtDistance(lap.points, lapDists, corner.exitDistM).timeSec;
      const cornerTimeSec = exitT - entryT;
      if (isFinite(cornerTimeSec) && cornerTimeSec > 0) pushTo(timesByCorner, corner.cornerNumber, lap.lapNumber, cornerTimeSec);

      pushTo(entrySpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.entryDistM).speedKmh);
      pushTo(apexSpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.minDistM).speedKmh);
      pushTo(exitSpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.exitDistM).speedKmh);

      const brakingDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.entryDistM, corner.minDistM, p => p.brake, BRAKE_ON_THRESHOLD_PCT);
      // Reported relative to the apex (meters BEFORE the minimum-speed point), not as an
      // absolute lap distance, so the number reads the same regardless of where on the track
      // this corner sits.
      if (brakingDistM !== null) pushTo(brakingByCorner, corner.cornerNumber, lap.lapNumber, corner.minDistM - brakingDistM);
      const throttleOnDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.minDistM, corner.exitDistM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT);
      // Reported relative to the apex too (meters AFTER the minimum-speed point).
      if (throttleOnDistM !== null) pushTo(throttleByCorner, corner.cornerNumber, lap.lapNumber, throttleOnDistM - corner.minDistM);

      const turnInDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.entryDistM, corner.minDistM, p => Math.abs(p.steerYaw || 0), 5);
      if (turnInDistM !== null) pushTo(turnInByCorner, corner.cornerNumber, lap.lapNumber, corner.minDistM - turnInDistM);

      if (corner.cornerAngleDeg && corner.cornerAngleDeg > 5) {
        const initialThrDist = findThresholdCrossingDistM(lap.points, lapDists, corner.minDistM, corner.exitDistM, p => p.throttle, 15) ?? throttleOnDistM;
        if (initialThrDist !== null) {
          const hEntry = getHeadingAtDistance(lap.points, lapDists, corner.entryDistM);
          const hThr = getHeadingAtDistance(lap.points, lapDists, initialThrDist);
          const rotRad = Math.abs(unwrapAngle(hThr - hEntry));
          const totalRad = (corner.cornerAngleDeg * Math.PI) / 180;
          const rotPct = Math.min(100, Math.max(0, Math.round((rotRad / totalRad) * 100)));
          pushTo(rotationByCorner, corner.cornerNumber, lap.lapNumber, rotPct);
        }
      }
    }
  }

  const stats: CornerConsistencyStat[] = [];
  for (const corner of canonicalCorners) {
    const timeStat = computeMetricStat(timesByCorner.get(corner.cornerNumber) || []);
    if (!timeStat) continue;
    const { bestLapNumber, worstLapNumber } = bestAndWorstTimeLaps(timeStat);
    stats.push({
      cornerNumber: corner.cornerNumber,
      lapsSampled: timeStat.count,
      minDistM: corner.minDistM,
      time: timeStat,
      brakingDistM: applyTimeRelativeBestWorst(computeMetricStat(brakingByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      throttleOnDistM: applyTimeRelativeBestWorst(computeMetricStat(throttleByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      entrySpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(entrySpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      apexSpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(apexSpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      exitSpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(exitSpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      turnInDistM: applyTimeRelativeBestWorst(computeMetricStat(turnInByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      rotationAtThrottlePct: applyTimeRelativeBestWorst(computeMetricStat(rotationByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
    });
  }
  return stats;
}

/**
 * Recomputes each corner's metric stats after dropping specific outlier laps, reusing the
 * already-fetched per-lap samples so no re-fetch/re-timing pass over telemetry is needed.
 * A corner is dropped entirely if fewer than 2 laps remain for its time metric.
 */
export function filterCornerConsistencyStats(
  stats: CornerConsistencyStat[],
  excludedLapNumbers: Set<number>
): CornerConsistencyStat[] {
  if (excludedLapNumbers.size === 0) return stats;

  const keep = (samples: LapMetricSample[]) => samples.filter(s => !excludedLapNumbers.has(s.lapNumber));

  const filtered: CornerConsistencyStat[] = [];
  for (const corner of stats) {
    const timeStat = computeMetricStat(keep(corner.time.samples));
    if (!timeStat) continue;
    const { bestLapNumber, worstLapNumber } = bestAndWorstTimeLaps(timeStat);
    filtered.push({
      cornerNumber: corner.cornerNumber,
      lapsSampled: timeStat.count,
      minDistM: corner.minDistM,
      time: timeStat,
      brakingDistM: applyTimeRelativeBestWorst(corner.brakingDistM ? computeMetricStat(keep(corner.brakingDistM.samples)) : null, bestLapNumber, worstLapNumber),
      throttleOnDistM: applyTimeRelativeBestWorst(corner.throttleOnDistM ? computeMetricStat(keep(corner.throttleOnDistM.samples)) : null, bestLapNumber, worstLapNumber),
      entrySpeedKmh: applyTimeRelativeBestWorst(corner.entrySpeedKmh ? computeMetricStat(keep(corner.entrySpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      apexSpeedKmh: applyTimeRelativeBestWorst(corner.apexSpeedKmh ? computeMetricStat(keep(corner.apexSpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      exitSpeedKmh: applyTimeRelativeBestWorst(corner.exitSpeedKmh ? computeMetricStat(keep(corner.exitSpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      turnInDistM: applyTimeRelativeBestWorst(corner.turnInDistM ? computeMetricStat(keep(corner.turnInDistM.samples)) : null, bestLapNumber, worstLapNumber),
      rotationAtThrottlePct: applyTimeRelativeBestWorst(corner.rotationAtThrottlePct ? computeMetricStat(keep(corner.rotationAtThrottlePct.samples)) : null, bestLapNumber, worstLapNumber),
    });
  }
  return filtered;
}

