import type { LiveGarageTyres, LiveRaceStrategies, LiveRaceStrategy, LiveResourceKind, TyreWheelValues } from '../../types/liveStrategy.js';
import { CORNERS } from '../live/liveCarCondition.js';
import { LIVE_TYRE_TREAD_FLOOR } from '../live/liveInsights.js';
import { formationLapUse, planGarage, planRace } from '../live/liveResourcePlan.js';
import type { RefuelPart } from '../live/livePitTime.js';

export interface RaceStrategyInput {
  kind: LiveResourceKind;
  /** The race length set for the event (`GetSessionsInfoForEvent`). */
  raceMinutes: number | null;
  lapSeconds: number | null;
  perLap: number | null;
  reserveLaps: number;
  capacity: number | null;
  /** Qualifying is current, or the weekend schedules it after practice: reserve its new set before the race. */
  qualifyingAhead: boolean;
  /** The set selected in the garage and the new sets left. */
  tyres: LiveGarageTyres | null;
  /** The compound the wear was measured on, else the selected one. */
  compound: string | null;
  /** Tread loss per lap in FL, FR, RL, RR order; null before wear is known. */
  wearPerLap: TyreWheelValues | null;
  /** The game's time to change four tyres (`FourTireChange`); it adds to the refuel. */
  tyreChangeSeconds: number | null;
  /** The stored pit lane loss of the layout and class; null without one (then the stops take no time off the clock). */
  pitLaneSeconds: number | null;
  /** The game's refuel rate and fixed part; null without the pit rules. */
  refuel: Omit<RefuelPart, 'added'> | null;
}

type Option = LiveRaceStrategy & { lowest: number | null };

const settable = (value: number): number => Math.ceil(value - 1e-9);

/**
 * The race plan the garage shows before the race, deterministic. The VE (or fuel) sets the stops: the fewest a full
 * tank allows, full at the start when there is a stop and the finish's need at the last one, or only the race's need
 * without a stop. The tyres are then weighed: keep the starting set to the flag, or fit a new set at every stop, the
 * four-tyre time added to the stop (LMU adds it to the refuel). The chosen plan is the quickest whose tread stays
 * above the floor at every change and at the flag; the other is the next best, its cost in tyre time.
 * The race runs to the leader's first crossing after the clock at the given pace, every car making the same stops:
 * their time (lane loss and refuel) comes off the clock, often a lap (Le Mans race 2026-10-23: 19 laps planned
 * without it, 17 run). The formation lap costs no VE (`formationLapUse`).
 * Not modelled: the pace of fresh tyres or a lighter car, two-tyre changes, an extra stop to save VE.
 */
