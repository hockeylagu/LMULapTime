import type {
  CornerPass, CornerPassCar, CornerPassLap, CornerTurn, SessionCornerPasses,
} from '../../../../shared/types/corners/cornerPasses.js';
import { computeMetricStat } from '../../../utils/cornerConsistency.js';

/** A session's corner passes as served (built for the current version). */
export type BuiltCornerPasses = Extract<SessionCornerPasses, { available: true }>;

/** Fewer counted passes than this in the conditions: no usual, no class best ("–"). */
export const MIN_USUAL_PASSES = 3;
/** A pass with a car closer than this in front is marked as traffic (marked, still counted). */
const TRAFFIC_GAP_SEC = 1;

/**
 * Which passes set a car's usual and its class's best: racing laps by the parser's flags, lap 1 left out,
 * and laps left out for contact or off pace; laps tagged for traffic count ("it's a race, not a hotlap"). One rule for
 * every session type. Marks on the strip only explain; the lap-level clean average still leaves traffic laps out.
 */
export function lapCounts(lap: CornerPassLap | undefined): boolean {
  if (!lap || lap.lapNumber <= 1 || !lap.isValid || lap.isPitStop || lap.isOutLap) return false;
  return lap.nonRepresentativeReason !== 'contact' && lap.nonRepresentativeReason !== 'offPace';
}

const passTime = (pass: CornerPass) => pass.exitSec - pass.entrySec;
const groupKey = (lap: CornerPassLap | undefined) => (lap?.wet ? 'wet' : 'dry');

