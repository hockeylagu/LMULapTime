import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { computeVehicleDynamics } from './computedTelemetry.js';
import { getSteerAngleDeg } from '../../shared/domain/formatters.js';

const MAX_PLAUSIBLE_SPEED_KMH = 400; // No LMU car exceeds ~370 km/h

// Every filter window is a duration, never a sample count: the server downsamples each lap to
// a fixed number of points, so one sample is ~40 ms on a short lap and ~100 ms at Le Mans, and
// a frame-count window would mean a different filter on every track and at every resolution.
// A run of a single sample is shorter than the recording can resolve, so it always counts as
// short. Points without timestamps (synthetic data) fall back to the 50 Hz frame the windows
// were first tuned on.
const FALLBACK_FRAME_SEC = 0.02;
// Downshift rev-match blips under braking last ~0.1-0.25 s.
const BLIP_MAX_SEC = 0.3;
// Upshift ignition cuts last ~0.05-0.15 s.
const UPSHIFT_CUT_MAX_SEC = 0.15;
// Neutral shows for one or two frames during a paddle shift.
const NEUTRAL_MAX_SEC = 0.25;
// Speed is averaged over +/- this long around each sample.
const SPEED_SMOOTHING_HALF_WINDOW_SEC = 0.08;

const BLIP_BRAKE_PCT = 8;
const BLIP_LOW_THROTTLE_PCT = 15;
const CUT_HIGH_THROTTLE_PCT = 70;

/** Sample times in seconds, from `timeSec` when every point has a usable one. */
function sampleTimes(points: ReplayTrajectoryPoint[]): number[] {
  const times = points.map(p => p.timeSec);
  const usable = times.every((t): t is number => typeof t === 'number' && Number.isFinite(t))
    && times.length > 1 && (times[times.length - 1] as number) > (times[0] as number);
  return usable ? (times as number[]) : points.map((_, i) => i * FALLBACK_FRAME_SEC);
}

/**
 * Whether samples i..j form a run no longer than maxSec. The run spans from halfway to the
 * sample before it to halfway to the sample after it; a single sample is always short.
 */
function isShortRun(times: number[], i: number, j: number, maxSec: number): boolean {
  if (i === j) return true;
  const start = i > 0 ? (times[i - 1] + times[i]) / 2 : times[i];
  const end = j < times.length - 1 ? (times[j] + times[j + 1]) / 2 : times[j];
  return end - start <= maxSec;
}

/**
 * Mean of the linearly interpolated trace over [t - h, t + h] around each sample, h being
 * halfWindowSec shrunk near the ends of the recording so the window stays centred (a one-sided
 * window would bias the first and last values). Averaging the interpolated trace rather than a fixed
 * number of neighbours keeps the smoothing the same at every sample spacing.
 */
function timeAveraged(values: number[], times: number[], halfWindowSec: number): number[] {
  const n = values.length;
  // Integral of the trace from t = times[0] up to sample k.
  const cumArea = new Array<number>(n).fill(0);
  for (let k = 1; k < n; k++) cumArea[k] = cumArea[k - 1] + ((values[k - 1] + values[k]) / 2) * (times[k] - times[k - 1]);
  const areaUpTo = (t: number, near: number): number => {
    let k = near;
    while (k > 0 && times[k] > t) k--;
    while (k < n - 1 && times[k + 1] <= t) k++;
    if (k >= n - 1) return cumArea[n - 1];
    const span = times[k + 1] - times[k];
    const f = span > 0 ? (t - times[k]) / span : 0;
    const vAtT = values[k] + f * (values[k + 1] - values[k]);
    return cumArea[k] + ((values[k] + vAtT) / 2) * (t - times[k]);
  };
  return values.map((v, i) => {
    const h = Math.min(halfWindowSec, times[i] - times[0], times[n - 1] - times[i]);
    return h > 1e-9 ? (areaUpTo(times[i] + h, i) - areaUpTo(times[i] - h, i)) / (2 * h) : v;
  });
}

/** Calls fn(i, j) for every maximal run of consecutive indices where pred holds. */
function forEachRun(length: number, pred: (i: number) => boolean, fn: (i: number, j: number) => void): void {
  for (let i = 0; i < length; i++) {
    if (!pred(i)) continue;
    let j = i;
    while (j + 1 < length && pred(j + 1)) j++;
    fn(i, j);
    i = j;
  }
}

/**
 * Applies display-only denoising to a raw trajectory's points fetched from the API:
 * throttle blip filtering (downshift auto-blips, upshift ignition cuts), speed smoothing, and gear neutral-bridging / 1-frame flicker correction. Returns a new points
 * array - the input is never mutated, so cached/raw server data stays untouched. Intended
 * to be called once, right after a trajectory is fetched, before it's used anywhere else.
 */
