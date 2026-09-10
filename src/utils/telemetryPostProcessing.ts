import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/types.js';

const MAX_PLAUSIBLE_SPEED_KMH = 400; // No LMU car exceeds ~370 km/h
const NEUTRAL_MAX_FRAMES = 6;

/**
 * Applies display-only denoising to a raw trajectory's points fetched from the API:
 * throttle blip filtering (downshift auto-blips, upshift ignition cuts), 3-frame speed
 * smoothing, and gear neutral-bridging / 1-frame flicker correction. Returns a new points
 * array - the input is never mutated, so cached/raw server data stays untouched. Intended
 * to be called once, right after a trajectory is fetched, before it's used anywhere else.
 */
export function applyTelemetryPostProcessing(points: ReplayTrajectoryPoint[]): ReplayTrajectoryPoint[] {
  if (points.length === 0) return points;

  const throttles = points.map(p => p.throttle ?? 0);
  const brakes = points.map(p => p.brake ?? 0);

  // 1. Remove downshift auto-blips: during active braking (brake > 8), throttle blips are zeroed out
  for (let i = 0; i < points.length; i++) {
    if (brakes[i] > 8 && throttles[i] > 0) {
      let preLow = false;
      for (let k = 1; k <= 6; k++) {
        if (i - k >= 0 && throttles[i - k] <= 15) { preLow = true; break; }
      }
      let postLow = false;
      for (let k = 1; k <= 6; k++) {
        if (i + k < points.length && throttles[i + k] <= 15) { postLow = true; break; }
      }
      if (preLow && postLow) throttles[i] = 0;
    }
  }

  // 2. Remove upshift cuts: brief dropouts (< 140ms / ~7 frames) when braking is 0 and surrounding throttle was high
  for (let i = 1; i < throttles.length - 1; i++) {
    if (throttles[i] < 70 && brakes[i] === 0) {
      let preIdx = -1;
      for (let k = 1; k <= 4; k++) {
        if (i - k >= 0 && throttles[i - k] >= 70 && brakes[i - k] === 0) { preIdx = i - k; break; }
      }
      if (preIdx !== -1) {
        let postIdx = -1;
        for (let k = 1; k <= 7; k++) {
          if (i + k < points.length && throttles[i + k] >= 70 && brakes[i + k] === 0) { postIdx = i + k; break; }
        }
        if (postIdx !== -1 && postIdx - preIdx <= 7) {
          const preVal = throttles[preIdx];
          const postVal = throttles[postIdx];
          for (let j = preIdx + 1; j < postIdx; j++) {
            const ratio = (j - preIdx) / (postIdx - preIdx);
            throttles[j] = Math.round(preVal + ratio * (postVal - preVal));
          }
          i = postIdx;
        }
      }
    }
  }

  // 3. Smooth speed over a 3-frame window, zeroing out sensor noise for stationary vehicles
  const rawSpeeds = points.map(p => Math.min(p.speedKmh ?? 0, MAX_PLAUSIBLE_SPEED_KMH));
  const speeds: number[] = [];
  for (let i = 0; i < rawSpeeds.length; i++) {
    const prev = i > 0 ? rawSpeeds[i - 1] : rawSpeeds[i];
    const cur = rawSpeeds[i];
    const next = i < rawSpeeds.length - 1 ? rawSpeeds[i + 1] : rawSpeeds[i];
    let s = (prev + cur + next) / 3;
    if (s < 1.5) s = 0;
    speeds.push(Math.round(s));
  }

  // 4. Bridge short neutral (gear 0) gaps directly to the surrounding gear, and filter
  // momentary 1-frame shift flicker.
  const gears = points.map(p => p.gear ?? 0);
  for (let i = 0; i < gears.length; i++) {
    if (gears[i] !== 0) continue;
    let j = i;
    while (j < gears.length && gears[j] === 0) j++;
    const beforeGear = i > 0 ? gears[i - 1] : undefined;
    const afterGear = j < gears.length ? gears[j] : undefined;
    if (j - i <= NEUTRAL_MAX_FRAMES && beforeGear && afterGear) {
      for (let k = i; k < j; k++) gears[k] = afterGear;
    }
    i = j;
  }
  for (let i = 1; i < gears.length - 1; i++) {
    if (gears[i] !== gears[i - 1] && gears[i - 1] === gears[i + 1]) {
      gears[i] = gears[i - 1];
    }
  }

  return points.map((p, i) => ({
    ...p,
    throttle: throttles[i],
    speedKmh: speeds[i],
    gear: gears[i],
  }));
}

/**
 * Applies `applyTelemetryPostProcessing` to a whole fetched trajectory's points. Safe to
 * call on `null`/`undefined` so it can be chained directly onto a fetch response.
 */
export function applyTelemetryPostProcessingToTrajectory<T extends ReplayTrajectoryData | null | undefined>(trajectory: T): T {
  if (!trajectory) return trajectory;
  return { ...trajectory, points: applyTelemetryPostProcessing(trajectory.points) };
}
