import { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import {
  InterpolatedPoint,
  computeLapComparisons,
  interpolatePointAtDistance,
} from '../replayComparison.js';
import {
  interpolateScalarAtDistance,
  getTrajectoryDistances,
  getDistancesInReferenceFrame,
} from '../lapAlignment.js';
import { unwrapAngle } from '../computedTelemetry.js';
import type {
  CornerPhaseTiming, CornerSegmentComparison, CornerTrackUsage, CornerTypeSpecificDetails, LapSegmentComparison, StraightSegmentComparison,
} from './types.js';
import {
  BRAKE_ONSET_LOOKBACK_M, BRAKE_ON_THRESHOLD_PCT, MIN_STRAIGHT_LENGTH_M, SEGMENT_SCAN_STEP_M, STEER_REVERSAL_FRACTION,
  THROTTLE_ON_MIN_HOLD_SEC, THROTTLE_ON_THRESHOLD_PCT, computeMaxAbsSteer, findSpeedTurningPoints, findThresholdCrossingDistM,
  getHeadingAtDistance, maxSpeedInRangeKmh, throttleOnsetLookbackM, type SpeedTurningPoint,
} from './helpers.js';

type RoadEdge = 'leftRoadDistanceM' | 'rightRoadDistanceM';

/** Returns undefined for legacy trajectories with no geometry fields, and null for an
 * explicitly unavailable measurement. The caller may use the legacy nominal fallback only
 * for the former. */
function measuredEdgeDistanceAt(
  points: ReplayTrajectoryPoint[],
  distances: number[],
  targetM: number,
  edge: RoadEdge
): number | null | undefined {
  if (!points.some(point => point[edge] !== undefined)) return undefined;
  if (!points.length || points.length !== distances.length) return null;

  let upper = 0;
  while (upper < distances.length && distances[upper] < targetM) upper++;
  if (upper === 0) {
    const value = points[0][edge];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (upper >= distances.length) {
    const value = points[points.length - 1][edge];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  const lower = upper - 1;
  const first = points[lower][edge];
  const second = points[upper][edge];
  if (typeof first !== 'number' || typeof second !== 'number' || !Number.isFinite(first) || !Number.isFinite(second)) return null;
  const span = distances[upper] - distances[lower];
  if (span <= 0) return first;
  const fraction = Math.max(0, Math.min(1, (targetM - distances[lower]) / span));
  return first + fraction * (second - first);
}

function measuredEdgeSpaceOrLegacy(
  points: ReplayTrajectoryPoint[],
  distances: number[],
  targetM: number,
  edge: RoadEdge,
  legacySpace: number | undefined
): number | undefined {
  const measured = measuredEdgeDistanceAt(points, distances, targetM, edge);
  return measured === undefined ? legacySpace : measured ?? undefined;
}

function minimumMeasuredEdgeSpace(
  points: ReplayTrajectoryPoint[],
  distances: number[],
  startM: number,
  endM: number,
  edge: RoadEdge
): number | null | undefined {
  if (!points.some(point => point[edge] !== undefined)) return undefined;
  let minimum = Infinity;
  for (let d = startM; d <= endM; d += SEGMENT_SCAN_STEP_M) {
    const value = measuredEdgeDistanceAt(points, distances, d, edge);
    if (value === null || value === undefined) return null;
    minimum = Math.min(minimum, value);
  }
  const endValue = measuredEdgeDistanceAt(points, distances, endM, edge);
  if (endValue === null || endValue === undefined) return null;
  return Math.min(minimum, endValue);
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
  // delta channel shows (each lap timed from its own S/F crossing), so the segments add up to the lap delta and never disagree with the chart. The
  // trace has one value per primary sample, so it is read at primary-frame distances directly.
  const channelDeltas = computeLapComparisons(primaryPoints, baselinePoints, trackLengthM).map(c => c.deltaTimeSec);
  const deltaAt = (distM: number): number => interpolateScalarAtDistance(channelDeltas, primaryDists, distM);

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
    const primaryThrottleOnDistM = findThresholdCrossingDistM(primaryPoints, primaryDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT, throttleLookbackM, THROTTLE_ON_MIN_HOLD_SEC);
    const baselineThrottleOnDistM = findThresholdCrossingDistM(baselinePoints, baselineDists, min.distM, exit.distM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT, throttleLookbackM, THROTTLE_ON_MIN_HOLD_SEC);

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

    // Legacy rows did not retain measured edge distances. Keep their nominal-width estimate only
    // when the geometry annotations are absent; explicit null means this location is unknown.
    const nominalHalfWidthM = (nominalWidthM ?? 12.0) / 2;
    const legacyEntryHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtEntry.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryAtEntry.lateralOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const legacyEntrySpace = (point: InterpolatedPoint) => point.lateralOffsetM === undefined
      ? undefined
      : Number((legacyEntryHalfWidthM - Math.abs(point.lateralOffsetM)).toFixed(1));
    const outsideEdge: RoadEdge = turnDirection === 'right' ? 'leftRoadDistanceM' : 'rightRoadDistanceM';
    const insideEdge: RoadEdge = turnDirection === 'right' ? 'rightRoadDistanceM' : 'leftRoadDistanceM';
    const primaryEntrySpaceLeftM = measuredEdgeSpaceOrLegacy(
      primaryPoints, primaryDists, entry.distM, outsideEdge, legacyEntrySpace(primaryAtEntry)
    );
    const baselineEntrySpaceLeftM = measuredEdgeSpaceOrLegacy(
      baselinePoints, baselineDists, entry.distM, outsideEdge, legacyEntrySpace(baselineAtEntry)
    );
    const entrySpaceDeltaM = primaryEntrySpaceLeftM !== undefined && baselineEntrySpaceLeftM !== undefined
      ? Number((primaryEntrySpaceLeftM - baselineEntrySpaceLeftM).toFixed(1))
      : null;

    const legacyApexHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtMin.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryAtMin.lateralOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const legacyApexSpace = (point: InterpolatedPoint) => point.lateralOffsetM === undefined
      ? undefined
      : Number((legacyApexHalfWidthM - Math.abs(point.lateralOffsetM)).toFixed(1));
    const primaryApexSpaceLeftM = measuredEdgeSpaceOrLegacy(
      primaryPoints, primaryDists, min.distM, insideEdge, legacyApexSpace(primaryAtMin)
    );
    const baselineApexSpaceLeftM = measuredEdgeSpaceOrLegacy(
      baselinePoints, baselineDists, min.distM, insideEdge, legacyApexSpace(baselineAtMin)
    );
    const apexSpaceDeltaM = primaryApexSpaceLeftM !== undefined && baselineApexSpaceLeftM !== undefined
      ? Number((primaryApexSpaceLeftM - baselineApexSpaceLeftM).toFixed(1))
      : null;

    const legacyExitHalfWidthM = Math.max(
      nominalHalfWidthM,
      primaryAtExit.isOffTrack ? 0 : Number((Math.ceil(Math.abs(primaryTrackOutOffsetM ?? 0) * 2) / 2).toFixed(1))
    );
    const legacyExitSpace = (offset: number | undefined) => offset === undefined
      ? undefined
      : Number((legacyExitHalfWidthM - Math.abs(offset)).toFixed(1));
    const primaryMeasuredExit = minimumMeasuredEdgeSpace(
      primaryPoints, primaryDists, min.distM, exitScanEndM, outsideEdge
    );
    const baselineMeasuredExit = minimumMeasuredEdgeSpace(
      baselinePoints, baselineDists, min.distM, exitScanEndM, outsideEdge
    );
    const primaryExitSpaceLeftM = primaryMeasuredExit === undefined
      ? legacyExitSpace(primaryTrackOutOffsetM)
      : primaryMeasuredExit ?? undefined;
    const baselineExitSpaceLeftM = baselineMeasuredExit === undefined
      ? legacyExitSpace(baselineTrackOutOffsetM)
      : baselineMeasuredExit ?? undefined;
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


