import { ReplayTrajectoryPoint, ReplaySummary } from '../../shared/types/index.js';
import { matchesTrack, matchesCarClass } from '../../shared/domain/paceCategory.js';

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

export interface StartFinishCrossing {
  /** The distM value (this lap's own cumulative-distance metric) at the true S/F crossing. */
  distMOffset: number;
  /** Timestamp in seconds (this lap's own time metric) at the true S/F crossing. */
  timeSecOffset: number;
  /** World-space position of the crossing, interpolated/extrapolated along the recorded path. */
  worldX: number;
  worldZ: number;
}

// Two independently-trimmed recordings of "the same lap" rarely start at the exact physical
// line - if the drift looks bigger than this, the array likely isn't actually split at the
// line at all, so we bail rather than risk a bogus correction.
const MAX_START_FINISH_CORRECTION_M = 25;

/** Raw (unaligned) distances - same logic as getTrajectoryDistances minus the S/F correction,
 * kept separate so computeStartFinishOffset can interpolate against it without recursing. */
function rawTrajectoryDistances(points: ReplayTrajectoryPoint[]): number[] {
  if (!points || points.length === 0) return [];
  if (points[0]?.distM !== undefined) {
    return points.map(p => p.distM ?? 0);
  }
  return computeCumulativeDistances(points);
}

/**
 * Finds where this lap's own recorded path crosses the canonical start/finish station
 * (stationM === 0, set server-side from the track's timing-gate geometry) by scanning a
 * bounded boundary window for the zero-crossing (or backward linear extrapolation if trimmed
 * slightly late). Returns null when canonical stationM isn't available (unrecognized track) or
 * the drift is too large to trust as a simple trim offset.
 *
 * This is the single source of truth for "where is the real line" relative to a specific
 * recording's own frame - used both to draw the S/F line and to re-zero distance and time
 * so two different recordings of the same track are matched against the same physical reference.
 */
export function computeStartFinishOffset(
  points: ReplayTrajectoryPoint[],
  trackLengthM?: number
): StartFinishCrossing | null {
  if (!points || points.length < 2) return null;

  const hasStation = points[0]?.stationM !== undefined && points[1]?.stationM !== undefined;
  if (!hasStation) return null;

  const rawDists = rawTrajectoryDistances(points);
  const n = points.length;
  const unwrapStation = (s: number) => (trackLengthM && s > trackLengthM / 2 ? s - trackLengthM : s);

  // Search window (first 60 points or 10% of lap) to find where station crosses from <= 0 to >= 0
  let kCrossing = -1;
  const searchLimit = Math.min(n - 1, 60);
  for (let i = 0; i < searchLimit; i++) {
    const s0 = unwrapStation(points[i].stationM ?? 0);
    const s1 = unwrapStation(points[i + 1].stationM ?? 0);
    if (s0 <= 0 && s1 >= 0 && (s0 < 0 || s1 > 0)) {
      kCrossing = i;
      break;
    }
  }

  let p0: ReplayTrajectoryPoint;
  let p1: ReplayTrajectoryPoint;
  let d0: number;
  let d1: number;
  let t: number;

  if (kCrossing >= 0) {
    p0 = points[kCrossing];
    p1 = points[kCrossing + 1];
    d0 = rawDists[kCrossing];
    d1 = rawDists[kCrossing + 1];
    const s0 = unwrapStation(p0.stationM ?? 0);
    const s1 = unwrapStation(p1.stationM ?? 0);
    const ds = s1 - s0;
    t = ds > 1e-6 ? -s0 / ds : 0;
  } else {
    // If no explicit <=0 to >=0 crossing in window (e.g. lap sliced slightly after the line):
    p0 = points[0];
    p1 = points[1];
    d0 = rawDists[0];
    d1 = rawDists[1];
    const s0 = unwrapStation(p0.stationM ?? 0);
    const s1 = unwrapStation(p1.stationM ?? 0);

    if (Math.abs(s0) > MAX_START_FINISH_CORRECTION_M) return null;
    let ds = s1 - s0;
    if (trackLengthM) {
      if (ds > trackLengthM / 2) ds -= trackLengthM;
      else if (ds < -trackLengthM / 2) ds += trackLengthM;
    }
    if (!Number.isFinite(ds) || Math.abs(ds) < 1e-6) return null;
    t = -s0 / ds;
  }

  const time0 = p0.timeSec || 0;
  const time1 = p1.timeSec || 0;
  const distMOffset = d0 + t * (d1 - d0);
  if (Math.abs(distMOffset) > MAX_START_FINISH_CORRECTION_M) return null;

  return {
    distMOffset,
    timeSecOffset: time0 + t * (time1 - time0),
    worldX: p0.x + t * (p1.x - p0.x),
    worldZ: p0.z + t * (p1.z - p0.z),
  };
}