function median(values: number[]): number | null {
  if (values.length < MIN_USUAL_PASSES) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A car's usual way through one turn in one condition: the medians of its counted passes. */
interface Usual {
  timeSec: number | null;
  /** From the entry to the slowest point, and from it to the exit. */
  entrySec: number | null;
  exitSec: number | null;
  brakeM: number | null;
  minSpeedKmh: number | null;
  throttleM: number | null;
  /** Its fastest counted pass. */
  best: CornerPass | null;
  /** How far its counted pass times spread: their standard deviation (the Consistency panel's measure). */
  spreadSec: number | null;
}

/** A car's usual through a turn against the fastest usual of another car in its class. */
export interface ClassGap {
  segment: number;
  /** Positive: the car loses this much a pass to the class's fastest usual. */
  deltaSec: number;
  slot: number;
}

/** The session's passes, indexed for the card: built once per response, read every clock tick. */
export interface CornerInsightIndex {
  data: BuiltCornerPasses;
  /** The turn (or the car's class sequence) a pass of the car's went through. */
  turnOf(slot: number, segment: number): CornerTurn | undefined;
  cars: Map<number, CornerPassCar>;
  laps: Map<string, CornerPassLap>;
  /** Each car's passes in time order. */
  passes: Map<number, CornerPass[]>;
  /** Contact times per car, in time order. */
  contacts: Map<number, number[]>;
  usual(slot: number, segment: number, wet: boolean): Usual;

  /** The car's turns (its class's sequences) against its class, the most time lost first. */
  classGaps(slot: number, wet: boolean): ClassGap[];
}

const lapKey = (slot: number, lapNumber: number) => `${slot}|${lapNumber}`;
// A sequence's id is its first turn's: unique within its class only. An official turn has no class.
const turnKey = (carClass: string | undefined, id: number) => `${carClass ?? ''}|${id}`;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

export function indexCornerInsight(data: BuiltCornerPasses): CornerInsightIndex {
  const laps = new Map(data.laps.map(lap => [lapKey(lap.slot, lap.lapNumber), lap]));
  const cars = new Map(data.cars.map(car => [car.slot, car]));
  const passes = new Map<number, CornerPass[]>();
  const counted = new Map<string, CornerPass[]>();

  for (const pass of [...data.passes].sort((a, b) => a.entrySec - b.entrySec)) {
    pushTo(passes, pass.slot, pass);
    const lap = laps.get(lapKey(pass.slot, pass.lapNumber));
    if (!lapCounts(lap)) continue;
    pushTo(counted, `${pass.slot}|${pass.segment}|${groupKey(lap)}`, pass);

  }
  const contacts = new Map<number, number[]>();
  for (const contact of [...data.contacts].sort((a, b) => a.timeSec - b.timeSec)) pushTo(contacts, contact.slot, contact.timeSec);

  const turns = new Map(data.turns.map(turn => [turnKey(turn.sequence?.carClass, turn.id), turn]));
  const turnOf = (slot: number, segment: number) =>
    turns.get(turnKey(cars.get(slot)?.carClass, segment)) ?? turns.get(turnKey(undefined, segment));
  const usuals = new Map<string, Usual>();
  const usual = (slot: number, segment: number, wet: boolean): Usual => {
    const key = `${slot}|${segment}|${wet ? 'wet' : 'dry'}`;
    let found = usuals.get(key);
    if (!found) {
      const list = counted.get(key) ?? [];
      const of = (value: (pass: CornerPass) => number | null) => median(list.flatMap(pass => { const v = value(pass); return v === null ? [] : [v]; }));
      const enough = list.length >= MIN_USUAL_PASSES;
      found = {
        timeSec: of(passTime),
        entrySec: of(p => (p.minSpeedSec === null ? null : p.minSpeedSec - p.entrySec)),
        exitSec: of(p => (p.minSpeedSec === null ? null : p.exitSec - p.minSpeedSec)),
        brakeM: of(p => p.brakeM), minSpeedKmh: of(p => p.minSpeedKmh), throttleM: of(p => p.throttleM),
        best: enough ? list.reduce((a, b) => (passTime(b) < passTime(a) ? b : a)) : null,
        spreadSec: enough ? computeMetricStat(list.map(pass => ({ lapNumber: pass.lapNumber, value: passTime(pass) })))?.stdDev ?? null : null,
      };
      usuals.set(key, found);
    }
    return found;
  };

  const gaps = new Map<string, ClassGap[]>();
  const classGaps = (slot: number, wet: boolean): ClassGap[] => {
    const key = `${slot}|${wet ? 'wet' : 'dry'}`;
    let found = gaps.get(key);
    if (!found) {
      const carClass = cars.get(slot)?.carClass;
      const rivals = data.cars.filter(car => car.slot !== slot && car.carClass === carClass);
      const ownTurns = data.turns.filter(turn => !turn.sequence || turn.sequence.carClass === carClass);
      found = ownTurns.flatMap(turn => {
        const own = usual(slot, turn.id, wet).timeSec;
        if (own === null) return [];
        let fastest: { slot: number; timeSec: number } | null = null;
        for (const rival of rivals) {
          const timeSec = usual(rival.slot, turn.id, wet).timeSec;
          if (timeSec !== null && (!fastest || timeSec < fastest.timeSec)) fastest = { slot: rival.slot, timeSec };
        }
        return fastest ? [{ segment: turn.id, deltaSec: own - fastest.timeSec, slot: fastest.slot }] : [];
      }).sort((a, b) => b.deltaSec - a.deltaSec);
      gaps.set(key, found);
    }
    return found;
  };
  return { data, turnOf, cars, laps, passes, contacts, usual, classGaps };
}

/** A pass's marks on the strip: where it happened, not whether it counts. */
export interface PassMarks {
  start: boolean;
  pitLane: boolean;
  traffic: boolean;
  incident: boolean;
  wet: boolean;
  invalid: boolean;
}

/** One cell of the corner's strip: a lap's pass against the usual. */
export interface StripCell {
  lapNumber: number;
  entrySec: number;
  timeSec: number;
  /** Against the usual of its own condition; null without one. */
  deltaSec: number | null;
  counts: boolean;
  current: boolean;
  /** The car stopped in the pits on this lap: a divider follows the cell. */
  pitAfter: boolean;
  marks: PassMarks;
}

/** A value of the pass against the car's usual. */
export interface Compared {
  value: number;
  /** Value minus the usual; null without one. */
  delta: number | null;
}

/** Against the class's fastest usual: how much, where in the corner, and what that car does differently (its usual minus the car's). */
export interface Gain {
  deltaSec: number;
  carNumber?: string;
  name: string;
  rank: number;
  of: number;
  /** The gap split at the slowest point: positive is time to find on the way in, or out. */
  entrySec: number | null;
  exitSec: number | null;
  /** The faster car's points: positive brakes or gets on the throttle later along the lap, carries more minimum speed. */
  brakeM: number | null;
  minSpeedKmh: number | null;
  throttleM: number | null;
}

/** What the card shows at a moment: the followed car's pass through the turn it is in. */
export interface CornerInsight {
  turn: CornerTurn;
  lapNumber: number;
  counts: boolean;
  marks: PassMarks;
  /** Time since the turn's entry at the moment shown: where the car is in the pass, with the replay. */
  elapsedSec: number;
  time: Compared;
  minSpeed: Compared | null;
  /** Usual pass time in the conditions, its spread (standard deviation), and the car's best pass with its lap. */
  usualSec: number | null;
  spreadSec: number | null;
  best: { timeSec: number; lapNumber: number } | null;
  /**
   * The potential gain: the car's usual against the fastest usual of another car in its class (positive: time to find),
   * that car, and this turn's place among the car's turns by time to find.
   */
  gain: Gain | null;
  /** Against the compare lap's pass through the same turn; null without a compare lap or a pass of it here. */
  versus: Versus | null;
  strip: StripCell[];
}

/** The compare lap: its session's passes, its car and its lap number. */
export interface CompareLap {
  index: CornerInsightIndex;
  slot: number;
  lapNumber: number;
}

/** The pass against the compare lap's pass through the turn. */
export interface Versus {
  carNumber?: string;
  name: string;
  lapNumber: number;
  timeSec: number;
  /** This pass minus the compare pass: positive is slower. */
  timeDelta: number;
  minSpeedDelta: number | null;
  /** The gap split at each pass's slowest point: positive is time lost on the way in, or out. */
  entrySec: number | null;
  exitSec: number | null;
  /** The compare pass's points against this one (as Gain): positive brakes or gets on the throttle later, carries more minimum speed. */
  brakeM: number | null;
  minSpeedKmh: number | null;
  throttleM: number | null;
}

function marksOf(index: CornerInsightIndex, pass: CornerPass, lap: CornerPassLap | undefined): PassMarks {
  const contacts = index.contacts.get(pass.slot) ?? [];
  return {
    start: pass.lapNumber <= 1,
    pitLane: Boolean(lap?.isPitStop || lap?.isOutLap),
    traffic: pass.aheadGapSec !== null && pass.aheadGapSec < TRAFFIC_GAP_SEC,
    incident: contacts.some(t => t >= pass.entrySec && t <= pass.exitSec),
    wet: Boolean(lap?.wet),
    invalid: lap ? !lap.isValid : false,
  };
}

const compare = (value: number, usual: number | null): Compared => ({ value, delta: usual === null ? null : value - usual });

/** The pass the car is in (or last left) at `timeSec`: the last one it entered. */
export function currentPass(index: CornerInsightIndex, slot: number, timeSec: number): CornerPass | null {
  const list = index.passes.get(slot);
  if (!list?.length || list[0].entrySec > timeSec) return null;
  let lo = 0, hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].entrySec <= timeSec) lo = mid; else hi = mid - 1;
  }
  return list[lo];
}