export function planRaceStrategies(input: RaceStrategyInput): LiveRaceStrategies | null {
  const { kind, raceMinutes, lapSeconds, perLap, reserveLaps, capacity, tyres } = input;
  if (raceMinutes === null || raceMinutes <= 0 || lapSeconds === null || perLap === null || perLap <= 0 || capacity === null) return null;
  const garageFor = (stopsSeconds: number) => planGarage({ kind, sessionSeconds: raceMinutes * 60 - stopsSeconds, race: true,
    formationLap: true, raceLeaderLapSeconds: lapSeconds, lapSeconds, perLap, perLapSource: null, lapsMeasured: 0, reserveLaps, capacity,
    setInGarage: null });
  const formationUse = formationLapUse(kind) * perLap;
  // The stops' time: the lane and fixed refuel part each, and what they add (the racing laps and the reserve past a full start).
  const stopsSeconds = (laps: number | null, stops: number | null): number => (laps === null || !stops || input.pitLaneSeconds === null ? 0
    : stops * (input.pitLaneSeconds + (input.refuel?.base ?? 0))
      + Math.max(0, (laps - 1 + reserveLaps) * perLap + formationUse - capacity) * (input.refuel?.secondsPerUnit ?? 0));
  const bare = garageFor(0);
  const timed = stopsSeconds(bare.laps, bare.stops) > 0 ? garageFor(stopsSeconds(bare.laps, bare.stops)) : bare;
  // Fewer stops would give back their time: keep the stops the clock needs without it.
  const garage = timed.stops === bare.stops ? timed : bare;
  if (garage.laps === null || garage.needed === null || garage.stops === null) return null;
  const laps = garage.laps - 1;
  const loadStart = garage.stops > 0 ? capacity : garage.needed;
  // The formation lap runs on the start load: the racing laps start with what it leaves. The stops are the race
  // plan's (the reserve kept at every pit entry), each a full tank after the one before.
  const race = garage.stops > 0 ? planRace({ amount: loadStart - formationUse, perLap, reserveLaps, capacity, lapsLeft: laps, lapFraction: 0, lapNumber: 1 }) : null;
  const first = race?.pitLap ?? null;
  const stops = first === null ? 0 : 1 + race!.stopsAfterNext;
  const tankLaps = Math.max(1, Math.floor(capacity / perLap - reserveLaps));
  const pits = first === null ? [] : Array.from({ length: stops }, (_, index) => first + index * tankLaps);
  const lastStop = pits.at(-1);
  const loadToFinish = lastStop === undefined ? null : settable(Math.min(capacity, (laps - lastStop + reserveLaps) * perLap));

  const compound = (input.compound || tyres?.compound || '').toUpperCase();
  const named = (state: string) => (compound ? `${state} ${compound}` : state);
  // Qualifying takes a new set first; in the race's own garage the selected set is the one the race starts on.
  const raceSets = Math.max(0, (tyres?.newSets ?? 0) - (input.qualifyingAhead ? 1 : 0));
  const startNew = input.qualifyingAhead || !tyres ? raceSets > 0 : !tyres.used;
  const startTread = CORNERS.map((_, index) => startNew ? 1 : tyres?.tread?.[index] ?? tyres?.wear ?? 1);
  const setsAtStops = raceSets - (startNew ? 1 : 0);
  const stints = [...pits, laps].map((lap, index, ends) => lap - (index ? ends[index - 1] : 0));
  const wear = input.wearPerLap;

  const plan = (change: boolean): Option => {
    // The tread at each set's last lap: one set over the whole race, or a new one from every stop.
    const treads = wear === null ? null : change
      ? stints.map((stint, index) => wear.map((loss, wheel) => (index ? 1 : startTread[wheel]) - loss * stint))
      : [wear.map((loss, wheel) => startTread[wheel] - loss * laps)];
    const flag = treads?.at(-1) ?? null;
    return {
      name: stops === 0 ? 'NO STOP' : change ? `NEW TYRES AT ${stops === 1 ? 'THE STOP' : 'EACH STOP'}` : 'NO TYRE CHANGE',
      stops, pitLap: pits[0] ?? null, loadStart, loadToFinish,
      tyresStart: named(startNew ? 'NEW' : 'USED'),
      tyresStop: stops === 0 ? null : change ? named('NEW') : 'NO CHANGE',
      treadAtFlag: flag === null ? null : Math.round(Math.max(0, Math.min(...flag)) * 1000) / 1000,
      treadCorner: flag === null ? null : CORNERS[flag.indexOf(Math.min(...flag))],
      gapSeconds: input.tyreChangeSeconds === null ? null : (change ? stops : 0) * input.tyreChangeSeconds,
      lowest: treads === null ? null : Math.min(...treads.flat()),
    };
  };
  const options = stops > 0 && setsAtStops >= stops ? [plan(false), plan(true)] : [plan(false)];
  // Unknown wear passes: the tread shows unknown and the driver judges it. When none holds, the most tread left wins.
  const holds = (option: Option) => option.lowest === null || option.lowest >= LIVE_TYRE_TREAD_FLOOR;
  const [chosen, next] = [...options].sort((a, b) => Number(holds(b)) - Number(holds(a))
    || (holds(a) ? (a.gapSeconds ?? 0) - (b.gapSeconds ?? 0) : (b.lowest ?? 0) - (a.lowest ?? 0)));
  const strategy = ({ lowest: _lowest, ...option }: Option, gapSeconds: number | null): LiveRaceStrategy => ({ ...option, gapSeconds });
  const nextGap = next && next.gapSeconds !== null && chosen.gapSeconds !== null ? Math.round((next.gapSeconds - chosen.gapSeconds) * 10) / 10 : null;
  return { kind, unit: garage.unit, raceMinutes, laps, chosen: strategy(chosen, 0), nextBest: next ? strategy(next, nextGap) : null };
}
