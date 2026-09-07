import { ReplayTrajectoryPoint, ReplaySummary } from '../../server/types.js';
import { matchesTrack, matchesCarClass, getTrackAndLayout } from './paceCategory.js';

// Neutral (0) / reverse (-1) are clamped to 1 for chart/comparison display.
function resolveGearValue(p: ReplayTrajectoryPoint): number {
  return Math.min(7, Math.max(1, p.gear ?? 1));
}

export interface InterpolatedPoint {
  timeSec: number;
  speedKmh: number;
  throttle: number;
  brake: number;
  steerYaw: number;
  gear: number;
  x: number;
  y: number;
  z: number;
  tcActive?: boolean;
  absActive?: boolean;
}

export interface LapDeltaSummary {
  lapTimeDeltaSec: number;
  s1DeltaSec?: number;
  s2DeltaSec?: number;
  s3DeltaSec?: number;
  isFaster: boolean;
}

export interface PointComparison {
  primary: ReplayTrajectoryPoint;
  baseline: InterpolatedPoint;
  deltaTimeSec: number;
  deltaSpeedKmh: number;
  deltaThrottle: number;
  deltaBrake: number;
  deltaSteer: number;
}

/**
 * Finds the point index whose cumulative distance is closest to targetDist (binary search).
 * Useful for jumping the playback scrubber to a distance-based marker (e.g. a detected corner).
 */
export function findIndexAtDistance(cumDists: number[], targetDist: number): number {
  if (cumDists.length === 0) return 0;
  let low = 0;
  let high = cumDists.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cumDists[mid] < targetDist) low = mid + 1;
    else high = mid - 1;
  }
  const idx = Math.max(0, Math.min(cumDists.length - 1, low));
  if (idx > 0 && Math.abs(cumDists[idx - 1] - targetDist) < Math.abs(cumDists[idx] - targetDist)) return idx - 1;
  return idx;
}

/**
 * Computes cumulative distance in meters along the trajectory path,
 * filtering out teleport / pit-lane jump anomalies.
 */
export function computeCumulativeDistances(points: ReplayTrajectoryPoint[]): number[] {
  if (!points || points.length === 0) return [];
  const dists: number[] = [0];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const d = Math.hypot(cur.x - prev.x, cur.z - prev.z);
    dists.push(dists[i - 1] + (d < 60 ? d : 0));
  }

  return dists;
}

/**
 * Interpolates a telemetry point at a given distance along a trajectory.
 */
export function interpolatePointAtDistance(
  points: ReplayTrajectoryPoint[],
  cumDists: number[],
  targetDist: number
): InterpolatedPoint {
  if (points.length === 0) {
    return {
      timeSec: 0,
      speedKmh: 0,
      throttle: 0,
      brake: 0,
      steerYaw: 0,
      gear: 1,
      x: 0,
      y: 0,
      z: 0,
    };
  }

  const startTime0 = points[0].timeSec || 0;

  if (points.length === 1 || targetDist <= cumDists[0]) {
    const p = points[0];
    const spd = p.speedKmh || 0;
    return {
      timeSec: 0,
      speedKmh: spd,
      throttle: p.throttle || 0,
      brake: p.brake || 0,
      steerYaw: p.steerYaw || 0,
      gear: resolveGearValue(p),
      x: p.x,
      y: p.y,
      z: p.z,
      tcActive: p.tcActive,
      absActive: p.absActive,
    };
  }

  const maxDist = cumDists[cumDists.length - 1];
  if (targetDist >= maxDist) {
    const p = points[points.length - 1];
    const spd = p.speedKmh || 0;
    return {
      timeSec: Math.max(0, (p.timeSec || 0) - startTime0),
      speedKmh: spd,
      throttle: p.throttle || 0,
      brake: p.brake || 0,
      steerYaw: p.steerYaw || 0,
      gear: resolveGearValue(p),
      x: p.x,
      y: p.y,
      z: p.z,
      tcActive: p.tcActive,
      absActive: p.absActive,
    };
  }

  // Binary search for segment
  let low = 0;
  let high = cumDists.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cumDists[mid] < targetDist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idx0 = Math.max(0, low - 1);
  const idx1 = Math.min(points.length - 1, low);

  if (idx0 === idx1) {
    const p = points[idx0];
    const spd = p.speedKmh || 0;
    return {
      timeSec: Math.max(0, (p.timeSec || 0) - startTime0),
      speedKmh: spd,
      throttle: p.throttle || 0,
      brake: p.brake || 0,
      steerYaw: p.steerYaw || 0,
      gear: resolveGearValue(p),
      x: p.x,
      y: p.y,
      z: p.z,
      tcActive: p.tcActive,
      absActive: p.absActive,
    };
  }

  const span = cumDists[idx1] - cumDists[idx0];
  const t = span > 0 ? (targetDist - cumDists[idx0]) / span : 0;
  const p0 = points[idx0];
  const p1 = points[idx1];

  const spd = (p0.speedKmh || 0) + t * ((p1.speedKmh || 0) - (p0.speedKmh || 0));
  const curLapTime0 = (p0.timeSec || 0) - startTime0;
  const curLapTime1 = (p1.timeSec || 0) - startTime0;
  const relativeTime = curLapTime0 + t * (curLapTime1 - curLapTime0);

  return {
    timeSec: relativeTime,
    speedKmh: Math.round(spd),
    throttle: Math.round((p0.throttle || 0) + t * ((p1.throttle || 0) - (p0.throttle || 0))),
    brake: Math.round((p0.brake || 0) + t * ((p1.brake || 0) - (p0.brake || 0))),
    steerYaw: Number(((p0.steerYaw || 0) + t * ((p1.steerYaw || 0) - (p0.steerYaw || 0))).toFixed(1)),
    gear: resolveGearValue(t < 0.5 ? p0 : p1),
    x: p0.x + t * (p1.x - p0.x),
    y: p0.y + t * (p1.y - p0.y),
    z: p0.z + t * (p1.z - p0.z),
    tcActive: p0.tcActive || p1.tcActive,
    absActive: p0.absActive || p1.absActive,
  };
}