/**
 * Returns canonical non-decreasing stations unwrapping the start/finish seam
 * for robust spatial indexing and station-domain interpolation.
 */
export function getMonotonicStations(points: ReplayTrajectoryPoint[], trackLengthM: number): number[] {
  const n = points.length;
  if (n === 0) return [];
  const stations: number[] = [];

  let s0 = points[0].stationM ?? 0;
  if (s0 > trackLengthM * 0.75) {
    s0 -= trackLengthM;
  }
  stations.push(s0);
  let wrapOffset = s0 - (points[0].stationM ?? 0);
  let prevRaw = points[0].stationM ?? 0;
  let prevMonotonic = s0;

  for (let i = 1; i < n; i++) {
    const raw = points[i].stationM ?? 0;
    const delta = raw - prevRaw;
    if (delta < -trackLengthM / 2) {
      wrapOffset += trackLengthM;
    } else if (delta > trackLengthM / 2) {
      wrapOffset -= trackLengthM;
    }
    prevRaw = raw;
    let unwrapped = raw + wrapOffset;
    if (unwrapped < prevMonotonic) {
      unwrapped = prevMonotonic;
    }
    prevMonotonic = unwrapped;
    stations.push(unwrapped);
  }
  return stations;
}

/**
 * Returns the canonical lap elapsed time (seconds) along the trajectory, re-zeroed so that
 * 0 always means the true physical start/finish line crossing (see computeStartFinishOffset).
 * Falls back to elapsed time from points[0] when canonical start/finish is unavailable.
 */
export function getNormalizedTrajectoryTimes(points: ReplayTrajectoryPoint[], trackLengthM?: number): number[] {
  if (!points || points.length === 0) return [];
  const crossing = computeStartFinishOffset(points, trackLengthM);
  const baseT = crossing ? crossing.timeSecOffset : (points[0].timeSec || 0);
  return points.map(p => (p.timeSec || 0) - baseT);
}

/**
 * Returns the canonical lap distance index (meters) along the trajectory, re-zeroed so that
 * 0 always means the true physical start/finish crossing (see computeStartFinishOffset) -
 * this is what makes distance-matched comparisons between two independently recorded laps
 * (brake points, corner deltas, pedal markers) refer to the same physical spot on track
 * instead of wherever each recording happened to be trimmed.
 * Prioritizes the server-provided distM as the single source of truth,
 * falling back to computeCumulativeDistances if distM is not yet populated.
 */
