import { ReplayTrajectoryPoint, ReplaySummary } from '../../shared/types/index.js';
import { matchesTrack, matchesCarClass } from '../../shared/domain/paceCategory.js';
import {
  MAX_START_FINISH_CORRECTION_M,
  computeStartFinishOffset,
  getMonotonicStations,
  getTrajectoryDistances,
  interpolateScalarAtDistance,
  rawTrajectoryDistances,
} from './lapAlignment.js';

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
  engineRpm?: number;
  tireTemps?: [number, number, number, number];
  tireWear?: [number, number, number, number];
  brakeTemps?: [number, number, number, number];
  rideHeight?: [number, number, number, number];
  wheelSpeeds?: [number, number, number, number];
  tirePressures?: [number, number, number, number];
  lateralOffsetM?: number;
  accelLonG?: number;
  accelLatG?: number;
  accelTotalG?: number;
  yawRateDeg?: number;
  slipAngleDeg?: number;
  understeerDeg?: number;
  tireSlipPct?: number;
  wheelLockActive?: boolean;
  fuel?: number;
  virtualEnergy?: number;
  soc?: number;
  regenRate?: number;
  isOffTrack?: boolean;
}

export interface PointComparison {
  primary: ReplayTrajectoryPoint;
  baseline: InterpolatedPoint;
  deltaTimeSec: number;
  deltaSpeedKmh: number;
  deltaThrottle: number;
  deltaBrake: number;
  deltaSteer: number;
  stationM?: number;
  primaryLateralOffsetM?: number;
  baselineLateralOffsetM?: number;
  deltaLateralOffsetM?: number;
}

/**
 * Blends two trajectory samples at fraction t (0 = p0, 1 = p1) into a display-ready point.
 * Every interpolatePointAtDistance branch goes through here so all channels share one
 * rounding/precision policy; blending a sample with itself (t = 0) yields that sample.
 */
