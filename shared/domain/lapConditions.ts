import type { LapConditions } from '../types/index.js';

/**
 * Peak rain (raw replay value, 0-255: the engine's `raining` × 255) from which a lap counts as run in the rain. Measured over 929
 * sessions (2026-09-28): against the same driver's dry-tyre median, laps with rain 1-12 are no
 * slower (0.995-0.999), 13-16 are 2.4% slower and 17+ 9.2% slower.
 */
export const RAIN_WET_MIN = 13;

/** The weather of a replay from its peak rain (raw 0-255), as the replay list and sessions show it. */
export function replayWeatherCondition(maxRain: number): 'Dry' | 'Wet' | 'Dynamic Weather' {
  return maxRain > 16 ? 'Wet' : maxRain > 0 ? 'Dynamic Weather' : 'Dry';
}

/** Raw replay rain (0-255) as the share of full rain it is, e.g. 40 → "16%"; any rain shows at least "<1%". */
export function formatRain(raw: number): string {
  const percent = Math.round((raw / 255) * 100);
  return percent < 1 ? '<1%' : `${percent}%`;
}

/** Dry is the default; a lap with conditions is wet. */
export type LapConditionGroup = 'dry' | 'wet';

/** Peak rain of the linked replay between two session times (seconds), or null when unknown. */
export type RainOverLap = (startSec: number, endSec: number) => number | null;

interface ConditionLap {
  lapTime: number | null;
  elapsedSeconds?: number | null;
  fCompound?: string;
  rCompound?: string;
  conditions?: LapConditions;
}

const isWetCompound = (compound: string | undefined): boolean => compound === 'Wet';

/**
 * Tags each lap run on wet tyres or in the rain, and clears the tag on the others. Rain comes from
 * the session's linked replay (`rainOverLap`), timed by the lap's start (`elapsedSeconds`, the
 * XML's et) and its lap time; without a replay only the tyres are known.
 */
export function annotateLapConditions(laps: ConditionLap[], rainOverLap?: RainOverLap): void {
  for (const lap of laps) {
    const conditions: LapConditions = {};
    if (isWetCompound(lap.fCompound) || isWetCompound(lap.rCompound)) conditions.wetTyres = true;
    if (rainOverLap && typeof lap.elapsedSeconds === 'number' && typeof lap.lapTime === 'number' && lap.lapTime > 0) {
      const rain = rainOverLap(lap.elapsedSeconds, lap.elapsedSeconds + lap.lapTime);
      if (rain !== null && rain >= RAIN_WET_MIN) conditions.rain = rain;
    }
    if (conditions.wetTyres || conditions.rain !== undefined) {
      lap.conditions = conditions;
    } else {
      delete lap.conditions;
    }
  }
}

export function lapConditionGroup(lap: { conditions?: LapConditions }): LapConditionGroup {
  return lap.conditions ? 'wet' : 'dry';
}
