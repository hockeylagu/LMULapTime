import type { SpeedTurningPoint } from './speedTurningPoints.js';

/** Bumped when the map rule changes: every map is rebuilt from its laps. */
export const SEQUENCE_MAP_VERSION = 5;

/** A turn as the map reads it: its id and apex, metres from the start line. */
export interface SequenceTurn {
  id: number;
  apexM: number;
}

/** One lap's speed turning points, distances in metres from the start line (a lap may run a little past either end). */
export interface SequenceLap {
  points: ReadonlyArray<SpeedTurningPoint & { speedKmh: number }>;
}

export interface MapSequence {
  /** The official turns it holds, in driving order (ids). */
  turnIds: number[];
  /** Turns past the dip, on the exit straight (taken flat): held, but not what the sequence is called by. */
  exitTurnIds: number[];
  /** Where the speed starts to drop for it: the median speed peak before its first turn (metres from the start line). */
  startM: number;
  /** The slowest point, median over the laps (metres from the start line). */
  minM: number;
  /** How far the laps' own starts sit from startM: median and largest (metres). */
  startSpreadM: { median: number; max: number };
  /** Laps that had a start for it. */
  lapCount: number;
}

export interface SequenceMap {
  version: number;
  lengthM: number;
  lapCount: number;
  sequences: MapSequence[];
  /** Per turn (by position in the turn list): how many laps drive it and the next turn as one corner. */
  joinVotes: number[];
  /** Per turn: the median share of the speed lost into it that comes back before the next turn (0 when one corner). */
  recovered: number[];
}

/** A turn after the slowest point by more than this is on the exit straight, not part of what the driver brakes for. */
const EXIT_TURN_M = 150;

/**
 * Two turns are one braking zone (a chicane, esses) when less than this share of the speed lost into the first comes
 * back before the second. Measured 2026-11-19 over 47 maps: chicanes regain 1-20% (Monza's first chicane 3%, Spa's
 * Bus Stop 4-8%, Interlagos' S 12%), separate corners 40% and more (Indianapolis to Arnage 41-46%).
 */
const JOIN_RECOVERED_SHARE = 1 / 3;

