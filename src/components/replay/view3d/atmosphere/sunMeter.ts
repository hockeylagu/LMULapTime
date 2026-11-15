import type { SceneryClouds, ScenerySunVisibility } from '../../../../../shared/types/scenes/clouds.js';
import { meterSunVisibility, type CloudEye, type CloudSheet } from './clouds.js';

/** How far the eye moves before the sun's visibility through the clouds is measured again (m). */
export const SUN_METER_STEP_M = 25;
/** View rows measured a frame: a 64-row view takes four frames. */
export const SUN_METER_ROWS = 16;

/** The sun's visibility through a moment's clouds as the camera moves under them: measured again a few rows a frame. */
export interface SunMeter {
  /** Starts a measure once the eye moved `SUN_METER_STEP_M` from the last one's, and adds rows to a running one: the visibility when one completes, else null. */
  step(eye: CloudEye): number | null;
  /** True while a measure runs: it needs another frame. */
  readonly running: boolean;
}

/** A meter for the placed sheets and the sun (the cloud field's axes), the last measure taken from `measuredAt`. */
export function createSunMeter(rule: ScenerySunVisibility, clouds: SceneryClouds, sheets: CloudSheet[], sunDirection: [number, number, number], measuredAt: CloudEye): SunMeter {
  let from = measuredAt, measure: ((rows: number) => number | null) | null = null;
  return {
    get running() { return measure !== null; },
    step(eye) {
      if (!measure) {
        if (Math.hypot(eye[0] - from[0], eye[1] - from[1], eye[2] - from[2]) < SUN_METER_STEP_M) return null;
        from = [eye[0], eye[1], eye[2]]; measure = meterSunVisibility(rule, clouds, sheets, sunDirection, from);
      }
      const seen = measure(SUN_METER_ROWS);
      if (seen !== null) measure = null;
      return seen;
    },
  };
}