function blendTelemetryPoints(
  p0: ReplayTrajectoryPoint,
  p1: ReplayTrajectoryPoint,
  t: number,
  startTime0: number
): InterpolatedPoint {
  const spd = (p0.speedKmh || 0) + t * ((p1.speedKmh || 0) - (p0.speedKmh || 0));
  const curLapTime0 = (p0.timeSec || 0) - startTime0;
  const curLapTime1 = (p1.timeSec || 0) - startTime0;
  const relativeTime = curLapTime0 + t * (curLapTime1 - curLapTime0);

  const engineRpm = p0.engineRpm !== undefined && p1.engineRpm !== undefined
    ? Math.round(p0.engineRpm + t * (p1.engineRpm - p0.engineRpm))
    : (p0.engineRpm ?? p1.engineRpm);

  const tireTemps = p0.tireTemps && p1.tireTemps
    ? ([
        Math.round(p0.tireTemps[0] + t * (p1.tireTemps[0] - p0.tireTemps[0])),
        Math.round(p0.tireTemps[1] + t * (p1.tireTemps[1] - p0.tireTemps[1])),
        Math.round(p0.tireTemps[2] + t * (p1.tireTemps[2] - p0.tireTemps[2])),
        Math.round(p0.tireTemps[3] + t * (p1.tireTemps[3] - p0.tireTemps[3])),
      ] as [number, number, number, number])
    : (p0.tireTemps ?? p1.tireTemps);

  const tireWear = p0.tireWear && p1.tireWear
    ? ([
        Math.round(p0.tireWear[0] + t * (p1.tireWear[0] - p0.tireWear[0])),
        Math.round(p0.tireWear[1] + t * (p1.tireWear[1] - p0.tireWear[1])),
        Math.round(p0.tireWear[2] + t * (p1.tireWear[2] - p0.tireWear[2])),
        Math.round(p0.tireWear[3] + t * (p1.tireWear[3] - p0.tireWear[3])),
      ] as [number, number, number, number])
    : (p0.tireWear ?? p1.tireWear);

  const brakeTemps = p0.brakeTemps && p1.brakeTemps
    ? ([
        Math.round(p0.brakeTemps[0] + t * (p1.brakeTemps[0] - p0.brakeTemps[0])),
        Math.round(p0.brakeTemps[1] + t * (p1.brakeTemps[1] - p0.brakeTemps[1])),
        Math.round(p0.brakeTemps[2] + t * (p1.brakeTemps[2] - p0.brakeTemps[2])),
        Math.round(p0.brakeTemps[3] + t * (p1.brakeTemps[3] - p0.brakeTemps[3])),
      ] as [number, number, number, number])
    : (p0.brakeTemps ?? p1.brakeTemps);

    const rideHeight = p0.rideHeight && p1.rideHeight
      ? [
        Number((p0.rideHeight[0] + t * (p1.rideHeight[0] - p0.rideHeight[0])).toFixed(1)),
        Number((p0.rideHeight[1] + t * (p1.rideHeight[1] - p0.rideHeight[1])).toFixed(1)),
        Number((p0.rideHeight[2] + t * (p1.rideHeight[2] - p0.rideHeight[2])).toFixed(1)),
        Number((p0.rideHeight[3] + t * (p1.rideHeight[3] - p0.rideHeight[3])).toFixed(1)),
      ] as [number, number, number, number]
      : (p0.rideHeight ?? p1.rideHeight);

  const wheelSpeeds = p0.wheelSpeeds && p1.wheelSpeeds
    ? ([
        Number((p0.wheelSpeeds[0] + t * (p1.wheelSpeeds[0] - p0.wheelSpeeds[0])).toFixed(1)),
        Number((p0.wheelSpeeds[1] + t * (p1.wheelSpeeds[1] - p0.wheelSpeeds[1])).toFixed(1)),
        Number((p0.wheelSpeeds[2] + t * (p1.wheelSpeeds[2] - p0.wheelSpeeds[2])).toFixed(1)),
        Number((p0.wheelSpeeds[3] + t * (p1.wheelSpeeds[3] - p0.wheelSpeeds[3])).toFixed(1)),
      ] as [number, number, number, number])
    : (p0.wheelSpeeds ?? p1.wheelSpeeds);

  const tirePressures = p0.tirePressures && p1.tirePressures
    ? ([
        Number((p0.tirePressures[0] + t * (p1.tirePressures[0] - p0.tirePressures[0])).toFixed(1)),
        Number((p0.tirePressures[1] + t * (p1.tirePressures[1] - p0.tirePressures[1])).toFixed(1)),
        Number((p0.tirePressures[2] + t * (p1.tirePressures[2] - p0.tirePressures[2])).toFixed(1)),
        Number((p0.tirePressures[3] + t * (p1.tirePressures[3] - p0.tirePressures[3])).toFixed(1)),
      ] as [number, number, number, number])
    : (p0.tirePressures ?? p1.tirePressures);

  const lateralOffsetM = p0.lateralOffsetM !== undefined && p1.lateralOffsetM !== undefined
    ? Number((p0.lateralOffsetM + t * (p1.lateralOffsetM - p0.lateralOffsetM)).toFixed(2))
    : (p0.lateralOffsetM ?? p1.lateralOffsetM);

  const accelLonG = p0.accelLonG !== undefined && p1.accelLonG !== undefined
    ? Number((p0.accelLonG + t * (p1.accelLonG - p0.accelLonG)).toFixed(2))
    : (p0.accelLonG ?? p1.accelLonG);

  const accelLatG = p0.accelLatG !== undefined && p1.accelLatG !== undefined
    ? Number((p0.accelLatG + t * (p1.accelLatG - p0.accelLatG)).toFixed(2))
    : (p0.accelLatG ?? p1.accelLatG);

  const accelTotalG = p0.accelTotalG !== undefined && p1.accelTotalG !== undefined
    ? Number((p0.accelTotalG + t * (p1.accelTotalG - p0.accelTotalG)).toFixed(2))
    : (p0.accelTotalG ?? p1.accelTotalG);

  const yawRateDeg = p0.yawRateDeg !== undefined && p1.yawRateDeg !== undefined
    ? Number((p0.yawRateDeg + t * (p1.yawRateDeg - p0.yawRateDeg)).toFixed(1))
    : (p0.yawRateDeg ?? p1.yawRateDeg);

  const slipAngleDeg = p0.slipAngleDeg !== undefined && p1.slipAngleDeg !== undefined
    ? Number((p0.slipAngleDeg + t * (p1.slipAngleDeg - p0.slipAngleDeg)).toFixed(2))
    : (p0.slipAngleDeg ?? p1.slipAngleDeg);

  const understeerDeg = p0.understeerDeg !== undefined && p1.understeerDeg !== undefined
    ? Number((p0.understeerDeg + t * (p1.understeerDeg - p0.understeerDeg)).toFixed(2))
    : (p0.understeerDeg ?? p1.understeerDeg);

  const tireSlipPct = p0.tireSlipPct !== undefined && p1.tireSlipPct !== undefined
    ? Math.round(p0.tireSlipPct + t * (p1.tireSlipPct - p0.tireSlipPct))
    : (p0.tireSlipPct ?? p1.tireSlipPct);

  const wheelLockActive = Boolean(p0.wheelLockActive || p1.wheelLockActive);

  const fuel = p0.fuel !== undefined && p1.fuel !== undefined
    ? Number((p0.fuel + t * (p1.fuel - p0.fuel)).toFixed(2))
    : (p0.fuel ?? p1.fuel);

  const virtualEnergy = p0.virtualEnergy !== undefined && p1.virtualEnergy !== undefined
    ? Number((p0.virtualEnergy + t * (p1.virtualEnergy - p0.virtualEnergy)).toFixed(1))
    : (p0.virtualEnergy ?? p1.virtualEnergy);

  const soc = p0.soc !== undefined && p1.soc !== undefined
    ? Number((p0.soc + t * (p1.soc - p0.soc)).toFixed(1))
    : (p0.soc ?? p1.soc);

  const regenRate = p0.regenRate !== undefined && p1.regenRate !== undefined
    ? Number((p0.regenRate + t * (p1.regenRate - p0.regenRate)).toFixed(1))
    : (p0.regenRate ?? p1.regenRate);

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
    engineRpm,
    tireTemps,
    tireWear,
    brakeTemps,
    rideHeight,
    wheelSpeeds,
    tirePressures,
    lateralOffsetM,
    accelLonG,
    accelLatG,
    accelTotalG,
    yawRateDeg,
    slipAngleDeg,
    understeerDeg,
    tireSlipPct,
    wheelLockActive,
    fuel,
    virtualEnergy,
    soc,
    regenRate,
    isOffTrack: Boolean(p0.isOffTrack || p1.isOffTrack),
  };
}

