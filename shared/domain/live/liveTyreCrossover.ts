import type { LiveSessionKind } from '../../types/live.js';
import type { LiveTyreCrossover } from '../../types/liveStrategy.js';
import { isWetCompound, SLIGHTLY_WET_WETNESS } from '../lapConditions.js';

/** A nearby resource stop takes the tyre change instead of adding a stop. */
export const CROSSOVER_MERGE_LAPS = 3;

/** In the last laps a stop cannot pay back its time: no advice. */
export const CROSSOVER_LAST_LAPS = 2;

/**
 * Wetness steps decide; the gap between Slightly wet and Dry supplies hysteresis. Falling rain holds wets on a path still
 * dry: rain lands before the path reads Damp (Daytona 2026-11-05, both races: "slicks now" for 13-17 s on freshly fitted
 * wets, rain 0.05, until the path reached 0.05).
 */
export function tyreCrossover(input: {
  avgPathWetness: number | null | undefined;
  /** Rain now, 0..1 (the game's `raining`). */
  raining: number;
  compound: string | null;
  dryCompound: string | null;
  pitInLaps: number | null;
  /** Laps left in the race; null when unknown (the advice then stands). */
  lapsLeft: number | null;
  sessionKind: LiveSessionKind;
}): LiveTyreCrossover | null {
  const { avgPathWetness: wetness, raining, compound, dryCompound, pitInLaps, lapsLeft, sessionKind } = input;
  if (sessionKind !== 'race' || (lapsLeft !== null && lapsLeft <= CROSSOVER_LAST_LAPS) || !compound || wetness == null || !Number.isFinite(wetness) || wetness < 0 || wetness > 1) return null;
  const wet = isWetCompound(compound);
  const action = !wet && wetness >= SLIGHTLY_WET_WETNESS ? 'wets' : wet && wetness === 0 && !(raining > 0) ? 'slicks' : null;
  if (!action) return null;
  return {
    action, compound: action === 'wets' ? 'Wet' : dryCompound,
    when: pitInLaps !== null && pitInLaps <= CROSSOVER_MERGE_LAPS ? 'planned-stop' : 'now',
    reason: action === 'wets' ? 'slightly-wet' : 'dry', wetness,
  };
}
