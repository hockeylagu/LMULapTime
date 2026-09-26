import { ReplayTrajectoryPoint } from '../core/types.js';
import { interpolateAngle } from '../telemetry/telemetryFusion.js';

/**
 * The line crossing used to cut a lap must lie this close (in time) to the timing-loop slice
 * boundary: a remote driver's timing event reaches the replay a few tenths late, so a crossing
 * further away belongs to some other pass over the line (pit lane, spin).
 */
export const MAX_LINE_CUT_SHIFT_SEC = 2.5;

const ANGLE_FIELDS = new Set(['rotX', 'rotY', 'rotZ']);
// Numeric channels that hold a state, not a measurement: never blended between two samples.
const DISCRETE_FIELDS = new Set(['gear', 'detachablePartState']);

export interface LapLineCut {
  /** The lap from line to line, with stationM and lateralOffsetM set (distM is not). */
  points: ReplayTrajectoryPoint[];
  /** New index of a sample that was at index i of the timing-loop slice: i + indexShift. */
  indexShift: number;
  startCut: boolean;
  endCut: boolean;
}

/** Linear interpolation of every measured channel between two consecutive samples. */
function interpolatePoint(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint, f: number): ReplayTrajectoryPoint {
  const from = a as unknown as Record<string, unknown>;
  const to = b as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...(f < 0.5 ? from : to) };
  for (const key of Object.keys(from)) {
    const va = from[key];
    const vb = to[key];
    if (typeof va !== 'number' || typeof vb !== 'number' || DISCRETE_FIELDS.has(key)) continue;
    const value = ANGLE_FIELDS.has(key) ? interpolateAngle(va, vb, f) : va + f * (vb - va);
    out[key] = Number(value.toFixed(3));
  }
  return out as unknown as ReplayTrajectoryPoint;
}

/**
 * Cuts a lap exactly at the start/finish line (station 0 of the track centreline).
 *
 * `samples` is the lap as sliced by the timing loop (indices lapStartIdx..lapEndIdx) with the
 * recording just before and after it, and `stations` their projection on the centreline,
 * wrapped in [0, trackLengthM). Each end of the lap is moved to the line crossing nearest in
 * time to the timing-loop boundary, where a sample is interpolated so the lap starts at station
 * 0 and ends at station trackLengthM. An end with no crossing within MAX_LINE_CUT_SHIFT_SEC
 * (out-lap from the pits, no recording past a late slice) keeps the timing-loop boundary.
 *
 * `trackLengthM` must be the centreline's own length (the station at which it wraps).
 */
export function cutLapAtLine(
  samples: ReplayTrajectoryPoint[],
  stations: number[],
  lateralOffsets: number[],
  trackLengthM: number,
  lapStartIdx: number,
  lapEndIdx: number
): LapLineCut {
  const L = trackLengthM;
  const n = samples.length;
  // Continuous station: negative before the line at the lap start, above L past it at the end.
  const u = new Array<number>(n);
  u[0] = stations[0] > L / 2 ? stations[0] - L : stations[0];
  for (let i = 1; i < n; i++) {
    let ds = stations[i] - stations[i - 1];
    if (ds > L / 2) ds -= L;
    else if (ds < -L / 2) ds += L;
    u[i] = u[i - 1] + ds;
  }

  const timeAt = (i: number) => samples[i].timeSec ?? 0;
  const findCrossing = (target: number, nearIdx: number, after: number): number => {
    let best = -1;
    let bestGap = Infinity;
    for (let k = Math.max(0, after); k < n - 1; k++) {
      if (!(u[k] < target && u[k + 1] >= target)) continue;
      const gap = Math.abs(timeAt(k) - timeAt(nearIdx));
      if (gap <= MAX_LINE_CUT_SHIFT_SEC && gap < bestGap) {
        best = k;
        bestGap = gap;
      }
    }
    return best;
  };

  const startK = findCrossing(0, lapStartIdx, 0);
  const endK = findCrossing(L, lapEndIdx, startK >= 0 ? startK + 1 : lapStartIdx);

  const withProjection = (i: number): ReplayTrajectoryPoint => ({
    ...samples[i],
    // Uncut ends keep the previous convention: wrapped before the line, pinned at L past it.
    stationM: Number((u[i] < 0 ? u[i] + L : Math.min(u[i], L)).toFixed(2)),
    lateralOffsetM: Number((lateralOffsets[i] ?? 0).toFixed(2)),
  });
  const boundary = (k: number, target: number): ReplayTrajectoryPoint => {
    const f = (target - u[k]) / (u[k + 1] - u[k]);
    return {
      ...interpolatePoint(samples[k], samples[k + 1], f),
      stationM: Number(target.toFixed(2)),
      lateralOffsetM: Number((lateralOffsets[k] + f * (lateralOffsets[k + 1] - lateralOffsets[k])).toFixed(2)),
    };
  };

  const first = startK >= 0 ? startK + 1 : lapStartIdx;
  const last = endK >= 0 ? endK : lapEndIdx;
  const points: ReplayTrajectoryPoint[] = [];
  if (startK >= 0) points.push(boundary(startK, 0));
  for (let i = first; i <= last; i++) points.push(withProjection(i));
  if (endK >= 0) points.push(boundary(endK, L));

  return {
    points,
    indexShift: (startK >= 0 ? 1 : 0) + lapStartIdx - first,
    startCut: startK >= 0,
    endCut: endK >= 0,
  };
}
