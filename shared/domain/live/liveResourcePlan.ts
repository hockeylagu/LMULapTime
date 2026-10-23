import type { LiveGaragePlan, LivePerLapSource, LiveRacePlan, LiveResourceKind } from '../../types/liveStrategy.js';
import { projectRaceFlagSeconds } from './liveLapsLeft.js';

/** The class names that race on virtual energy (canonical classes from `resolveVehicle`). */
const VIRTUAL_ENERGY_CLASSES = new Set(['Hyper', 'GT3']);

/** VE for GT3 and Hypercar, fuel for every other class (and an unknown one). */
export function liveResourceKind(carClass: string | null): LiveResourceKind {
  return carClass !== null && VIRTUAL_ENERGY_CLASSES.has(carClass) ? 've' : 'fuel';
}

export const resourceUnit = (kind: LiveResourceKind): '%' | 'L' => (kind === 've' ? '%' : 'L');

/**
 * Laps of use the formation lap costs. VE held at 100 % from the grid to the green at Le Mans (2026-10-22 and
 * 2026-10-23, first drop after the green); fuel is not yet measured on a fuel class, so a full lap is kept.
 */
export const formationLapUse = (kind: LiveResourceKind): number => (kind === 've' ? 0 : 1);

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;
/** What to set on the MFD or in the garage: up to a whole percent or litre, never below what is needed. */
const settable = (value: number): number => Math.ceil(value - 1e-9);

export interface RacePlanInput {
  amount: number;
  perLap: number;
  reserveLaps: number;
  /** Full tank in the same unit; null when unknown (then no cap and no further stops are worked out). */
  capacity: number | null;
  /** Race laps left counting the lap in progress (`computeLapsLeft`). */
  lapsLeft: number;
  /** Share of the lap in progress already driven, 0..1. */
  lapFraction: number;
  /** The racing lap in progress. */
  lapNumber: number;
}

/**
 * The resource plan of a timed race, from the current position. The reserve is kept at the pit entry and in what a
 * stop loads, never at the finish: a car that reaches the flag needs no stop (Le Mans race 2026-10-22: a stop was
 * called on the last lap with 11 % VE for a 7.8 % lap, the car finished with 3 %).
 * - Finish reachable when `amount` covers the `lapsLeft - lapFraction` laps still to drive; then the spare per lap is
 *   what may be used per lap on top of `perLap`, and the amount at the finish is projected.
 * - Otherwise the pit lap is the last line the amount reaches with the reserve: `floor(lapFraction + amount/perLap - reserve)`
 *   crossings from now (at least this lap's). The spare per lap is then against that crossing, and the amount needed
 *   after the stop covers the laps after it plus the reserve, capped at a full tank; a cap means more stops.
 * - Either way, the amount needed after a stop at the end of this lap covers the laps after this one plus the
 *   reserve: what an unplanned stop (damage, an early stop) must load, more than the planned stop when it is later.
 */
export function planRace(input: RacePlanInput): LiveRacePlan {
  const { amount, perLap, reserveLaps, capacity, lapsLeft, lapFraction, lapNumber } = input;
  const fraction = Math.min(Math.max(lapFraction, 0), 1);
  const usable = amount - reserveLaps * perLap;
  const toFinish = Math.max(lapsLeft - fraction, 0);
  const neededFor = (lapsAfter: number): number => {
    const need = (lapsAfter + reserveLaps) * perLap;
    return settable(capacity !== null ? Math.min(need, capacity) : need);
  };
  const neededStopNow = neededFor(Math.max(lapsLeft - 1, 0));
  if (amount >= toFinish * perLap) {
    return {
      finishReachable: true,
      atFinish: round(amount - toFinish * perLap, 1),
      pitInLaps: null,
      pitLap: null,
      sparePerLap: toFinish > 0 ? round(amount / toFinish - perLap, 2) : null,
      neededAfterStop: null,
      neededStopNow,
      stopsAfterNext: 0,
    };
  }
  const crossings = Math.floor(fraction + usable / perLap);
  const pitInLaps = Math.max(0, crossings - 1);
  const toPit = pitInLaps + 1 - fraction;
  const lapsAfter = Math.max(lapsLeft - (pitInLaps + 1), 0);
  const fullTankLaps = capacity !== null ? (capacity - reserveLaps * perLap) / perLap : null;
  return {
    finishReachable: false,
    atFinish: null,
    pitInLaps,
    pitLap: lapNumber + pitInLaps,
    sparePerLap: toPit > 0 ? round(usable / toPit - perLap, 2) : null,
    neededAfterStop: neededFor(lapsAfter),
    neededStopNow,
    stopsAfterNext: fullTankLaps !== null && fullTankLaps > 0 ? Math.max(0, Math.ceil(lapsAfter / fullTankLaps) - 1) : 0,
  };
}