/**
 * Interpolates a telemetry point at a given distance along a trajectory.
 */
export function interpolatePointAtDistance(
  points: ReplayTrajectoryPoint[],
  cumDists: number[],
  targetDist: number,
  startTimeOverride?: number,
  extrapolateBoundary = false
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

  const startTime0 = startTimeOverride !== undefined ? startTimeOverride : (points[0].timeSec || 0);

  if (points.length === 1 || targetDist <= cumDists[0]) {
    if (extrapolateBoundary && points.length >= 2 && cumDists[1] > cumDists[0]) {
      // Before the first sample (e.g. primary starts on the line, baseline a few metres later):
      // extrapolate time/speed/position linearly, hold every other channel at the first sample.
      const p0 = points[0];
      const p1 = points[1];
      const clampedDist = Math.max(cumDists[0] - MAX_START_FINISH_CORRECTION_M, targetDist);
      const t = (clampedDist - cumDists[0]) / (cumDists[1] - cumDists[0]);
      const extrapolated = blendTelemetryPoints(p0, p1, t, startTime0);
      return {
        ...blendTelemetryPoints(p0, p0, 0, startTime0),
        timeSec: extrapolated.timeSec,
        speedKmh: Math.max(0, extrapolated.speedKmh),
        x: extrapolated.x,
        y: extrapolated.y,
        z: extrapolated.z,
      };
    }
    return blendTelemetryPoints(points[0], points[0], 0, startTime0);
  }

  const maxDist = cumDists[cumDists.length - 1];
  if (targetDist >= maxDist) {
    const pLast = points[points.length - 1];
    if (extrapolateBoundary && points.length >= 2) {
      const p0 = points[points.length - 2];
      const span = maxDist - cumDists[cumDists.length - 2];
      if (span > 1e-6) {
        // Past the last sample: extrapolate time/speed/position, hold the rest at the last sample.
        const clampedDist = Math.min(maxDist + MAX_START_FINISH_CORRECTION_M, targetDist);
        const t = (clampedDist - cumDists[cumDists.length - 2]) / span;
        const extrapolated = blendTelemetryPoints(p0, pLast, t, startTime0);
        return {
          ...blendTelemetryPoints(pLast, pLast, 0, startTime0),
          timeSec: extrapolated.timeSec,
          speedKmh: Math.max(0, extrapolated.speedKmh),
          x: extrapolated.x,
          y: extrapolated.y,
          z: extrapolated.z,
        };
      }
    }
    const held = blendTelemetryPoints(pLast, pLast, 0, startTime0);
    return { ...held, timeSec: Math.max(0, held.timeSec) };
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
    const held = blendTelemetryPoints(points[idx0], points[idx0], 0, startTime0);
    return { ...held, timeSec: Math.max(0, held.timeSec) };
  }

  const span = cumDists[idx1] - cumDists[idx0];
  const t = span > 0 ? (targetDist - cumDists[idx0]) / span : 0;
  return blendTelemetryPoints(points[idx0], points[idx1], t, startTime0);
}

