import type { GarageCheck } from '../liveScreens.js';
import type { PlanReadout } from '../race/raceAction.js';
import type { StrategyCall } from '../display/strategySpeech.js';

/** The next stop as one MFD setup: the lap, the VE to load (null: none, `NO VE`), the tyres, and which of them changed. */
export interface DemoStopCall {
  lap: number;
  ve: number | null;
  /** In the game's words (`NEW MED`, `NO CHANGE`); the compound takes its sidewall colour. */
  tyres: string;
  changed: 've' | 'tyres';
}

/** The tentative tyre plan: the qualifying set before the race, a change of plan in the race. Sample data only. */
export interface DemoTyrePlan {
  /** Why the plan changed, in a few words a driver reads at speed. */
  reason?: string;
  /** In the race, after a change of plan: the next stop's call. */
  next?: DemoStopCall;
  /** The garage TYRES row, as the plan would set it. */
  check?: Pick<GarageCheck, 'compound' | 'target' | 'current' | 'action' | 'note'>;
  /**
   * In the race, by cell label: the tyre cell carries the call for the next stop (and a change of plan), the MFD
   * tyre cell is checked against it. Merged into the cell the race plan already shows.
   */
  cells?: Record<string, Partial<PlanReadout>>;
  /** In practice, where the checklist is the practice run: the set qualifying takes, beside the race plan. */
  quali?: string;
  /** The plan for a car without a soft (GT3: medium and wet). */
  noSoft?: Pick<DemoTyrePlan, 'check' | 'quali'>;
}

/** Before qualifying: the soft for qualifying when the car has one (the race strategy is the real engine's). */
const QUALI_CHECK: Pick<DemoTyrePlan, 'check' | 'noSoft'> = {
  check: { compound: 'MEDIUM', target: 'NEW SOFT', current: 'NEW', action: { text: 'FIT SOFT', tone: 'change' } },
  noSoft: { check: { compound: 'MEDIUM', target: 'NEW MED', current: 'NEW', action: { text: 'OK', tone: 'ok' } } },
};

export const DEMO_TYRE_PLANS: Record<string, DemoTyrePlan> = {
  race: { cells: { TYRES: { note: 'MFD · NEW MEDIUM', compoundNote: true } } },
  'pit-three': { cells: { TYRES: { note: 'MFD · NEW MEDIUM', compoundNote: true } } },
  'strategy-changed': {
    reason: 'TYRES WEARING FAST',
    next: { lap: 19, ve: 72, tyres: 'NEW MED', changed: 'tyres' },
    cells: { TYRES: { note: 'MFD · NEW MEDIUM', compoundNote: true, detail: 'PLAN CHANGED', detailTone: 'warn' } },
  },
  // Using less VE per lap than planned: the stop moves two laps and needs less, the tyres stand.
  'strategy-changed-ve': {
    reason: 'USING LESS VE',
    next: { lap: 21, ve: 58, tyres: 'NO CHANGE', changed: 've' },
    cells: { 'PIT IN': { detail: 'PLAN CHANGED', detailTone: 'warn' }, TYRES: { note: 'MFD · NO CHANGE' } },
  },
  'tyre-strategy-quali': QUALI_CHECK,
};

/** The plan for the demo's class: a car without a soft (GT3: medium and wet) takes the plan's `noSoft` part. */
export function demoTyrePlanFor(id: string, carClass: string): DemoTyrePlan | undefined {
  const plan = DEMO_TYRE_PLANS[id] as DemoTyrePlan | undefined;
  return plan?.noSoft && carClass !== 'Hyper' ? { ...plan, ...plan.noSoft } : plan;
}

/** The plan change on the radio, the whole stop as the strip shows it: `Plan change. Using less energy. Box lap 21, …`. */
export function planChangeCall(reason: string | undefined, next: DemoStopCall): StrategyCall {
  const tyres = /no change/i.test(next.tyres) ? 'no tyre change' : next.tyres.toLowerCase().replace(/\bmed\b/, 'medium');
  const energy = next.ve === null ? 'no energy' : `energy ${next.ve} percent`;
  const why = reason ? ` ${reason.charAt(0)}${reason.slice(1).toLowerCase().replace(/\bve\b/, 'energy')}.` : '';
  return { key: `demo-plan|${next.lap}|${next.ve}|${next.tyres}`, text: `Plan change.${why} Box lap ${next.lap}, ${energy}, ${tyres}.` };
}