export function applyTelemetryPostProcessing(points: ReplayTrajectoryPoint[]): ReplayTrajectoryPoint[] {
  if (points.length === 0) return points;

  const times = sampleTimes(points);
  const throttles = points.map(p => p.throttle ?? 0);
  const brakes = points.map(p => p.brake ?? 0);

  // 1. Remove downshift auto-blips: under braking, throttle is zeroed unless it belongs to a
  // throttle application (> 15%) lasting longer than a blip - e.g. deliberate overlap.
  forEachRun(throttles.length, i => throttles[i] > BLIP_LOW_THROTTLE_PCT, (i, j) => {
    const isBlip = i > 0 && j < throttles.length - 1 && isShortRun(times, i, j, BLIP_MAX_SEC);
    if (!isBlip) return;
    for (let k = i; k <= j; k++) if (brakes[k] > BLIP_BRAKE_PCT) throttles[k] = 0;
  });
  for (let i = 0; i < throttles.length; i++) {
    if (brakes[i] > BLIP_BRAKE_PCT && throttles[i] > 0 && throttles[i] <= BLIP_LOW_THROTTLE_PCT) throttles[i] = 0;
  }

  // 2. Bridge upshift ignition cuts: a short dip below 70% with no brake, between two samples
  // of high throttle, is interpolated across so the trace keeps the driver's full throttle.
  const isHighThrottle = (i: number) => throttles[i] >= CUT_HIGH_THROTTLE_PCT && brakes[i] === 0;
  forEachRun(throttles.length, i => throttles[i] < CUT_HIGH_THROTTLE_PCT && brakes[i] === 0, (i, j) => {
    const pre = i - 1;
    const post = j + 1;
    if (pre < 0 || post >= throttles.length || !isHighThrottle(pre) || !isHighThrottle(post)) return;
    if (!isShortRun(times, i, j, UPSHIFT_CUT_MAX_SEC)) return;
    const span = times[post] - times[pre];
    for (let k = i; k <= j; k++) {
      const ratio = span > 0 ? (times[k] - times[pre]) / span : (k - pre) / (post - pre);
      throttles[k] = Math.round(throttles[pre] + ratio * (throttles[post] - throttles[pre]));
    }
  });

  // 3. Smooth speed over a short time window, zeroing out sensor noise for stationary vehicles
  const rawSpeeds = points.map(p => Math.min(p.speedKmh ?? 0, MAX_PLAUSIBLE_SPEED_KMH));
  const speeds = timeAveraged(rawSpeeds, times, SPEED_SMOOTHING_HALF_WINDOW_SEC).map(s => (s < 1.5 ? 0 : Math.round(s)));

  // 4. Bridge short neutral (gear 0) gaps directly to the surrounding gear, and filter
  // momentary single-sample shift flicker.
  const gears = points.map(p => p.gear ?? 0);
  forEachRun(gears.length, i => gears[i] === 0, (i, j) => {
    const beforeGear = i > 0 ? gears[i - 1] : undefined;
    const afterGear = j < gears.length - 1 ? gears[j + 1] : undefined;
    if (beforeGear && afterGear && isShortRun(times, i, j, NEUTRAL_MAX_SEC)) {
      for (let k = i; k <= j; k++) gears[k] = afterGear;
    }
  });
  for (let i = 1; i < gears.length - 1; i++) {
    if (gears[i] !== gears[i - 1] && gears[i - 1] === gears[i + 1]) {
      gears[i] = gears[i - 1];
    }
  }

  const denoisedPoints: ReplayTrajectoryPoint[] = points.map((p, i) => ({
    ...p,
    throttle: throttles[i],
    speedKmh: speeds[i],
    gear: gears[i],
    steerYaw: getSteerAngleDeg(p.steerYaw),
  }));

  // 5. Compute vehicle dynamics: longitudinal & lateral G, combined G, slip angle, understeer/oversteer, and tire slip
  return computeVehicleDynamics(denoisedPoints);
}

/**
 * Applies `applyTelemetryPostProcessing` to a whole fetched trajectory's points. Safe to
 * call on `null`/`undefined` so it can be chained directly onto a fetch response.
 */
export function applyTelemetryPostProcessingToTrajectory<T extends ReplayTrajectoryData | null | undefined>(trajectory: T): T {
  if (!trajectory) return trajectory;
  return { ...trajectory, points: applyTelemetryPostProcessing(trajectory.points) };
}