/**
 * Elapsed time (from `startT`) at which a lap reaches the finish line (station L). The server
 * clamps the station of every sample recorded past the line to L, so the first sample at L is in
 * general beyond it: the line is placed along the driven distance from the last sample before it.
 * A lap ending before the line is extrapolated (bounded like the start). Null if the whole lap
 * sits on the line.
 */
function timeAtFinishLine(
  points: ReplayTrajectoryPoint[],
  stations: number[],
  trackLengthM: number,
  startT: number
): number | null {
  const j = stations.findIndex(st => st >= trackLengthM);
  if (j === -1) return interpolatePointAtDistance(points, stations, trackLengthM, startT, true).timeSec;
  if (j === 0) return null;
  const dists = rawTrajectoryDistances(points);
  const lineDist = dists[j - 1] + (trackLengthM - stations[j - 1]);
  const span = dists[j] - dists[j - 1];
  const t = span > 1e-6 ? Math.min(1, Math.max(0, (lineDist - dists[j - 1]) / span)) : 1;
  const t0 = points[j - 1].timeSec || 0;
  return t0 + t * ((points[j].timeSec || 0) - t0) - startT;
}

/**
 * Computes comparative telemetry points for the primary lap against a baseline lap,
 * matched either by canonical track layout station (s) or by absolute cumulative distance
 * along the track rather than by lap-fraction, so both laps are compared on the exact same
 * physical track position — this keeps the comparison correct even when the two laps have
 * different total lengths (e.g. off-track excursions, pit stops, or corner-cutting).
 */