/**
 * The card at `timeSec` for the car in `slot`: its whole pass through the turn it is in, from the entry (driver,
 * 2026-11-18: the next turn starts at this one's exit, so a value shown once driven was gone as it appeared): the time
 * and minimum speed against its usual, and the gain to find against its class (driver: "the time, the potential gain,
 * the minimum speed").
 */
export function cornerInsightAt(index: CornerInsightIndex, slot: number, timeSec: number, compareLap?: CompareLap | null): CornerInsight | null {
  const pass = currentPass(index, slot, timeSec);
  const turn = pass && index.turnOf(slot, pass.segment);
  if (!pass || !turn) return null;
  const lap = index.laps.get(lapKey(slot, pass.lapNumber));
  const wet = Boolean(lap?.wet);
  const usual = index.usual(slot, pass.segment, wet);
  return {
    turn,
    lapNumber: pass.lapNumber,
    counts: lapCounts(lap),
    marks: marksOf(index, pass, lap),
    elapsedSec: Math.min(Math.max(timeSec - pass.entrySec, 0), passTime(pass)),
    time: compare(passTime(pass), usual.timeSec),
    minSpeed: pass.minSpeedKmh === null ? null : compare(pass.minSpeedKmh, usual.minSpeedKmh),
    usualSec: usual.timeSec,
    spreadSec: usual.spreadSec,
    best: usual.best ? { timeSec: passTime(usual.best), lapNumber: usual.best.lapNumber } : null,
    gain: gainOf(index, slot, pass.segment, wet),
    versus: compareLap ? versusOf(index, pass, turn, compareLap) : null,
    strip: stripOf(index, slot, pass),
  };
}

const minSpeedAt = (pass: CornerPass, from: 'entry' | 'exit') =>
  pass.minSpeedSec === null ? null : from === 'entry' ? pass.minSpeedSec - pass.entrySec : pass.exitSec - pass.minSpeedSec;