/**
 * Computes comparative telemetry points for the primary lap against a baseline lap,
 * normalized along the distance dimension of the lap (0% to 100%).
 */
export function computeLapComparisons(
  primaryPoints: ReplayTrajectoryPoint[],
  baselinePoints: ReplayTrajectoryPoint[]
): PointComparison[] {
  if (!primaryPoints || primaryPoints.length === 0 || !baselinePoints || baselinePoints.length === 0) {
    return [];
  }

  const primaryDists = computeCumulativeDistances(primaryPoints);
  const baselineDists = computeCumulativeDistances(baselinePoints);

  const totalPrimaryDist = Math.max(1, primaryDists[primaryDists.length - 1]);
  const totalBaselineDist = Math.max(1, baselineDists[baselineDists.length - 1]);

  const n = primaryPoints.length;
  const primaryStartT = primaryPoints[0].timeSec || 0;
  const primaryTotalLapTime = Math.max(0, (primaryPoints[n - 1].timeSec || 0) - primaryStartT);

  const baselineStartT = baselinePoints[0].timeSec || 0;
  const baselineTotalLapTime = Math.max(0, (baselinePoints[baselinePoints.length - 1].timeSec || 0) - baselineStartT);
  const finishLineDelta = primaryTotalLapTime - baselineTotalLapTime;

  return primaryPoints.map((p, i) => {
    const fraction = primaryDists[i] / totalPrimaryDist;
    const targetBaselineDist = fraction * totalBaselineDist;
    const basePoint = interpolatePointAtDistance(baselinePoints, baselineDists, targetBaselineDist);

    const primaryRelativeT = Math.max(0, (p.timeSec || 0) - primaryStartT);

    let deltaTimeSec: number;
    if (i === 0) {
      // Start line boundary: elapsed time is identically 0 for both laps
      deltaTimeSec = 0;
    } else if (i === n - 1) {
      // Finish line boundary: exact difference in total lap times
      deltaTimeSec = Number(finishLineDelta.toFixed(3));
    } else {
      const rawDelta = primaryRelativeT - basePoint.timeSec;
      deltaTimeSec = isNaN(rawDelta) || !isFinite(rawDelta) ? 0 : Number(rawDelta.toFixed(3));
    }

    const deltaSpeedKmh = (p.speedKmh || 0) - basePoint.speedKmh;
    const deltaThrottle = (p.throttle || 0) - basePoint.throttle;
    const deltaBrake = (p.brake || 0) - basePoint.brake;
    const deltaSteer = (p.steerYaw || 0) - basePoint.steerYaw;

    return {
      primary: p,
      baseline: basePoint,
      deltaTimeSec,
      deltaSpeedKmh,
      deltaThrottle,
      deltaBrake,
      deltaSteer,
    };
  });
}

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
}

