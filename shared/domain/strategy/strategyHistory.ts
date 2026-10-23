import type { SessionStrategy } from '../../types/index.js';
import type { LiveResourceKind } from '../../types/liveStrategy.js';
import { median } from '../pitStops.js';

/** The player's newest races on a layout in a class the race strategy learns from. */
export const STRATEGY_HISTORY_RACES = 5;

export interface StrategyHistoryEstimate {
  /** VE (or fuel) per lap: the median of the races of that kind; null without one. */
  perLap: number | null;
  /** Tread loss per lap of the most worn tyre on the compound: the median of those races; null without one. */
  wearPerLap: number | null;
  /** The races each figure comes from. */
  useRaces: number;
  wearRaces: number;
}

/**
 * What earlier races on the same layout in the same class measured, for a race plan made before the event has a
 * lap: the use per lap of the races run on the same resource (at least two clean laps measured), and the wear of
 * the races on the same compound (any compound only while it is unknown: a soft wears unlike a hard).
 */
export function estimateFromHistory(races: readonly SessionStrategy[], kind: LiveResourceKind, compound: string | null): StrategyHistoryEstimate {
  const use = races.flatMap(race => {
    const perLap = kind === 've' ? race.perLap.ve : race.perLap.fuel;
    return race.kind === kind && perLap !== null && race.perLap.laps >= 2 ? [perLap] : [];
  });
  const wanted = compound?.trim().toLowerCase() || null;
  const wear = races.flatMap(race => (race.tyres.wearPerLap !== null && race.tyres.wearPerLap > 0
    && (wanted === null || race.tyres.compound?.toLowerCase() === wanted) ? [race.tyres.wearPerLap] : []));
  const perLap = median(use);
  const wearPerLap = median(wear);
  return {
    perLap: perLap === null ? null : Math.round(perLap * 100) / 100,
    wearPerLap: wearPerLap === null ? null : Math.round(wearPerLap * 10000) / 10000,
    useRaces: use.length, wearRaces: wear.length,
  };
}
