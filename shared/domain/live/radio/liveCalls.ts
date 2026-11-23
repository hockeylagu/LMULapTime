import type { LiveSnapshot } from '../../../types/live.js';
import type { LiveCorner, LiveDeployment } from '../../../types/liveStrategy.js';
import { LIVE_TYRE_CHANGE_TREAD } from '../liveInsights.js';
import { racePlanMode } from './racePlanMode.js';

/** P1 interrupts at once; P2 and P3 wait for a slot after the line or on a straight, and P3 has a budget per lap. */
export type LiveCallPriority = 1 | 2 | 3;
export type LiveCallFamily = 'strategy' | 'damage' | 'deployment' | 'incident' | 'traffic' | 'clock';

/** A radio call the engine proposes; the scheduler decides whether and when it is said. */
export interface LiveCall {
  /** Stable while the call means the same thing; a new key is a new call. */
  key: string;
  text: string;
  priority: LiveCallPriority;
  family: LiveCallFamily;
  /** How long a P2/P3 may wait for its slot before it no longer helps; the scheduler's default without it. */
  waitSeconds?: number;
  /** A P2/P3 said without waiting for a slot, after anything playing: the moment comes before a slot would (traffic). */
  immediate?: boolean;
}

const SPOKEN_CORNERS: Record<LiveCorner, string> = { FL: 'Front left', FR: 'Front right', RL: 'Rear left', RR: 'Rear right' };

/** What a stop loads, as set in the pit menu: whole percent of VE, litres to one decimal; the unit is left out. */
const spokenSetting = (value: number, unit: '%' | 'L'): string => (unit === '%' ? `${Math.round(value)}` : value.toFixed(1));

/** The MFD tyre setting as said on the radio: `no tyre change`, `new medium`. */
const spokenTyres = (setting: string | null | undefined): string | null => {
  if (!setting) return null;
  return /no change/i.test(setting) ? 'no tyre change' : setting.trim().toLowerCase();
};

/** "Set deployment 40." in kW from the plugin, else the game's map position; null unless a new target is advised. */
export function deploymentText(deployment: LiveDeployment | null | undefined): string | null {
  if (!deployment || deployment.settlingLaps > 0) return null;
  const { current, target } = deployment;
  if (current === null || target === null || target === current) return null;
  return deployment.unit === 'kW' ? `Set deployment ${target}.` : `Set deployment map ${target}.`;
}

/**
 * Every call that applies to a snapshot, most important first: radio adds a decision or consequence, routine dashboard
 * values stay silent. The scheduler says the first one not yet said, so a call heard once lets the next one through.
 * Strategy calls only in a race; the deployment call in practice too. Only while driving in realtime and not paused;
 * on the race's first lap only P1 calls. Keys carry the run and session, so a new run never inherits an old call;
 * calls that hold for a whole stop carry the stop, so a moving value does not repeat them.
 */