const mod = (value: number, lengthM: number) => ((value % lengthM) + lengthM) % lengthM;
/** Metres from `from` forward to `to` on the lap (0..lengthM). */
const ahead = (from: number, to: number, lengthM: number) => mod(to - from, lengthM);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How much of the speed lost braking into the first turn comes back before the second: the largest share over the
 * speed peaks between their apexes (0 without a peak: one corner; 1 when it all comes back). A chicane regains little
 * (Spa's Bus Stop: about 15 of 180 km/h); a lift between two corners comes after the speed came back (Raidillon).
 * The points are taken in track order up to the second apex, so a pair across the start line reads the dip at the
 * lap's end.
 */
function recoveredBetween(lap: SequenceLap, fromM: number, toM: number, lengthM: number): number {
  const span = ahead(fromM, toM, lengthM);
  // Track order ending at the second apex: the first apex sits at lengthM - span.
  const placed = lap.points.map(point => ({ ...point, at: ahead(toM, mod(point.distM, lengthM), lengthM) || lengthM }))
    .sort((a, b) => a.at - b.at);
  return Math.max(0, ...placed.map((peak, i) => {
    if (peak.type !== 'max' || peak.at <= lengthM - span || peak.at >= lengthM) return 0;
    const dipIndex = placed.slice(0, i).findLastIndex(point => point.type === 'min');
    const approach = dipIndex > 0 ? placed.slice(0, dipIndex).findLast(point => point.type === 'max') : undefined;
    if (dipIndex < 0 || !approach || approach.speedKmh <= placed[dipIndex].speedKmh) return 1;
    return (peak.speedKmh - placed[dipIndex].speedKmh) / (approach.speedKmh - placed[dipIndex].speedKmh);
  }));
}

/**
 * The class's sequences on a layout from its fastest laps: two neighbouring turns join when most laps have no speed
 * peak between their apexes (one corner). A sequence starts at the median speed peak before its first turn and ends
 * where the next starts. Laps and turns are in the start line's frame; the lap wraps at lengthM.
 */
export function buildSequenceMap(turns: readonly SequenceTurn[], laps: readonly SequenceLap[], lengthM: number): SequenceMap {
  const shares = turns.map((turn, index) => {
    const next = turns[(index + 1) % turns.length];
    return laps.map(lap => recoveredBetween(lap, turn.apexM, next.apexM, lengthM));
  });
  const joinVotes = shares.map(each => each.filter(share => share < JOIN_RECOVERED_SHARE).length);
  const joined = joinVotes.map(votes => votes * 2 > laps.length);
  const recovered = laps.length ? shares.map(median) : [];
  const empty: SequenceMap = { version: SEQUENCE_MAP_VERSION, lengthM, lapCount: laps.length, sequences: [], joinVotes, recovered };
  if (turns.length === 0 || laps.length === 0) return empty;
  // A sequence starting before the previous one's slowest point is the same corner: half the laps drove the pair as one
  // (Silverstone National's Maggotts, 5 votes of 10, an 11 m sequence of 0.165 s). The pair joins, until none overlaps.
  let sequences = sequencesOf(turns, laps, lengthM, joined);
  for (let overlap = overlappingTurn(sequences, turns, lengthM); overlap >= 0; overlap = overlappingTurn(sequences, turns, lengthM)) {
    joined[overlap] = true;
    sequences = sequencesOf(turns, laps, lengthM, joined);
  }
  return { ...empty, sequences };
}

/** The turn (by position) a sequence starting before the previous one's slowest point should join on from; -1 when none does. */
function overlappingTurn(sequences: readonly MapSequence[], turns: readonly SequenceTurn[], lengthM: number): number {
  const ordered = sequences.toSorted((a, b) => a.startM - b.startM);
  if (ordered.length < 2) return -1;
  const overlapping = ordered.findIndex((sequence, i) => {
    const next = ordered[(i + 1) % ordered.length];
    return ahead(sequence.startM, next.startM, lengthM) < ahead(sequence.startM, sequence.minM, lengthM);
  });
  if (overlapping < 0) return -1;
  const nextFirst = turns.findIndex(turn => turn.id === ordered[(overlapping + 1) % ordered.length].turnIds[0]);
  return (nextFirst - 1 + turns.length) % turns.length;
}

/** The sequences of the runs of joined turns (`joined[i]`: turn i and the next are one corner). */
function sequencesOf(turns: readonly SequenceTurn[], laps: readonly SequenceLap[], lengthM: number, joined: readonly boolean[]): MapSequence[] {
  // Runs of joined turns, starting after a split (the first turn may join the last one across the line).
  const firstSplit = joined.findIndex(join => !join);
  const runs: number[][] = [];
  if (firstSplit < 0) runs.push(turns.map((_, index) => index));
  else {
    let run: number[] = [];
    for (let k = 1; k <= turns.length; k++) {
      const index = (firstSplit + k) % turns.length;
      run.push(index);
      if (!joined[index]) { runs.push(run); run = []; }
    }
  }
  const sequences = runs.map((run, runIndex): MapSequence | null => {
    const first = turns[run[0]];
    const last = turns[run[run.length - 1]];
    const previousLast = turns[runs[(runIndex - 1 + runs.length) % runs.length].at(-1)!];
    // Each lap, measured on from the previous sequence's last apex. Its start: the last speed peak before the first
    // turn's apex that the speed then drops from for real, at least half the largest drop after a peak there. A
    // hairpin taken in two dips picks up speed in its middle (Sebring School: 12 km/h, against 108 from the approach).
    const origin = previousLast.apexM;
    const firstAt = runs.length > 1 ? ahead(origin, first.apexM, lengthM) : lengthM;
    const lastAt = runs.length > 1 ? ahead(origin, last.apexM, lengthM) : lengthM;
    const backFromApex: number[] = [];
    const mins: number[] = [];
    for (const lap of laps) {
      const placed = lap.points.map(point => ({ ...point, at: ahead(origin, mod(point.distM, lengthM), lengthM) }))
        .sort((a, b) => a.at - b.at);
      const peaks = placed.flatMap((point, i) => {
        if (point.type !== 'max' || point.at <= 0 || point.at >= firstAt) return [];
        const nextDip = placed.slice(i + 1).find(other => other.type === 'min');
        return nextDip ? [{ at: point.at, drop: point.speedKmh - nextDip.speedKmh }] : [];
      });
      if (!peaks.length) continue;
      const largest = Math.max(...peaks.map(peak => peak.drop));
      const start = Math.max(...peaks.filter(peak => peak.drop >= largest / 2).map(peak => peak.at));
      backFromApex.push(firstAt - start);
      // The slowest point of the lap's own corner: from its start to its first speed peak past the last turn's apex.
      const end = Math.min(lengthM, ...placed.filter(point => point.type === 'max' && point.at > lastAt).map(point => point.at));
      const dips = placed.filter(point => point.type === 'min' && point.at > start && point.at < end);
      if (dips.length) mins.push(dips.reduce((a, b) => b.speedKmh < a.speedKmh ? b : a).at - firstAt);
    }
    if (!backFromApex.length) return null;
    const back = median(backFromApex);
    const deviations = backFromApex.map(value => Math.abs(value - back));
    const minFromApex = mins.length ? median(mins) : 0;
    const minM = mod(first.apexM + minFromApex, lengthM);
    const exitTurnIds = run.slice(1).filter(index => ahead(first.apexM, turns[index].apexM, lengthM) - minFromApex > EXIT_TURN_M)
      .map(index => turns[index].id);
    return {
      turnIds: run.map(index => turns[index].id), exitTurnIds,
      startM: mod(first.apexM - back, lengthM), minM,
      startSpreadM: { median: median(deviations), max: Math.max(...deviations) },
      lapCount: backFromApex.length,
    };
  });
  // A run no lap slows for is on the previous sequence's straight: held by it as exit turns, so every turn has one.
  // Walked in driving order from the first sequence that stands, so the held turns keep their order.
  const firstKept = sequences.findIndex(Boolean);
  let holder: MapSequence | null = null;
  for (let k = 0; firstKept >= 0 && k < runs.length; k++) {
    const runIndex = (firstKept + k) % runs.length;
    const own = sequences[runIndex];
    if (own) { holder = own; continue; }
    const ids = runs[runIndex].map(index => turns[index].id);
    holder?.turnIds.push(...ids);
    holder?.exitTurnIds.push(...ids);
  }
  return sequences.filter((sequence): sequence is MapSequence => sequence !== null);
}

export interface SequenceCheck {
  turnIds: number[];
  /** The checking laps group these turns the same way. */
  sameGrouping: boolean;
  /** How far the checking laps' start sits from the map's (metres); null when they group it otherwise. */
  startOffsetM: number | null;
}

/** The map checked against a second map built the same way from other laps (the driver's own). */
export function checkSequenceMap(map: SequenceMap, check: SequenceMap): SequenceCheck[] {
  const key = (ids: number[]) => ids.join(',');
  const checked = new Map(check.sequences.map(sequence => [key(sequence.turnIds), sequence]));
  return map.sequences.map(sequence => {
    const other = checked.get(key(sequence.turnIds));
    const offset = other ? ahead(sequence.startM, other.startM, map.lengthM) : null;
    return {
      turnIds: sequence.turnIds, sameGrouping: Boolean(other),
      startOffsetM: offset === null ? null : offset > map.lengthM / 2 ? offset - map.lengthM : offset,
    };
  });
}