export function computeLapComparisons(
  primaryPoints: ReplayTrajectoryPoint[],
  baselinePoints: ReplayTrajectoryPoint[],
  trackLengthM?: number
): PointComparison[] {
  if (!primaryPoints || primaryPoints.length === 0 || !baselinePoints || baselinePoints.length === 0) {
    return [];
  }

  // 1. Detect physical Start/Finish crossing metrics (distance & timestamp)
  const primaryCrossing = computeStartFinishOffset(primaryPoints, trackLengthM);
  const baselineCrossing = computeStartFinishOffset(baselinePoints, trackLengthM);

  const primaryDists = getTrajectoryDistances(primaryPoints, trackLengthM);
  const baselineDists = getTrajectoryDistances(baselinePoints, trackLengthM);

  // Both lap time stopwatches are normalized to their respective physical Start/Finish line crossing
  const primaryStartT = primaryCrossing ? primaryCrossing.timeSecOffset : (primaryPoints[0].timeSec || 0);
  const baselineStartT = baselineCrossing ? baselineCrossing.timeSecOffset : (baselinePoints[0].timeSec || 0);

  const n = primaryPoints.length;
  const primaryTotalLapTime = Math.max(0, (primaryPoints[n - 1].timeSec || 0) - primaryStartT);
  const baselineTotalLapTime = Math.max(0, (baselinePoints[baselinePoints.length - 1].timeSec || 0) - baselineStartT);
  const finishLineDelta = primaryTotalLapTime - baselineTotalLapTime;

  // Determine whether to match by canonical track station or normalized distance
  const canMatchByStation =
    Boolean(trackLengthM && trackLengthM > 0) &&
    primaryPoints[0]?.stationM !== undefined &&
    baselinePoints[0]?.stationM !== undefined;

  let primaryRefCoords: number[];
  let baselineRefCoords: number[];
  let totalBaselineRef: number;

  if (canMatchByStation && trackLengthM) {
    primaryRefCoords = getMonotonicStations(primaryPoints, trackLengthM);
    baselineRefCoords = getMonotonicStations(baselinePoints, trackLengthM);
    totalBaselineRef = trackLengthM;
  } else {
    primaryRefCoords = primaryDists;
    baselineRefCoords = baselineDists;
    totalBaselineRef = Math.max(1, baselineDists[baselineDists.length - 1]);
  }

  // At and past the finish line (samples clamped to station L) the delta is the lap delta at the
  // line itself - not a gap that keeps growing while the primary runs on past it.
  const lineDelta = canMatchByStation && trackLengthM
    ? (() => {
        const primaryLineT = timeAtFinishLine(primaryPoints, primaryRefCoords, trackLengthM, primaryStartT);
        const baselineLineT = timeAtFinishLine(baselinePoints, baselineRefCoords, trackLengthM, baselineStartT);
        return primaryLineT === null || baselineLineT === null ? null : Number((primaryLineT - baselineLineT).toFixed(3));
      })()
    : null;

  const hasLateralOffsets = primaryPoints[0]?.lateralOffsetM !== undefined && baselinePoints[0]?.lateralOffsetM !== undefined;
  const baselineOffsets = hasLateralOffsets ? baselinePoints.map(p => p.lateralOffsetM ?? 0) : null;

  return primaryPoints.map((p, i) => {
    // Match on the same canonical reference coordinate (station or distance)
    const targetBaselineRef = Math.min(primaryRefCoords[i], totalBaselineRef);
    const basePoint = interpolatePointAtDistance(
      baselinePoints,
      baselineRefCoords,
      targetBaselineRef,
      baselineStartT,
      true
    );

    const primaryRelativeT = (p.timeSec || 0) - primaryStartT;

    let deltaTimeSec: number;
    if (i === 0 && Math.abs(primaryRefCoords[0]) < 1.0) {
      // Start line boundary: elapsed time is identically 0 for both laps at s ≈ 0
      deltaTimeSec = 0;
    } else if (lineDelta !== null && primaryRefCoords[i] >= totalBaselineRef) {
      deltaTimeSec = lineDelta;
    } else if (!canMatchByStation && i === n - 1 && targetBaselineRef >= totalBaselineRef) {
      // Distance matching (no track stations): the recordings' last samples are taken as the line.
      deltaTimeSec = Number(finishLineDelta.toFixed(3));
    } else {
      const rawDelta = primaryRelativeT - basePoint.timeSec;
      deltaTimeSec = isNaN(rawDelta) || !isFinite(rawDelta) ? 0 : Number(rawDelta.toFixed(3));
    }

    const deltaSpeedKmh = (p.speedKmh || 0) - basePoint.speedKmh;
    const deltaThrottle = (p.throttle || 0) - basePoint.throttle;
    const deltaBrake = (p.brake || 0) - basePoint.brake;
    const deltaSteer = (p.steerYaw || 0) - basePoint.steerYaw;

    let primaryLateralOffsetM: number | undefined = undefined;
    let baselineLateralOffsetM: number | undefined = undefined;
    let deltaLateralOffsetM: number | undefined = undefined;

    if (hasLateralOffsets && baselineOffsets) {
      primaryLateralOffsetM = p.lateralOffsetM;
      baselineLateralOffsetM = Number(interpolateScalarAtDistance(
        baselineOffsets,
        baselineRefCoords,
        targetBaselineRef,
        true
      ).toFixed(2));
      deltaLateralOffsetM = Number(((primaryLateralOffsetM ?? 0) - baselineLateralOffsetM).toFixed(2));
    }

    return {
      primary: p,
      baseline: basePoint,
      deltaTimeSec,
      deltaSpeedKmh,
      deltaThrottle,
      deltaBrake,
      deltaSteer,
      stationM: p.stationM ?? primaryDists[i],
      primaryLateralOffsetM,
      baselineLateralOffsetM,
      deltaLateralOffsetM,
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

  return allReplays.filter(r => {
    if (excludeReplayName && r.name === excludeReplayName) return false;
    if (!r.trackName) return false;

    // Track matching rule
    if (!matchesTrack(r.trackName, currentTrackName, '')) return false;

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

