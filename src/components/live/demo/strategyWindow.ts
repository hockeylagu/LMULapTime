import type { LivePedalSample } from '../../../../shared/types/live.js';

/** Throttle at or above this is flat out: the pedals tell a straight. */
const FULL_THROTTLE = 0.98;
/** Brake above this ends the straight. */
const BRAKING = 0.05;
/** Flat out this long after the line before the strip shows, so a lift out of the last corner does not flash it. */
const SETTLE_SECONDS = 1;
/** The demo pedals repeat one corner every 10 s and cross the line 6 s in, on the straight. */
const DEMO_LAP_SECONDS = 10;
const DEMO_LINE_SECONDS = 6;

/**
 * Whether the strategy strip takes the pedal trace's place: once per lap, on the first straight after the line, from a
 * second flat out until the first braking. The rest of the lap the trace shows.
 */
export function showsStrategy(samples: readonly LivePedalSample[], lapStart: number): boolean {
  let flatSince: number | null = null;
  let shown = false;
  for (const sample of samples) {
    if (sample.t < lapStart) continue;
    if (sample.brake > BRAKING) {
      if (shown) return false;
      flatSince = null;
    } else if (sample.throttle >= FULL_THROTTLE) {
      flatSince ??= sample.t;
      if (sample.t - flatSince >= SETTLE_SECONDS) shown = true;
    } else if (!shown) flatSince = null;
  }
  return shown;
}

/** The demo's last line crossing at or before `t`. */
export function demoLapStart(t: number): number {
  return t - ((((t - DEMO_LINE_SECONDS) % DEMO_LAP_SECONDS) + DEMO_LAP_SECONDS) % DEMO_LAP_SECONDS);
}

/** Seconds past a whole 10 s of pedals where the strategy scenarios' pedals stop: on the straight, after the line. */
export const DEMO_STRAIGHT_SECONDS = 8;