export function liveCalls(snapshot: LiveSnapshot | null): LiveCall[] {
  const session = snapshot?.session;
  if (!snapshot || snapshot.lifecycle !== 'driving' || !session || !session.inRealtime || session.gamePhase === 9
    || !snapshot.strategy) return [];
  const strategy = snapshot.strategy;
  const calls: LiveCall[] = [];
  const call = (event: string, text: string, priority: LiveCallPriority, family: LiveCallFamily = 'strategy', waitSeconds?: number) => calls.push({
    key: [snapshot.identity?.layoutKey, session.sessionCode, snapshot.audit?.runId, event].join('|'), text, priority, family,
    ...(waitSeconds !== undefined ? { waitSeconds } : {}),
  });
  const mode = racePlanMode(strategy);
  const inPit = mode === 'in-pit';
  const deployment = deploymentText(strategy.deployment);
  // Once per target; dropped after 30 s (the advice comes a lap before the edge, and moves with every reading).
  if (deployment && !inPit && (session.kind === 'race' || session.kind === 'practice')) {
    call(`deployment-${strategy.deployment!.current}-${strategy.deployment!.target}`, deployment, 2, 'deployment', 30);
  }
  clockCalls(snapshot, call);
  if (session.kind !== 'race' || mode === 'calculating') return firstLap(session, calls);
  const { resource, pit, damage, tyres, fuelRatio } = strategy;
  const race = resource?.race;
  const name = resource?.kind === 'fuel' ? 'fuel' : 'energy';
  const stop = race?.stopsAfterNext ?? 0;
  if (damage?.wheel) {
    call(`wheel-${damage.wheel.corner}-${damage.wheel.problem}`,
      `${SPOKEN_CORNERS[damage.wheel.corner]} ${damage.wheel.problem === 'flat' ? 'puncture' : 'wheel lost'}. Box this lap.`, 1, 'damage');
  }
  // Once per penalty: the count going up is a new one.
  if (pit?.penalties && !inPit) call(`penalty-${pit.penalties}`, 'Penalty pending.', 1);
  if (inPit) {
    // The penalty type is not known live: the wording stays neutral.
    if (pit?.penalties) call('penalty-service', 'Penalty. No service on this stop.', 1);
    return firstLap(session, calls);
  }
  if (mode === 'pit' && race?.pitInLaps === 0) {
    // The whole stop, as the MFD should read: what to load and the tyres.
    const amount = resource && race.neededAfterStop != null
      ? `${name} ${spokenSetting(race.neededAfterStop, resource.unit)}${resource.unit === '%' ? ' percent' : ' litres'}` : null;
    const load = [amount, spokenTyres(pit?.mfd?.tyres)].filter(Boolean).join(', ');
    call(`box-now-${stop}`, load ? `Box this lap. ${load.charAt(0).toUpperCase()}${load.slice(1)}.` : 'Box this lap.', 1);
  }
  if (mode === 'pit' && (race?.pitInLaps === 1 || race?.pitInLaps === 2)) {
    call(`box-in-${race.pitInLaps}-${stop}`, race.pitInLaps === 2 ? 'Box in 2 laps.' : 'Box next lap.', 2);
  }
  if (mode === 'pit') {
    const needed = race?.neededAfterStop;
    const set = pit?.mfd?.resourceValue;
    if (needed != null && set != null && set < needed && resource) {
      call(`pit-resource-short-${stop}`, `Pit menu ${name} too low. Set ${spokenSetting(needed, resource.unit)}.`, 2);
    }
    if (fuelRatio?.recommended != null && fuelRatio.mfdSetting != null && fuelRatio.mfdSetting < fuelRatio.recommended) {
      call(`pit-ratio-short-${stop}`, `Fuel ratio too low. Set ${fuelRatio.recommended.toFixed(2)}.`, 2);
    }
  }
  const coverage = tyres?.coverage;
  if (coverage && coverage.projectedTread < LIVE_TYRE_CHANGE_TREAD) {
    if (mode === 'pit' && /no change/i.test(pit?.mfd?.tyres ?? '')) {
      call(`pit-tyres-unchanged-${stop}`, 'Pit menu has no tyre change. Set new tyres.', 2);
    } else {
      call(`tyre-coverage-${coverage.target}-${stop}`, `Tyres won't reach the ${coverage.target === 'finish' ? 'flag' : 'stop'}. Plan a change.`, 3);
    }
  }
  if (fuelRatio?.fuelBiasLaps != null && fuelRatio.fuelBiasLaps < 0) {
    call('fuel-limits-energy', 'Fuel runs out before energy. Check your fuel ratio.', 2);
  }
  if (damage?.significant && damage.lossToFinish !== null && damage.repairSeconds !== null) {
    // LMU's repair estimate against our measured loss to the flag; staying out is said only when the repair alone costs more.
    const what = damage.suspension ? 'Suspension damage' : 'Damage';
    const verdict = damage.repairSeconds >= damage.lossToFinish ? ' Stay out.' : '';
    call(`damage-${Math.round(damage.repairSeconds)}`,
      `${what}. Repair ${Math.round(damage.repairSeconds)} seconds, costs ${Math.round(damage.lossToFinish)} to the flag.${verdict}`, 2, 'damage');
  }
  if (mode === 'saving' && resource?.saving) {
    call(`saving-avoids-stop-${stop}`, `Save ${Math.max(1, Math.ceil(resource.saving.savePercent))} percent to skip the stop.`, 3);
  }
  // Not on the box lap: holding the pit lap means nothing once the stop is now (Le Mans 2026-10-22, 10-23).
  if (mode !== 'sprint' && race?.sparePerLap != null && race.sparePerLap < 0 && race.pitInLaps !== 0) {
    const hold = race.pitLap != null ? `Save to hold lap ${race.pitLap}.` : 'Save to hold our pit lap.';
    call(`over-budget-${stop}`, `${resource?.kind === 'fuel' ? 'Fuel' : 'Energy'} use too high. ${hold}`, 3);
  }
  return firstLap(session, calls);
}

/** Ten minutes left in a race. */
const TEN_MINUTES = 600;

/**
 * The session clock: "Ten minutes." and "Last lap." in a race (P3); in qualifying, at each line, whether the lap
 * started leaves time for one more (P2), from the player's session best.
 */
function clockCalls(snapshot: LiveSnapshot, call: (event: string, text: string, priority: LiveCallPriority, family: LiveCallFamily) => void): void {
  const session = snapshot.session!;
  const left = session.endSeconds === null ? null : session.endSeconds - session.elapsedSeconds;
  if (session.kind === 'race') {
    if (left !== null && left <= TEN_MINUTES && left > TEN_MINUTES - 60) call('ten-minutes', 'Ten minutes.', 3, 'clock');
    if (snapshot.lapsLeft?.laps === 1) call('last-lap', 'Last lap.', 3, 'clock');
    return;
  }
  const pace = snapshot.sessionBest?.lapSeconds ?? null;
  const lap = session.playerLapsCompleted;
  if (session.kind !== 'qualifying' || left === null || pace === null || !lap || snapshot.strategy?.pit?.state !== 'none') return;
  // A lap started before the clock runs out still counts; only the next one would not start.
  if (left < pace) call(`quali-lap-${lap}`, 'No time for another lap.', 2, 'clock');
  else if (left < 2 * pace) call(`quali-lap-${lap}`, 'Time for one more lap.', 2, 'clock');
}

/** On the race's first lap only P1 calls speak; then the most urgent first, keeping the order within a priority. */
function firstLap(session: { kind: string | null; playerLapsCompleted: number | null }, calls: LiveCall[]): LiveCall[] {
  const kept = session.kind === 'race' && session.playerLapsCompleted === 0 ? calls.filter(call => call.priority === 1) : calls;
  return kept.map((call, index) => ({ call, index })).sort((a, b) => a.call.priority - b.call.priority || a.index - b.index).map(({ call }) => call);
}