/**
 * Laps of a timed session: the laps started before the clock ends (the out lap of practice or qualifying is one of
 * them), plus the formation lap of a race, run before its clock starts.
 */
export function sessionLaps(sessionSeconds: number, lapSeconds: number, formationLap: boolean): number {
  // A flag projected at whole laps of the same pace divides back to a whole number: no rounding lap on top.
  return settable(sessionSeconds / lapSeconds) + (formationLap ? 1 : 0);
}

export interface GaragePlanInput {
  /** A formation lap is still to run before the clock starts (a race before its clock runs). */
  formationLap: boolean;
  /** A race (ends at the leader's flag); `formationLap` when absent. False with a formation lap left is not a case. */
  race?: boolean;
  /** Race only: overall leader pace predicts the flag, then the player's class pace converts that horizon to laps. */
  raceLeaderLapSeconds?: number | null;
  kind: LiveResourceKind;
  sessionSeconds: number | null;
  lapSeconds: number | null;
  perLap: number | null;
  perLapSource: LivePerLapSource | null;
  lapsMeasured: number;
  reserveLaps: number;
  capacity: number | null;
  setInGarage: number | null;
}

/** What to load in the garage for the loaded session: its laps and the reserve, capped at a full tank. */
export function planGarage(input: GaragePlanInput): Omit<LiveGaragePlan, 'tyres'> {
  const { kind, sessionSeconds, lapSeconds, perLap, capacity, reserveLaps } = input;
  // A race ends at the overall leader's first crossing after the clock. Without the leader's pace, plan for the latest
  // that can be, one of our laps after the clock: the bare clock can leave the car a lap short.
  const leaderPace = input.raceLeaderLapSeconds != null && input.raceLeaderLapSeconds > 0 ? input.raceLeaderLapSeconds : null;
  const flagSeconds = sessionSeconds === null || !(input.race ?? input.formationLap) ? null
    : leaderPace !== null ? projectRaceFlagSeconds(sessionSeconds, 0, leaderPace)
      : lapSeconds !== null && lapSeconds > 0 ? sessionSeconds + lapSeconds : null;
  const laps = sessionSeconds !== null && lapSeconds !== null && sessionSeconds > 0 && lapSeconds > 0
    ? sessionLaps(flagSeconds ?? sessionSeconds, lapSeconds, input.formationLap) : null;
  // A race's laps include the formation lap: deduct its estimated use before applying racing-lap numbering.
  const formation = input.formationLap ? 1 : 0;
  const formationUse = input.formationLap ? formationLapUse(kind) : 0;
  const total = laps !== null && perLap !== null ? (laps - formation + formationUse + reserveLaps) * perLap : null;
  const selected = input.setInGarage;
  const firstPit = laps !== null && laps > formation && perLap !== null && Number.isFinite(perLap) && perLap > 0
    && selected !== null && Number.isFinite(selected) && selected > perLap * (formationUse + reserveLaps)
    ? planRace({ amount: Math.max(0, (capacity !== null ? Math.min(selected, capacity) : selected) - perLap * formationUse),
      perLap, reserveLaps, capacity, lapsLeft: laps - formation, lapFraction: 0, lapNumber: 1 }) : null;
  return {
    kind,
    unit: resourceUnit(kind),
    sessionMinutes: sessionSeconds !== null ? Math.round(sessionSeconds / 60) : null,
    laps,
    lapSeconds,
    perLap: input.perLap,
    perLapSource: input.perLapSource,
    lapsMeasured: input.lapsMeasured,
    reserveLaps,
    needed: total === null ? null : settable(capacity !== null ? Math.min(total, capacity) : total),
    stops: total === null || capacity === null || capacity <= 0 ? null : Math.max(0, Math.ceil(total / capacity) - 1),
    setInGarage: input.setInGarage,
    firstPitLap: firstPit?.pitLap ?? null,
  };
}
