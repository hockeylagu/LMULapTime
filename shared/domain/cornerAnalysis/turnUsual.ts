import { median } from '../pitStops.js';
import type { CornerPass } from '../../types/corners/cornerPasses.js';

/** Signed metres from `from` to `to` the short way round the lap: positive when `to` is further along. */
export function lapGapM(from: number, to: number, lengthM: number): number {
  let gap = to - from;
  if (gap > lengthM / 2) gap -= lengthM;
  if (gap < -lengthM / 2) gap += lengthM;
  return gap;
}

export const passSec = (pass: CornerPass): number => pass.exitSec - pass.entrySec;
export const toApexSec = (pass: CornerPass): number | null => (pass.minSpeedSec === null ? null : pass.minSpeedSec - pass.entrySec);
export const fromApexSec = (pass: CornerPass): number | null => (pass.minSpeedSec === null ? null : pass.exitSec - pass.minSpeedSec);

const present = (values: ReadonlyArray<number | null>): number[] => values.filter((value): value is number => value !== null);
const medianOf = (values: ReadonlyArray<number | null>): number | null => median(present(values));

/** The median of lap distances, measured round the first one so a point near the line does not split across it. */
function medianPointM(values: ReadonlyArray<number | null>, lengthM: number): number | null {
  const known = present(values);
  if (!known.length) return null;
  const anchor = known[0];
  return anchor + (median(known.map(value => lapGapM(anchor, value, lengthM))) ?? 0);
}

/** The most common value; ties go to the lower one. */
function modeOf(values: ReadonlyArray<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const value of present(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  for (const [value, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0) || (count === counts.get(best) && value < best)) best = value;
  }
  return best;
}

/** How a driver usually drives one turn: the medians of their counted passes. */
export interface TurnUsual {
  laps: number;
  sec: number;
  toApexSec: number | null;
  fromApexSec: number | null;
  entryKmh: number | null;
  minKmh: number | null;
  exitKmh: number | null;
  minSpeedM: number | null;
  /** The usual brake point among the passes that brake, and the share that brake at all. */
  brakeM: number | null;
  brakeShare: number;
  peakBrake: number | null;
  /** The usual time braking among the passes that brake (s). */
  brakeSec: number | null;
  partThrottleSec: number | null;
  absSec: number;
  gear: number | null;
  coastSec: number;
  /** The lap-to-lap spread of the turn time (s): the median absolute deviation scaled to a standard deviation. */
  spreadSec: number;
}

export function turnUsual(passes: readonly CornerPass[], lengthM: number): TurnUsual | null {
  if (!passes.length) return null;
  const secs = passes.map(passSec);
  const sec = median(secs) ?? 0;
  return {
    laps: passes.length,
    sec,
    toApexSec: medianOf(passes.map(toApexSec)),
    fromApexSec: medianOf(passes.map(fromApexSec)),
    entryKmh: medianOf(passes.map(pass => pass.entrySpeedKmh)),
    minKmh: medianOf(passes.map(pass => pass.minSpeedKmh)),
    exitKmh: medianOf(passes.map(pass => pass.exitSpeedKmh)),
    minSpeedM: medianPointM(passes.map(pass => pass.minSpeedM), lengthM),
    brakeM: medianPointM(passes.map(pass => pass.brakeM), lengthM),
    brakeShare: passes.filter(pass => pass.brakeM !== null).length / passes.length,
    peakBrake: medianOf(passes.map(pass => pass.peakBrake)),
    brakeSec: medianOf(passes.map(pass => (pass.brakeM === null ? null : pass.brakeSec))),
    partThrottleSec: medianOf(passes.map(pass => pass.partThrottleSec)),
    absSec: medianOf(passes.map(pass => pass.absSec)) ?? 0,
    gear: modeOf(passes.map(pass => pass.minSpeedGear)),
    coastSec: medianOf(passes.map(pass => pass.coastSec)) ?? 0,
    spreadSec: 1.4826 * (median(secs.map(value => Math.abs(value - sec))) ?? 0),
  };
}
