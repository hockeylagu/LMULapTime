import type { LiveGaragePlan, LivePerLapSource, LiveRacePlan, LiveResourceKind } from '../../types/liveStrategy.js';

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
 */
export function planRace(input: RacePlanInput): LiveRacePlan {
  const { amount, perLap, reserveLaps, capacity, lapsLeft, lapFraction, lapNumber } = input;
  const fraction = Math.min(Math.max(lapFraction, 0), 1);
  const usable = amount - reserveLaps * perLap;
  const toFinish = Math.max(lapsLeft - fraction, 0);
  if (usable >= toFinish * perLap) {
    return {
      finishReachable: true,
      atFinish: round(amount - toFinish * perLap, 1),
      pitInLaps: null,
      pitLap: null,
      sparePerLap: toFinish > 0 ? round(usable / toFinish - perLap, 2) : null,
      neededAfterStop: null,
      stopsAfterNext: 0,
    };
  }
  const crossings = Math.floor(fraction + usable / perLap);
  const pitInLaps = Math.max(0, crossings - 1);
  const toPit = pitInLaps + 1 - fraction;
  const lapsAfter = Math.max(lapsLeft - (pitInLaps + 1), 0);
  const need = (lapsAfter + reserveLaps) * perLap;
  const fullTankLaps = capacity !== null ? (capacity - reserveLaps * perLap) / perLap : null;
  return {
    finishReachable: false,
    atFinish: null,
    pitInLaps,
    pitLap: lapNumber + pitInLaps,
    sparePerLap: toPit > 0 ? round(usable / toPit - perLap, 2) : null,
    neededAfterStop: settable(capacity !== null ? Math.min(need, capacity) : need),
    stopsAfterNext: fullTankLaps !== null && fullTankLaps > 0 ? Math.max(0, Math.ceil(lapsAfter / fullTankLaps) - 1) : 0,
  };
}

/** Laps of a timed session: the laps started before the clock ends, plus the out lap (or the formation lap in a race). */
export function sessionLaps(sessionSeconds: number, lapSeconds: number): number {
  return Math.ceil(sessionSeconds / lapSeconds) + 1;
}

export interface GaragePlanInput {
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
  const laps = sessionSeconds !== null && lapSeconds !== null && sessionSeconds > 0 && lapSeconds > 0
    ? sessionLaps(sessionSeconds, lapSeconds) : null;
  const total = laps !== null && perLap !== null ? (laps + reserveLaps) * perLap : null;
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
  };
}
