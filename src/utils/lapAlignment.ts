import { ReplayTrajectoryPoint } from '../../shared/types/index.js';

/**
 * Lap alignment primitives: how two independently recorded laps of the same track are put on
 * a common reference - the S/F line crossing, canonical track stations (projection onto the
 * track centreline, server-side) and driven distance re-zeroed at the line. Every comparison
 * (telemetry channels, corner analysis, the map) goes through these.
 */

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
export const MAX_START_FINISH_CORRECTION_M = 25;

/** Raw (unaligned) distances - same logic as getTrajectoryDistances minus the S/F correction,
 * kept separate so computeStartFinishOffset can interpolate against it without recursing. */
export function rawTrajectoryDistances(points: ReplayTrajectoryPoint[]): number[] {
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
 * Returns distances along `points` expressed in `referencePoints`' distance frame, matched on
 * canonical track station - the same alignment the telemetry channels use (computeLapComparisons).
 * Each lap's own driven distance drifts from another lap's as their lines differ (metres by
 * mid-lap), so windows or pedal points taken from one lap must never be applied to another
 * lap's own distances. Falls back to the lap's own S/F-zeroed distances without stations.
 */
export function getDistancesInReferenceFrame(
  points: ReplayTrajectoryPoint[],
  referencePoints: ReplayTrajectoryPoint[],
  trackLengthM?: number
): number[] {
  const ownDists = getTrajectoryDistances(points, trackLengthM);
  const canMatchByStation =
    points !== referencePoints &&
    Boolean(trackLengthM && trackLengthM > 0) &&
    points[0]?.stationM !== undefined &&
    referencePoints[0]?.stationM !== undefined;
  if (!canMatchByStation || !trackLengthM) return ownDists;

  const refStations = getMonotonicStations(referencePoints, trackLengthM);
  const refDists = getTrajectoryDistances(referencePoints, trackLengthM);
  return getMonotonicStations(points, trackLengthM).map(s => interpolateScalarAtDistance(refDists, refStations, s, true));
}

/**
 * Interpolates a scalar value (e.g. lateral offset, a delta trace, a distance) at a given
 * distance along a trajectory. Returns full precision - rounding is the caller's display concern.
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
      return values[0] + t * (values[1] - values[0]);
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
        return values[n - 2] + t * (values[n - 1] - values[n - 2]);
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
  return values[idx0] + t * (values[idx1] - values[idx0]);
}
