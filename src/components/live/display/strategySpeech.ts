import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveConnection } from '../../../api/liveStream.js';
import { racePlanView } from '../race/raceAction.js';
import { CORNER_NAMES, formatAmount } from '../race/livePlanFormat.js';
import { LIVE_TYRE_CHANGE_TREAD } from '../../../../shared/domain/live/liveInsights.js';

/** A radio call; `urgent` ones interrupt at once, the others wait for a straight. */
export interface StrategyCall { key: string; text: string; urgent?: boolean }

/** The MFD tyre setting as said on the radio: `no tyre change`, `new medium`. */
const spokenTyres = (setting: string | null | undefined): string | null => {
  if (!setting) return null;
  return /no change/i.test(setting) ? 'no tyre change' : setting.trim().toLowerCase();
};

/** Radio adds a decision or consequence; routine dashboard values stay silent. */
export function strategySpeech(snapshot: LiveSnapshot | null, connection: LiveConnection): StrategyCall | null {
  const session = snapshot?.session;
  if (!snapshot || connection !== 'live' || snapshot.lifecycle !== 'driving' || session?.kind !== 'race'
    || !session.inRealtime || session.gamePhase === 9 || !snapshot.strategy) return null;
  const view = racePlanView(snapshot);
  if (view.mode === 'calculating') return null;
  const { resource, pit, damage, tyres, fuelRatio } = snapshot.strategy;
  const race = resource?.race;
  const name = resource?.kind === 'fuel' ? 'fuel' : 'energy';
  const call = (event: string, text: string, urgent = false): StrategyCall => ({
    key: [snapshot.identity?.layoutKey, session.sessionCode, snapshot.audit?.runId, event].join('|'), text, ...(urgent ? { urgent } : {}),
  });
  if (damage?.wheel) {
    return call(`wheel-${damage.wheel.corner}-${damage.wheel.problem}`,
      `${CORNER_NAMES[damage.wheel.corner].toLowerCase()} ${damage.wheel.problem === 'flat' ? 'puncture' : 'wheel lost'}. Box now.`, true);
  }
  if (view.mode === 'in-pit' && pit?.penalties) {
    return call('penalty-service', 'Stop and go. No service on this stop.');
  }
  if (view.mode === 'in-pit') return null;
  if (view.mode === 'pit' && race?.pitInLaps === 0) {
    // The whole stop, as the MFD should read: what to load and the tyres.
    const amount = resource && race.neededAfterStop != null
      ? `${name} ${formatAmount(race.neededAfterStop, resource.unit)} ${resource.unit === 'L' ? 'litres' : 'percent'}` : null;
    const stop = [amount, spokenTyres(pit?.mfd?.tyres)].filter(Boolean).join(', ');
    return call('box-now', stop ? `Box this lap. ${stop.charAt(0).toUpperCase()}${stop.slice(1)}.` : 'Box this lap.', true);
  }
  if (view.mode === 'pit') {
    const needed = race?.neededAfterStop;
    const set = pit?.mfd?.resourceValue;
    if (needed != null && set != null && set < needed && resource) {
      const amount = `${formatAmount(needed, resource.unit)} ${resource.unit === 'L' ? 'litres' : 'percent'}`;
      return call('pit-resource-short', `Pit ${name} setting too low. Set ${amount}.`);
    }
  }
  const coverage = tyres?.coverage;
  if (coverage && coverage.projectedTread < LIVE_TYRE_CHANGE_TREAD) {
    if (view.mode === 'pit' && /no change/i.test(pit?.mfd?.tyres ?? '')) {
      return call('pit-tyres-unchanged', 'Tyres projected below fifty percent. Your pit menu is set to no change.');
    }
    return call(`tyre-coverage-${coverage.target}`,
      `Tyres projected below fifty percent before the ${coverage.target === 'finish' ? 'flag' : 'stop'}. Plan a tyre change.`);
  }
  if (view.mode === 'pit' && fuelRatio?.recommended != null && fuelRatio.mfdSetting != null
    && fuelRatio.mfdSetting < fuelRatio.recommended) {
    return call('pit-ratio-short', `Fuel ratio too low. Set ${fuelRatio.recommended.toFixed(2)}.`);
  }
  if (fuelRatio?.fuelBiasLaps != null && fuelRatio.fuelBiasLaps < 0) {
    return call('fuel-limits-energy', 'Fuel runs out before energy. Check your fuel ratio.');
  }
  if (damage?.significant && damage.lossToFinish !== null && damage.repairSeconds !== null) {
    return damage.repairSeconds >= damage.lossToFinish
      ? call('repair-exceeds-loss', 'Repairs alone cost at least as much as the projected damage loss.')
      : call('repair-below-loss', 'Repair estimate is below the projected damage loss. Pit-lane time still needs adding.');
  }
  if (view.mode === 'saving' && resource?.saving) {
    return call('saving-avoids-stop', `${resource.saving.savePercent} percent less ${name} would avoid the stop.`);
  }
  if (view.mode !== 'sprint' && race?.sparePerLap != null && race.sparePerLap < 0) {
    return call('over-budget', `${resource?.kind === 'fuel' ? 'Fuel' : 'Energy'} use too high. Save to hold our pit lap.`);
  }
  return null;
}
