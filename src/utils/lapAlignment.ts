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

// A crossing found further than this into the recording means the array isn't split at the
// line at all (e.g. a lap whose start the server couldn't put on the line), so we bail rather
// than risk a bogus correction.
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
 * bounded boundary window for the zero-crossing. On a lap the server put on the line (see
 * LapEndCut) that is its first sample. Returns null when canonical stationM isn't available
 * (unrecognized track) or the recording doesn't cross the line near its start (its start is
 * away from the line): nothing is extrapolated here.
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

  if (kCrossing < 0) return null;
  const p0 = points[kCrossing];
  const p1 = points[kCrossing + 1];
  const d0 = rawDists[kCrossing];
  const d1 = rawDists[kCrossing + 1];
  const s0 = unwrapStation(p0.stationM ?? 0);
  const ds = unwrapStation(p1.stationM ?? 0) - s0;
  const t = ds > 1e-6 ? -s0 / ds : 0;

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
 * Whether two laps can be matched on canonical track station: the track length is known and
 * both carry server-projected stations. This is THE alignment decision - every comparison
 * (channels, corners, map) asks it here. Without it only each lap's own S/F-zeroed driven
 * distance is available, which drifts between laps as their lines differ.
 */
export function canAlignByStation(
  points: ReplayTrajectoryPoint[],
  referencePoints: ReplayTrajectoryPoint[],
  trackLengthM: number | undefined
): trackLengthM is number {
  return (
    trackLengthM !== undefined &&
    trackLengthM > 0 &&
    points[0]?.stationM !== undefined &&
    referencePoints[0]?.stationM !== undefined
  );
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
  if (points === referencePoints || !canAlignByStation(points, referencePoints, trackLengthM)) return ownDists;

  const refStations = getMonotonicStations(referencePoints, trackLengthM);
  const refDists = getTrajectoryDistances(referencePoints, trackLengthM);
  return getMonotonicStations(points, trackLengthM).map(s => interpolateScalarAtDistance(refDists, refStations, s));
}

/**
 * Interpolates a scalar value (e.g. lateral offset, a delta trace, a distance) at a given
 * distance along a trajectory, holding the end values beyond either end. Returns full
 * precision - rounding is the caller's display concern.
 */
export function interpolateScalarAtDistance(values: number[], cumDists: number[], targetDist: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1 || targetDist <= cumDists[0]) return values[0];
  if (targetDist >= cumDists[cumDists.length - 1]) return values[values.length - 1];

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