const heldTurns = (turn: CornerTurn) => (turn.sequence?.turnIds ?? [turn.id]).join(',');

/**
 * The compare lap's pass through the same turn of the same layout (turn ids are the layout's, across sessions); for a
 * sequence, one holding the same turns (another class's map, or a regenerated one, may group them otherwise).
 */
function versusOf(index: CornerInsightIndex, pass: CornerPass, turn: CornerTurn, other: CompareLap): Versus | null {
  if (other.index.data.layoutKey !== index.data.layoutKey) return null;
  const theirs = other.index.passes.get(other.slot)?.find(p => p.lapNumber === other.lapNumber && p.segment === pass.segment);
  const theirTurn = theirs && other.index.turnOf(other.slot, theirs.segment);
  if (!theirs || !theirTurn || heldTurns(theirTurn) !== heldTurns(turn)) return null;
  const car = other.index.cars.get(other.slot);
  return {
    carNumber: car?.carNumber, name: car?.name ?? '', lapNumber: theirs.lapNumber,
    timeSec: passTime(theirs), timeDelta: passTime(pass) - passTime(theirs),
    minSpeedDelta: minus(pass.minSpeedKmh, theirs.minSpeedKmh),
    entrySec: minus(minSpeedAt(pass, 'entry'), minSpeedAt(theirs, 'entry')),
    exitSec: minus(minSpeedAt(pass, 'exit'), minSpeedAt(theirs, 'exit')),
    brakeM: minus(theirs.brakeM, pass.brakeM), minSpeedKmh: minus(theirs.minSpeedKmh, pass.minSpeedKmh), throttleM: minus(theirs.throttleM, pass.throttleM),
  };
}

/** The car's passes through the turn over the session, a cell per lap. */
function stripOf(index: CornerInsightIndex, slot: number, current: CornerPass): StripCell[] {
  return (index.passes.get(slot) ?? []).filter(pass => pass.segment === current.segment).map(pass => {
    const lap = index.laps.get(lapKey(slot, pass.lapNumber));
    const usual = index.usual(slot, pass.segment, Boolean(lap?.wet)).timeSec;
    return {
      lapNumber: pass.lapNumber,
      entrySec: pass.entrySec,
      timeSec: passTime(pass),
      deltaSec: usual === null ? null : passTime(pass) - usual,
      counts: lapCounts(lap),
      current: pass === current,
      pitAfter: Boolean(lap?.isPitStop),
      marks: marksOf(index, pass, lap),
    };
  });
}

/** The replay clock at a lap view's sample: the lap's start on the replay clock plus the sample's lap time. */
export function lapClockToReplay(index: CornerInsightIndex, slot: number, lapNumber: number, lapSec: number): number | null {
  const lap = index.laps.get(lapKey(slot, lapNumber));
  return lap ? lap.startSec + lapSec : null;
}

/**
 * The card of a lap view, which shows one lap: its passes only, so a sample just short of the line (the lap's first)
 * shows the lap's first turn, not the previous lap's last, and one past the line its last turn, not the next lap's
 * first. A lap without passes has no card.
 */
export function lapInsightAt(index: CornerInsightIndex, slot: number, lapNumber: number, timeSec: number, compareLap?: CompareLap | null): CornerInsight | null {
  const own = index.passes.get(slot)?.filter(pass => pass.lapNumber === lapNumber) ?? [];
  if (!own.length) return null;
  const clamped = Math.min(Math.max(timeSec, own[0].entrySec), own[own.length - 1].entrySec);
  return cornerInsightAt(index, slot, clamped, compareLap);
}

const minus = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

function gainOf(index: CornerInsightIndex, slot: number, segment: number, wet: boolean): Gain | null {
  const gaps = index.classGaps(slot, wet);
  const at = gaps.findIndex(gap => gap.segment === segment);
  if (at < 0) return null;
  const rival = index.cars.get(gaps[at].slot);
  const own = index.usual(slot, segment, wet), fast = index.usual(gaps[at].slot, segment, wet);
  return {
    deltaSec: gaps[at].deltaSec, carNumber: rival?.carNumber, name: rival?.name ?? '', rank: at + 1, of: gaps.length,
    entrySec: minus(own.entrySec, fast.entrySec), exitSec: minus(own.exitSec, fast.exitSec),
    brakeM: minus(fast.brakeM, own.brakeM), minSpeedKmh: minus(fast.minSpeedKmh, own.minSpeedKmh), throttleM: minus(fast.throttleM, own.throttleM),
  };
}