export type LapSegmentComparison = CornerSegmentComparison | StraightSegmentComparison;

interface SpeedTurningPoint {
  index: number;
  distM: number;
  type: 'max' | 'min';
}

/**
 * Extracts alternating local speed maxima/minima from a speed-vs-distance trace, requiring
 * each swing to exceed `minProminenceKmh` before it counts, to reject telemetry noise.
 */
function findSpeedTurningPoints(points: ReplayTrajectoryPoint[], dists: number[], minProminenceKmh: number): SpeedTurningPoint[] {
  if (points.length < 3) return [];
  const turningPoints: SpeedTurningPoint[] = [];
  let direction: 'up' | 'down' | null = null;
  let extremeIdx = 0;
  let extremeVal = points[0].speedKmh || 0;

  for (let i = 1; i < points.length; i++) {
    const v = points[i].speedKmh || 0;
    if (direction === null) {
      if (v > extremeVal) direction = 'up';
      else if (v < extremeVal) direction = 'down';
      continue;
    }
    if (direction === 'up') {
      if (v >= extremeVal) {
        extremeVal = v;
        extremeIdx = i;
      } else if (extremeVal - v >= minProminenceKmh) {
        turningPoints.push({ index: extremeIdx, distM: dists[extremeIdx], type: 'max' });
        direction = 'down';
        extremeVal = v;
        extremeIdx = i;
      }
    } else {
      if (v <= extremeVal) {
        extremeVal = v;
        extremeIdx = i;
      } else if (v - extremeVal >= minProminenceKmh) {
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
 */
export function computeLapSegmentComparisons(
  primaryPoints: ReplayTrajectoryPoint[],
  baselinePoints: ReplayTrajectoryPoint[],
  minProminenceKmh = 10
): LapSegmentComparison[] {
  if (!primaryPoints?.length || !baselinePoints?.length) return [];

  const primaryDists = computeCumulativeDistances(primaryPoints);
  const baselineDists = computeCumulativeDistances(baselinePoints);
  const turningPoints = findSpeedTurningPoints(baselinePoints, baselineDists, minProminenceKmh);
  const totalDistM = baselineDists[baselineDists.length - 1] || 0;

  const deltaAt = (distM: number): number => {
    const p = interpolatePointAtDistance(primaryPoints, primaryDists, distM);
    const b = interpolatePointAtDistance(baselinePoints, baselineDists, distM);
    return p.timeSec - b.timeSec;
  };

  const buildStraight = (fromDist: number, toDist: number): StraightSegmentComparison | null => {
    if (toDist - fromDist < MIN_STRAIGHT_LENGTH_M) return null;
    const primaryTop = maxSpeedInRangeKmh(primaryPoints, primaryDists, fromDist, toDist);
    const baselineTop = maxSpeedInRangeKmh(baselinePoints, baselineDists, fromDist, toDist);
    return {
      type: 'straight',
      segmentIndex: 0,
      entryDistM: Math.round(fromDist),
      exitDistM: Math.round(toDist),
      lengthM: Math.round(toDist - fromDist),
      primaryTopSpeedKmh: Math.round(primaryTop),
      baselineTopSpeedKmh: Math.round(baselineTop),
      topSpeedDeltaKmh: Math.round(primaryTop - baselineTop),
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

/**
 * Filters replays sharing the same track and vehicle class for cross-session lap comparisons.
 */
export function filterCompatibleReplays(
  allReplays: ReplaySummary[],
  currentTrackName?: string,
  currentCarClass?: string,
  excludeReplayName?: string
): ReplaySummary[] {
  if (!allReplays || allReplays.length === 0 || !currentTrackName) {
    return [];
  }

  const normTarget = currentTrackName.toLowerCase().replace(/[^a-z0-9]/g, '');

  return allReplays.filter(r => {
    if (excludeReplayName && r.name === excludeReplayName) return false;
    if (!r.trackName) return false;

    // Track matching rule
    let isTrackMatch = matchesTrack(r.trackName, currentTrackName, '');
    if (!isTrackMatch) {
      const qInfo = getTrackAndLayout(r.trackName, '');
      const sInfo = getTrackAndLayout(currentTrackName, '');
      if (!qInfo.isKnown && !sInfo.isKnown) {
        const normTrack = r.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
        isTrackMatch = normTrack.includes(normTarget) || normTarget.includes(normTrack);
      }
    }

    if (!isTrackMatch) return false;

    // Vehicle class rule (if vehicle class specified)
    if (currentCarClass && currentCarClass !== 'All') {
      const isClassMatch =
        (r.carClass || r.carModel)
          ? matchesCarClass(r.carClass || '', r.carModel || '', currentCarClass)
          : matchesCarClass(r.eventTitle || '', '', currentCarClass);
      if (!isClassMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Maps vehicle model or vehicle ID string to standardized LMU car class (LMGT3, LMH, LMP2, LMP2elms, GTE, LMP3).
 */
export function mapVehicleIdToClass(vehicleId?: string, carModel?: string): string {
  const combined = `${vehicleId || ''} ${carModel || ''}`.toUpperCase();

  // GTE
  if (
    combined.includes('GTE') ||
    combined.includes('DSTATI') ||
    combined.includes('KESSEL') ||
    combined.includes('RSR') ||
    combined.includes('REXY') ||
    combined.includes('488')
  ) {
    return 'GTE';
  }

  // GT3 / LMGT3
  if (
    combined.includes('GT3') ||
    combined.includes('AFCO') ||
    combined.includes('296') ||
    combined.includes('WRT') ||
    combined.includes('M4') ||
    combined.includes('MUSTANG') ||
    combined.includes('PROT') ||
    combined.includes('VANTAGE') ||
    combined.includes('MANT') ||
    combined.includes('911') ||
    combined.includes('GARA') ||
    combined.includes('720S') ||
    combined.includes('GCHAL') ||
    combined.includes('HURACAN') ||
    combined.includes('IRON') ||
    combined.includes('CORVETTE') ||
    combined.includes('TFSP') ||
    combined.includes('LEXUS') ||
    combined.includes('AKKO') ||
    combined.includes('AMG')
  ) {
    return 'LMGT3';
  }

  // Hypercar / LMH / LMDh
  if (
    combined.includes('499P') ||
    combined.includes('963') ||
    combined.includes('CADILLAC') ||
    combined.includes('CADIL') ||
    combined.includes('V-SERIES') ||
    combined.includes('VLMDH') ||
    combined.includes('WTR') ||
    combined.includes('TOYOTA') ||
    combined.includes('GR010') ||
    combined.includes('TR010') ||
    combined.includes('PEUGEOT') ||
    combined.includes('PEUG') ||
    combined.includes('9X8') ||
    combined.includes('ALPINE') ||
    combined.includes('ALPI') ||
    combined.includes('A424') ||
    combined.includes('SC63') ||
    combined.includes('ISOTTA') ||
    combined.includes('M HYBRID') ||
    combined.includes('BMW_HY') ||
    combined.includes('BMWMH') ||
    combined.includes('VALKYRIE') ||
    combined.includes('THO7') ||
    combined.includes('007_') ||
    combined.includes('GENESIS') ||
    combined.includes('GENE') ||
    combined.includes('GMR001') ||
    combined.includes('HYPER') ||
    combined.includes('LMH') ||
    combined.includes('LMDH')
  ) {
    return 'LMH';
  }

  // LMP3
  if (
    combined.includes('LMP3') ||
    combined.includes('GINETTA') ||
    combined.includes('G61') ||
    combined.includes('DUQUEINE') ||
    combined.includes('D09') ||
    combined.includes('D08') ||
    combined.includes('LIGIER') ||
    combined.includes('JSP') ||
    combined.includes('ADESS') ||
    combined.includes('AD25')
  ) {
    return 'LMP3';
  }

  // LMP2
  if (
    combined.includes('ORECA') ||
    combined.includes('LMP2') ||
    combined.includes('VECTOR') ||
    combined.includes('DKR')
  ) {
    return combined.includes('ELMS') ? 'LMP2elms' : 'LMP2';
  }

  if (combined.includes('992S') || combined.includes('SAFETY')) {
    return 'Safety Car';
  }

  return '';
}
