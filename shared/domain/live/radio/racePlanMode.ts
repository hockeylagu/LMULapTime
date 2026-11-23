import type { LiveStrategy } from '../../../types/liveStrategy.js';

/** Which advice leads the race plan; the dashboard's readouts and the radio calls both follow it. */
export type RaceMode = 'calculating' | 'pit-now' | 'in-pit' | 'pit' | 'stint' | 'sprint' | 'saving';

/** The pit countdown leads from this many laps out; before that the per-lap use leads (mid-stint). */
export const PIT_LEAD_LAPS = 2;

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
  if (!crossover && saving && saving.savePercent > 0 && saving.savePercent <= 5 && resource.lapsMeasured >= 3
    && saving.source === 'measured' && !strategy?.damage && !pit?.penalties) return 'saving';
  if ((race.pitInLaps ?? 0) <= PIT_LEAD_LAPS) return 'pit';
  return 'stint';
}
