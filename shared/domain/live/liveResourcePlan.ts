import type { LiveGaragePlan, LivePerLapSource, LiveRacePlan, LiveResourceKind } from '../../types/liveStrategy.js';
import { projectRaceFlagSeconds } from './liveLapsLeft.js';

/** The class names that race on virtual energy (canonical classes from `mapVehicleIdToClass`). */
const VIRTUAL_ENERGY_CLASSES = new Set(['Hyper', 'GT3']);

/** VE for GT3 and Hypercar, fuel for every other class (and an unknown one). */
export function liveResourceKind(carClass: string | null): LiveResourceKind {
  return carClass !== null && VIRTUAL_ENERGY_CLASSES.has(carClass) ? 've' : 'fuel';
}

export const resourceUnit = (kind: LiveResourceKind): '%' | 'L' => (kind === 've' ? '%' : 'L');

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
 * The resource plan of a timed race, from the current position. The reserve is kept at the pit entry and at the
 * finish (taken as the line: pit entry sits just before it on most layouts).
 * - Finish reachable when `amount - reserve * perLap` covers the `lapsLeft - lapFraction` laps still to drive;
 *   then the spare per lap is what may be used per lap on top of `perLap`, and the amount at the finish is projected.
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
  if (usable >= toFinish * perLap) {
    return {
      finishReachable: true,
      atFinish: round(amount - toFinish * perLap, 1),
      pitInLaps: null,
      pitLap: null,
      sparePerLap: toFinish > 0 ? round(usable / toFinish - perLap, 2) : null,
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
  return Math.ceil(sessionSeconds / lapSeconds) + (formationLap ? 1 : 0);
}

export interface GaragePlanInput {
  /** A race: one formation lap is run before the clock starts. */
  formationLap: boolean;
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
  const flagSeconds = sessionSeconds === null || !input.formationLap ? null
    : leaderPace !== null ? projectRaceFlagSeconds(sessionSeconds, 0, leaderPace)
      : lapSeconds !== null && lapSeconds > 0 ? sessionSeconds + lapSeconds : null;
  const laps = sessionSeconds !== null && lapSeconds !== null && sessionSeconds > 0 && lapSeconds > 0
    ? sessionLaps(flagSeconds ?? sessionSeconds, lapSeconds, input.formationLap) : null;
  const total = laps !== null && perLap !== null ? (laps + reserveLaps) * perLap : null;
  const selected = input.setInGarage;
  // A race's laps include the formation lap: deduct its estimated use before applying racing-lap numbering.
  const formation = input.formationLap ? 1 : 0;
  const firstPit = laps !== null && laps > formation && perLap !== null && Number.isFinite(perLap) && perLap > 0
    && selected !== null && Number.isFinite(selected) && selected > perLap * (formation + reserveLaps)
    ? planRace({ amount: Math.max(0, (capacity !== null ? Math.min(selected, capacity) : selected) - perLap * formation),
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