export function getTrajectoryDistances(points: ReplayTrajectoryPoint[], trackLengthM?: number): number[] {
  const dists = rawTrajectoryDistances(points);
  if (dists.length === 0) return dists;

  const crossing = computeStartFinishOffset(points, trackLengthM);
  if (!crossing || crossing.distMOffset === 0) return dists;
  return dists.map(d => d - crossing.distMOffset);
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
      const p0 = points[0];
      const p1 = points[1];
      const span = cumDists[1] - cumDists[0];
      const clampedDist = Math.max(cumDists[0] - MAX_START_FINISH_CORRECTION_M, targetDist);
      const t = (clampedDist - cumDists[0]) / span;
      const spd = Math.max(0, (p0.speedKmh || 0) + t * ((p1.speedKmh || 0) - (p0.speedKmh || 0)));
      const curLapTime0 = (p0.timeSec || 0) - startTime0;
      const curLapTime1 = (p1.timeSec || 0) - startTime0;
      const relativeTime = curLapTime0 + t * (curLapTime1 - curLapTime0);
      return {
        timeSec: relativeTime,
        speedKmh: spd,
        throttle: p0.throttle || 0,
        brake: p0.brake || 0,
        steerYaw: p0.steerYaw || 0,
        gear: resolveGearValue(p0),
        x: p0.x + t * (p1.x - p0.x),
        y: p0.y + t * (p1.y - p0.y),
        z: p0.z + t * (p1.z - p0.z),
        tcActive: p0.tcActive,
        absActive: p0.absActive,
        engineRpm: p0.engineRpm,
        tireTemps: p0.tireTemps ? [...p0.tireTemps] : undefined,
        tireWear: p0.tireWear ? [...p0.tireWear] : undefined,
        brakeTemps: p0.brakeTemps ? [...p0.brakeTemps] : undefined,
        rideHeight: p0.rideHeight ? [...p0.rideHeight] : undefined,
        wheelSpeeds: p0.wheelSpeeds ? [...p0.wheelSpeeds] : undefined,
        tirePressures: p0.tirePressures ? [...p0.tirePressures] : undefined,
        lateralOffsetM: p0.lateralOffsetM,
        accelLonG: p0.accelLonG,
        accelLatG: p0.accelLatG,
        accelTotalG: p0.accelTotalG,
        yawRateDeg: p0.yawRateDeg,
        slipAngleDeg: p0.slipAngleDeg,
        understeerDeg: p0.understeerDeg,
        tireSlipPct: p0.tireSlipPct,
        wheelLockActive: p0.wheelLockActive,
      };
    }

    const p = points[0];
    const spd = p.speedKmh || 0;
    return {
      timeSec: (p.timeSec || 0) - startTime0,
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
      engineRpm: p.engineRpm,
      tireTemps: p.tireTemps ? [...p.tireTemps] : undefined,
      tireWear: p.tireWear ? [...p.tireWear] : undefined,
      brakeTemps: p.brakeTemps ? [...p.brakeTemps] : undefined,
      rideHeight: p.rideHeight ? [...p.rideHeight] : undefined,
      wheelSpeeds: p.wheelSpeeds ? [...p.wheelSpeeds] : undefined,
      tirePressures: p.tirePressures ? [...p.tirePressures] : undefined,
      lateralOffsetM: p.lateralOffsetM,
      accelLonG: p.accelLonG,
      accelLatG: p.accelLatG,
      accelTotalG: p.accelTotalG,
      yawRateDeg: p.yawRateDeg,
      slipAngleDeg: p.slipAngleDeg,
      understeerDeg: p.understeerDeg,
      tireSlipPct: p.tireSlipPct,
      wheelLockActive: p.wheelLockActive,
    };
  }

  const maxDist = cumDists[cumDists.length - 1];
  if (targetDist >= maxDist) {
    if (extrapolateBoundary && points.length >= 2) {
      const p0 = points[points.length - 2];
      const p1 = points[points.length - 1];
      const span = cumDists[cumDists.length - 1] - cumDists[cumDists.length - 2];
      if (span > 1e-6) {
        const clampedDist = Math.min(maxDist + MAX_START_FINISH_CORRECTION_M, targetDist);
        const t = (clampedDist - cumDists[cumDists.length - 2]) / span;
        const spd = Math.max(0, (p0.speedKmh || 0) + t * ((p1.speedKmh || 0) - (p0.speedKmh || 0)));
        const curLapTime0 = (p0.timeSec || 0) - startTime0;
        const curLapTime1 = (p1.timeSec || 0) - startTime0;
        const relativeTime = curLapTime0 + t * (curLapTime1 - curLapTime0);
        return {
          timeSec: relativeTime,
          speedKmh: spd,
          throttle: p1.throttle || 0,
          brake: p1.brake || 0,
          steerYaw: p1.steerYaw || 0,
          gear: resolveGearValue(p1),
          x: p0.x + t * (p1.x - p0.x),
          y: p0.y + t * (p1.y - p0.y),
          z: p0.z + t * (p1.z - p0.z),
          tcActive: p1.tcActive,
          absActive: p1.absActive,
          engineRpm: p1.engineRpm,
          tireTemps: p1.tireTemps ? [...p1.tireTemps] : undefined,
          tireWear: p1.tireWear ? [...p1.tireWear] : undefined,
          brakeTemps: p1.brakeTemps ? [...p1.brakeTemps] : undefined,
          lateralOffsetM: p1.lateralOffsetM,
          accelLonG: p1.accelLonG,
          accelLatG: p1.accelLatG,
          accelTotalG: p1.accelTotalG,
          yawRateDeg: p1.yawRateDeg,
          slipAngleDeg: p1.slipAngleDeg,
          understeerDeg: p1.understeerDeg,
          tireSlipPct: p1.tireSlipPct,
          wheelLockActive: p1.wheelLockActive,
        };
      }
    }

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
      engineRpm: p.engineRpm,
      tireTemps: p.tireTemps ? [...p.tireTemps] : undefined,
      tireWear: p.tireWear ? [...p.tireWear] : undefined,
      brakeTemps: p.brakeTemps ? [...p.brakeTemps] : undefined,
      lateralOffsetM: p.lateralOffsetM,
      accelLonG: p.accelLonG,
      accelLatG: p.accelLatG,
      accelTotalG: p.accelTotalG,
      yawRateDeg: p.yawRateDeg,
      slipAngleDeg: p.slipAngleDeg,
      understeerDeg: p.understeerDeg,
      tireSlipPct: p.tireSlipPct,
      wheelLockActive: p.wheelLockActive,
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
      engineRpm: p.engineRpm,
      tireTemps: p.tireTemps ? [...p.tireTemps] : undefined,
      tireWear: p.tireWear ? [...p.tireWear] : undefined,
      brakeTemps: p.brakeTemps ? [...p.brakeTemps] : undefined,
      rideHeight: p.rideHeight ? [...p.rideHeight] : undefined,
      wheelSpeeds: p.wheelSpeeds ? [...p.wheelSpeeds] : undefined,
      tirePressures: p.tirePressures ? [...p.tirePressures] : undefined,
      lateralOffsetM: p.lateralOffsetM,
      accelLonG: p.accelLonG,
      accelLatG: p.accelLatG,
      accelTotalG: p.accelTotalG,
      yawRateDeg: p.yawRateDeg,
      slipAngleDeg: p.slipAngleDeg,
      understeerDeg: p.understeerDeg,
      tireSlipPct: p.tireSlipPct,
      wheelLockActive: p.wheelLockActive,
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
 * Interpolates a scalar value (e.g. lateral offset) at a given distance along a trajectory.
 */
export function interpolateScalarAtDistance(
  values: number[],
  cumDists: number[],
  targetDist: number,
  extrapolateBoundary = false
): number {
  if (values.length === 0) return 0;
  if (values.length === 1 || targetDist <= cumDists[0]) {
    if (extrapolateBoundary && values.length >= 2 && cumDists[1] > cumDists[0]) {
      const span = cumDists[1] - cumDists[0];
      const clampedDist = Math.max(cumDists[0] - MAX_START_FINISH_CORRECTION_M, targetDist);
      const t = (clampedDist - cumDists[0]) / span;
      return Number((values[0] + t * (values[1] - values[0])).toFixed(2));
    }
    return values[0];
  }
  const maxDist = cumDists[cumDists.length - 1];
  if (targetDist >= maxDist) {
    if (extrapolateBoundary && values.length >= 2) {
      const n = values.length;
      const span = cumDists[n - 1] - cumDists[n - 2];
      if (span > 1e-6) {
        const clampedDist = Math.min(maxDist + MAX_START_FINISH_CORRECTION_M, targetDist);
        const t = (clampedDist - cumDists[n - 2]) / span;
        return Number((values[n - 2] + t * (values[n - 1] - values[n - 2])).toFixed(2));
      }
    }
    return values[values.length - 1];
  }

  let low = 0;
  let high = cumDists.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cumDists[mid] < targetDist) low = mid + 1;
    else high = mid - 1;
  }
  const idx0 = Math.max(0, low - 1);
  const idx1 = Math.min(values.length - 1, low);
  if (idx0 === idx1) return values[idx0];
  const span = cumDists[idx1] - cumDists[idx0];
  const t = span > 0 ? (targetDist - cumDists[idx0]) / span : 0;
  return Number((values[idx0] + t * (values[idx1] - values[idx0])).toFixed(2));
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
    } else if (i === n - 1 && targetBaselineRef >= totalBaselineRef) {
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

    let primaryLateralOffsetM: number | undefined = undefined;
    let baselineLateralOffsetM: number | undefined = undefined;
    let deltaLateralOffsetM: number | undefined = undefined;

    if (hasLateralOffsets && baselineOffsets) {
      primaryLateralOffsetM = p.lateralOffsetM;
      baselineLateralOffsetM = interpolateScalarAtDistance(
        baselineOffsets,
        baselineRefCoords,
        targetBaselineRef,
        true
      );
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

