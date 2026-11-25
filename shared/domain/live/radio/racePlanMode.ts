import type { LiveStrategy } from '../../../types/liveStrategy.js';

/** Which advice leads the race plan; the dashboard's readouts and the radio calls both follow it. */
export type RaceMode = 'calculating' | 'pit-now' | 'in-pit' | 'pit' | 'stint' | 'sprint' | 'saving';

/** The pit countdown leads from this many laps out; before that the per-lap use leads (mid-stint). */
export const PIT_LEAD_LAPS = 2;

/**
 * Short of the flag by a saving up to this share of the use per lap, the plan is to save, not to stop: about what the
 * driver saved with lift and coast on a last lap (Le Mans race 2026-11-24: 8.5 % VE against 9.33 %, about 2 s slower;
 * 10 % is the driver's call), far less than a splash costs. No stop is then planned, nor taken for the leader (`LiveSessionTracker`): the planned stop moved
 * the flag a lap and laps left switched 5 <-> 6 with the stop and box calls on and off (same race, 2-6 % short).
 */
export const SAVE_TO_FINISH_MAX_PERCENT = 10;

/** One deterministic choice from the strategy only, in order: a wheel problem, the pit lane, then the plan. */
export function racePlanMode(strategy: LiveStrategy | null): RaceMode {
  const resource = strategy?.resource ?? null;
  const race = resource?.race ?? null;
  const pit = strategy?.pit ?? null;
  const crossover = strategy?.crossover ?? null;
  if (strategy?.damage?.wheel) return 'pit-now';
  if (pit && (pit.state === 'entering' || pit.state === 'stopped')) return 'in-pit';
  if (crossover?.when === 'now') return 'pit';
  if (!resource || !race || resource.perLap === null) return 'calculating';
  if (race.finishReachable && !crossover) return 'sprint';
  const saving = resource.saving;
  // A display cutoff for a modest scenario, not a claim that the saving is achievable.
  if (!crossover && saving && saving.savePercent > 0 && saving.savePercent <= SAVE_TO_FINISH_MAX_PERCENT && resource.lapsMeasured >= 3
    && saving.source === 'measured' && !strategy?.damage && !pit?.penalties) return 'saving';
  if ((race.pitInLaps ?? 0) <= PIT_LEAD_LAPS) return 'pit';
  return 'stint';
}
