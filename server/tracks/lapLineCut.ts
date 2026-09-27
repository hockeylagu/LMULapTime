import { LapEndCut, ReplayTrajectoryPoint } from '../core/types.js';
import { interpolateAngle } from '../telemetry/telemetryFusion.js';

/**
 * The line crossing used to cut a lap must lie this close (in time) to the timing-loop slice
 * boundary: a remote driver's timing event reaches the replay a few tenths late, so a crossing
 * further away belongs to some other pass over the line (pit lane, spin).
 */
export const MAX_LINE_CUT_SHIFT_SEC = 2.5;

/**
 * An end of the lap with no recording beyond it (the replay starts or stops there) but within
 * this distance of the line is extended to the line, assuming the car kept its speed and heading.
 */
export const MAX_LINE_EXTRAPOLATION_M = 25;

const ANGLE_FIELDS = new Set(['rotX', 'rotY', 'rotZ']);
// Numeric channels that hold a state, not a measurement: never blended between two samples.
const DISCRETE_FIELDS = new Set(['gear', 'detachablePartState']);

export interface LapLineCut {
  /** The lap from line to line, with stationM and lateralOffsetM set (distM is not). */
  points: ReplayTrajectoryPoint[];
  /** New index of a sample that was at index i of the timing-loop slice: i + indexShift. */
  indexShift: number;
  start: LapEndCut;
  end: LapEndCut;
}

/**
 * Linear interpolation of every measured channel between two consecutive samples. A channel only
 * one of them carries is taken from it: on a DuckDB lap the recording either side of the lap is
 * the replay file's, without the DuckDB-only channels (tyres, ride height, wear...).
 */
function interpolatePoint(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint, f: number): ReplayTrajectoryPoint {
  const from = a as unknown as Record<string, unknown>;
  const to = b as unknown as Record<string, unknown>;
  const out = f < 0.5 ? withMissingChannels(from, to) : withMissingChannels(to, from);
  for (const key of Object.keys(out)) {
    const va = from[key];
    const vb = to[key];
    if (typeof va !== 'number' || typeof vb !== 'number' || DISCRETE_FIELDS.has(key)) continue;
    const value = ANGLE_FIELDS.has(key) ? interpolateAngle(va, vb, f) : va + f * (vb - va);
    out[key] = Number(value.toFixed(3));
  }
  return out as unknown as ReplayTrajectoryPoint;
}

/** `point` with every channel it lacks taken from `source`. */
function withMissingChannels(point: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...point };
  for (const key of Object.keys(source)) {
    if (out[key] === undefined) out[key] = source[key];
  }
  return out;
}

/**
 * Cuts a lap exactly at the start/finish line (station 0 of the track centreline).
 *
 * `samples` is the lap as sliced by the timing loop (indices lapStartIdx..lapEndIdx) with the
 * recording just before and after it, and `stations` their projection on the centreline,
 * wrapped in [0, trackLengthM). Each end of the lap is moved to the line crossing nearest in
 * time to the timing-loop boundary, where a sample is interpolated so the lap starts at station
 * 0 and ends at station trackLengthM. An end with no crossing within MAX_LINE_CUT_SHIFT_SEC but
 * within MAX_LINE_EXTRAPOLATION_M of the line (a slice at the very start or end of the replay) is
 * extrapolated to it; any other end (out-lap from the pits) keeps the timing-loop boundary.
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

  // A sample of the recording before or after the lap holds the channels it lacks at the lap's
  // nearest end, so a DuckDB lap's tyre and corner traces run up to the line without a gap.
  const sampleAt = (i: number): ReplayTrajectoryPoint => {
    const lapEnd = i < lapStartIdx ? lapStartIdx : i > lapEndIdx ? lapEndIdx : -1;
    if (lapEnd < 0) return samples[i];
    return withMissingChannels(
      samples[i] as unknown as Record<string, unknown>,
      samples[lapEnd] as unknown as Record<string, unknown>,
    ) as unknown as ReplayTrajectoryPoint;
  };
  const withProjection = (i: number): ReplayTrajectoryPoint => ({
    ...sampleAt(i),
    // Uncut ends keep the previous convention: wrapped before the line, pinned at L past it.
    stationM: Number((u[i] < 0 ? u[i] + L : Math.min(u[i], L)).toFixed(2)),
    lateralOffsetM: Number((lateralOffsets[i] ?? 0).toFixed(2)),
  });
  const boundary = (k: number, target: number): ReplayTrajectoryPoint => {
    const f = (target - u[k]) / (u[k + 1] - u[k]);
    return {
      ...interpolatePoint(sampleAt(k), sampleAt(k + 1), f),
      stationM: Number(target.toFixed(2)),
      lateralOffsetM: Number((lateralOffsets[k] + f * (lateralOffsets[k + 1] - lateralOffsets[k])).toFixed(2)),
    };
  };

  // Beyond the recorded end sample `edge`, continuing the step from `inner`: position, time and
  // speed are extended, every other channel is held at the edge sample.
  const extrapolated = (edge: number, inner: number, target: number): ReplayTrajectoryPoint => {
    const g = (target - u[edge]) / (u[edge] - u[inner]);
    const a = samples[edge];
    const b = samples[inner];
    const extend = (va: number | undefined, vb: number | undefined) =>
      va === undefined || vb === undefined ? va : Number((va + g * (va - vb)).toFixed(3));
    return {
      ...a,
      x: extend(a.x, b.x) ?? a.x,
      y: extend(a.y, b.y) ?? a.y,
      z: extend(a.z, b.z) ?? a.z,
      timeSec: extend(a.timeSec, b.timeSec),
      speedKmh: Math.max(0, extend(a.speedKmh, b.speedKmh) ?? 0),
      stationM: Number(target.toFixed(2)),
      lateralOffsetM: Number((lateralOffsets[edge] ?? 0).toFixed(2)),
    };
  };
  // Only towards the line from the right side, with the car moving forward over the last step.
  const canExtrapolate = (edge: number, inner: number, gapM: number) =>
    inner >= lapStartIdx && inner <= lapEndIdx && gapM > 0 && gapM <= MAX_LINE_EXTRAPOLATION_M &&
    u[Math.max(edge, inner)] - u[Math.min(edge, inner)] > 1e-6;

  const start: LapEndCut = startK >= 0 ? 'line' : canExtrapolate(lapStartIdx, lapStartIdx + 1, u[lapStartIdx]) ? 'extrapolated' : 'none';
  const end: LapEndCut = endK >= 0 ? 'line' : canExtrapolate(lapEndIdx, lapEndIdx - 1, L - u[lapEndIdx]) ? 'extrapolated' : 'none';

  const first = startK >= 0 ? startK + 1 : lapStartIdx;
  const last = endK >= 0 ? endK : lapEndIdx;
  const points: ReplayTrajectoryPoint[] = [];
  if (start === 'line') points.push(boundary(startK, 0));
  else if (start === 'extrapolated') points.push(extrapolated(lapStartIdx, lapStartIdx + 1, 0));
  for (let i = first; i <= last; i++) points.push(withProjection(i));
  if (end === 'line') points.push(boundary(endK, L));
  else if (end === 'extrapolated') points.push(extrapolated(lapEndIdx, lapEndIdx - 1, L));

  return {
    points,
    indexShift: (start === 'none' ? 0 : 1) + lapStartIdx - first,
    start,
    end,
  };
}
