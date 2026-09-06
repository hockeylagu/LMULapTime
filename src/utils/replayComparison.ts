import { ReplayTrajectoryPoint, ReplaySummary } from '../../server/types.js';
import { matchesTrack, matchesCarClass, getTrackAndLayout } from './paceCategory.js';

export interface InterpolatedPoint {
  timeSec: number;
  speedKmh: number;
  throttle: number;
  brake: number;
  steerYaw: number;
  rpm?: number;
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
      rpm: p.rpm,
      gear: spd > 5 ? Math.min(7, Math.floor(spd / 38) + 1) : 1,
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
      rpm: p.rpm,
      gear: spd > 5 ? Math.min(7, Math.floor(spd / 38) + 1) : 1,
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
      rpm: p.rpm,
      gear: spd > 5 ? Math.min(7, Math.floor(spd / 38) + 1) : 1,
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
    rpm: p0.rpm && p1.rpm ? Math.round(p0.rpm + t * (p1.rpm - p0.rpm)) : p0.rpm,
    gear: spd > 5 ? Math.min(7, Math.floor(spd / 38) + 1) : 1,
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
