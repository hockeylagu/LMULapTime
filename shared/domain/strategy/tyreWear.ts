import type { LiveCorner, TyreWearLap, TyreWearProfile } from '../../types/liveStrategy.js';
import { median } from '../pitStops.js';

export const TYRE_WEAR_MODEL_VERSION = 2;
const CORNERS: LiveCorner[] = ['FL', 'FR', 'RL', 'RR'];
/** A slip slope needs this many laps with at least `SLOPE_SLIP_SECONDS` of slip on the wheel. */
const SLOPE_LAPS = 5;
const SLOPE_SLIP_SECONDS = 0.5;

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Deterministic non-negative linear wear fit per wheel. Every kept lap teaches the slope; the usual laps (race, else
 * practice, else qualifying) set the expected slip, so a spin-heavy qualifying does not set the race wear. Without a
 * slope the wear is the usual laps' mean loss: their slip cost included, as the race will have it.
 */
export function fitTyreWear(input: readonly TyreWearLap[]): TyreWearProfile | null {
  const laps = input.filter(lap => lap.exclusions.length === 0);
  if (laps.length < 8 || laps.some(lap => lap.loss.length !== 4 || lap.slip.length !== 4
    || [...lap.loss, ...lap.slip].some(value => !Number.isFinite(value)) || lap.slip.some(value => value < 0))) return null;
  const usual = ['Race', 'Practice', 'Qualifying'].map(kind => laps.filter(lap => lap.sessionKind === kind)).find(rows => rows.length > 0);
  if (!usual) return null;
  const wheels = CORNERS.map((corner, index) => {
    const xs = laps.map(lap => lap.slip[index]);
    const ys = laps.map(lap => lap.loss[index]);
    const u = mean(usual.map(lap => lap.slip[index]));
    let a: number;
    let b: number | null = null;
    const xMean = mean(xs);
    const variance = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
    if (xs.filter(x => x >= SLOPE_SLIP_SECONDS).length >= SLOPE_LAPS && variance > 0) {
      const yMean = mean(ys);
      b = xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0) / variance;
      a = yMean - b * xMean;
      if (b < 0) { b = null; a = median(ys)!; }
      else if (a < 0) {
        a = 0;
        b = xs.reduce((sum, x, i) => sum + x * ys[i], 0) / xs.reduce((sum, x) => sum + x * x, 0);
      }
    } else {
      const clean = ys.filter((_, i) => xs[i] < 0.25);
      a = median(clean.length ? clean : ys)!;
    }
    const wear = b === null ? mean(usual.map(lap => lap.loss[index])) : a + b * u;
    return { corner, cleanWear: Math.max(0, a), perSlipSecond: b, usualSlip: Math.round(u * 1000) / 1000,
      wearPerLap: Math.round(Math.max(0, wear) * 100_000) / 100_000, laps: laps.length };
  });
  return { version: TYRE_WEAR_MODEL_VERSION, wheels, sessions: new Set(laps.map(lap => lap.sessionId)).size,
    laps: laps.length, gameVersions: [...new Set(laps.flatMap(lap => lap.gameVersion ? [lap.gameVersion] : []))].sort() };
}
