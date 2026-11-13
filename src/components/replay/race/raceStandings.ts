import type { RaceReplayCar, RaceReplayLap, RaceReplayOverview, RaceReplayProgress, RaceRunningOrder } from '../../../../shared/types/index.js';
import { isNonRaceSession } from '../../../../shared/domain/raceTraffic.js';

export type RaceGap =
  | { kind: 'leader' }
  | { kind: 'time'; sec: number }
  | { kind: 'laps'; laps: number }
  /** Out of the race (the results' DNF, DQ or DNS). */
  | { kind: 'out'; status: string };

export interface RaceStandingRow {
  car: RaceReplayCar;
  position: number;
  classPosition: number;
  lapsDone: number;
  lastLapSec: number | null;
  bestLapSec: number | null;
  /** Race: behind the class leader on the road. Practice and qualifying: best lap behind the class best. */
  gap: RaceGap | null;
  /** Race: behind the car ahead in the class on the road (the leader and cars out as `gap`). Otherwise as `gap`. */
  interval: RaceGap | null;
}

/** Each car's laps in lap order, and the cars in replay order, prepared once per overview. */
export interface RaceStandingsIndex {
  isRace: boolean;
  cars: RaceReplayCar[];
  lapsBySlot: Map<number, RaceReplayLap[]>;
  runningOrder: RaceRunningOrder[];
  /** Every car's distance along the track over time, for gaps between line crossings; null until loaded or without one. */
  progress: RaceProgressTrack | null;
  /** When each car that did not finish was out: the end of its last lap. */
  outAtSec: Map<number, number>;
}

/** The progress grid with each car's distances by slot. */
export interface RaceProgressTrack {
  fromSec: number;
  hz: number;
  trackLengthM: number;
  bySlot: Map<number, Array<number | null>>;
}

export function indexRaceStandings(overview: RaceReplayOverview, progress: RaceReplayProgress | null = null): RaceStandingsIndex {
  const lapsBySlot = new Map<number, RaceReplayLap[]>();
  for (const lap of overview.laps) lapsBySlot.set(lap.slot, [...lapsBySlot.get(lap.slot) ?? [], lap]);
  for (const laps of lapsBySlot.values()) laps.sort((a, b) => a.endSec - b.endSec);
  const progressTrack: RaceProgressTrack | null = progress && {
    fromSec: progress.fromSec, hz: progress.hz, trackLengthM: progress.trackLengthM,
    bySlot: new Map(progress.cars.map(car => [car.slot, car.distances])),
  };
  const outAtSec = new Map(overview.cars.flatMap(car => car.retired ? [[car.slot, outSecOf(overview, car, lapsBySlot, progressTrack)] as const] : []));
  return {
    outAtSec,
    isRace: !isNonRaceSession(overview.sessionType), cars: overview.cars, lapsBySlot, runningOrder: overview.runningOrder,
    progress: progressTrack,
  };
}

const MOVE_EPSILON_M = 0.5;

/** Last time `slot` moved along the track in `progress`; null when unavailable or it never moved. */
function lastMovedSecOf(progress: RaceProgressTrack | null, slot: number): number | null {
  const distances = progress?.bySlot.get(slot);
  if (!progress || !distances) return null;
  let lastMovedIdx = -1;
  let prev: number | null = null;
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i];
    if (d === null) continue;
    if (prev !== null && Math.abs(d - prev) > MOVE_EPSILON_M) lastMovedIdx = i;
    prev = d;
  }
  return lastMovedIdx >= 0 ? progress.fromSec + lastMovedIdx / progress.hz : null;
}

/**
 * When a car that did not finish was out: the later of its last completed result lap and the last moment
 * it moved along the track (so a car that retires mid-lap isn't marked DNF while still driving).
 */
function outSecOf(
  overview: RaceReplayOverview,
  car: RaceReplayCar,
  lapsBySlot: Map<number, RaceReplayLap[]>,
  progress: RaceProgressTrack | null,
): number {
  const laps = lapsBySlot.get(car.slot) ?? [];
  const lastMoved = lastMovedSecOf(progress, car.slot);
  if (!car.sessionLapOrdinals) {
    const lapEnd = laps.at(-1)?.endSec ?? overview.startSec;
    return lastMoved !== null ? Math.max(lapEnd, lastMoved) : lapEnd;
  }
  const counted = Math.max(0, ...Object.keys(car.sessionLapOrdinals).map(Number).filter(Number.isFinite));
  const lapEnd = laps.find(lap => lap.lapNumber === counted)?.endSec ?? overview.startSec;
  return lastMoved !== null ? Math.max(lapEnd, lastMoved) : lapEnd;
}

/** Out of the race (did not finish, past its last lap) at `timeSec`. */
export function isOutAt(index: RaceStandingsIndex, slot: number, timeSec: number): boolean {
  return timeSec >= (index.outAtSec.get(slot) ?? Infinity);
}

/** The last running order snapshot at or before `timeSec` (the first one before it starts). */
export function runningOrderAt(snapshots: RaceRunningOrder[], timeSec: number): number[] {
  let lo = 0;
  let hi = snapshots.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].timeSec <= timeSec) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return snapshots[Math.max(0, found)]?.order ?? [];
}

/** Laps finished by `timeSec` (the list is in lap end order). */
function lapsDoneAt(laps: RaceReplayLap[], timeSec: number): number {
  let n = 0;
  while (n < laps.length && laps[n].endSec <= timeSec) n++;
  return n;
}

/** The timing screen at `timeSec`: the game's running order, class places, laps and gaps. */
export function raceStandingsAt(index: RaceStandingsIndex, timeSec: number): RaceStandingRow[] {
  const bySlot = new Map(index.cars.map(car => [car.slot, car]));
  const progress = new Map(index.cars.map((car) => {
    const laps = index.lapsBySlot.get(car.slot) ?? [];
    const done = laps.slice(0, lapsDoneAt(laps, timeSec));
    const timed = done.filter(lap => lap.lapTimeSec !== null && lap.lapTimeSec > 0);
    const valid = timed.filter(lap => lap.isValid).map(lap => lap.lapTimeSec!);
    return [car.slot, {
      done,
      lastLapSec: timed.length ? timed[timed.length - 1].lapTimeSec : null,
      bestLapSec: valid.length ? Math.min(...valid) : null,
    }];
  }));

  const isOut = (slot: number) => isOutAt(index, slot, timeSec);
  const ordered = runningOrderAt(index.runningOrder, timeSec).filter(slot => bySlot.has(slot));
  const listed = new Set(ordered);
  const rest = index.cars.filter(car => !listed.has(car.slot))
    .sort((a, b) => (progress.get(b.slot)!.done.length - progress.get(a.slot)!.done.length) || a.slot - b.slot)
    .map(car => car.slot);
  // Cars out of the race go to the bottom: most laps first, then the last out.
  const out = [...ordered, ...rest].filter(isOut).sort((a, b) => (progress.get(b)!.done.length - progress.get(a)!.done.length)
    || index.outAtSec.get(b)! - index.outAtSec.get(a)!);
  const running = [...ordered, ...rest].filter(slot => !isOut(slot));

  const classLeader = new Map<string, number>();
  const classBest = new Map<string, number>();
  for (const slot of [...running, ...out]) {
    const best = progress.get(slot)!.bestLapSec;
    const carClass = bySlot.get(slot)!.carClass ?? '';
    if (best !== null && best < (classBest.get(carClass) ?? Infinity)) classBest.set(carClass, best);
  }
  const classCounts = new Map<string, number>();
  const classAhead = new Map<string, number>();
  /** Behind `ahead` on the road: in laps at the last line crossing, else now, else at that crossing. */
  const behind = (slot: number, ahead: number): RaceGap | null => {
    const lineGap = roadGap(progress.get(slot)!.done, progress.get(ahead)!.done);
    return lineGap?.kind === 'laps' ? lineGap : liveGap(index, slot, ahead, timeSec) ?? lineGap;
  };
  return [...running, ...out].map((slot, i) => {
    const car = bySlot.get(slot)!;
    const carClass = car.carClass ?? '';
    const classPosition = (classCounts.get(carClass) ?? 0) + 1;
    classCounts.set(carClass, classPosition);
    if (classPosition === 1) classLeader.set(carClass, slot);
    const own = progress.get(slot)!;
    const aheadSlot = classAhead.get(carClass);
    classAhead.set(carClass, slot);
    let gap: RaceGap | null;
    let interval: RaceGap | null;
    if (car.retired && isOut(slot)) {
      gap = interval = { kind: 'out', status: car.retired };
    } else if (index.isRace) {
      gap = classPosition === 1 ? { kind: 'leader' } : behind(slot, classLeader.get(carClass)!);
      interval = classPosition === 1 || aheadSlot === classLeader.get(carClass) ? gap : behind(slot, aheadSlot!);
    } else {
      const best = classBest.get(carClass);
      gap = interval = classPosition === 1 ? { kind: 'leader' }
        : own.bestLapSec !== null && best !== undefined ? { kind: 'time', sec: own.bestLapSec - best } : null;
    }
    return { car, position: i + 1, classPosition, lapsDone: own.done.length, lastLapSec: own.lastLapSec, bestLapSec: own.bestLapSec,
      gap, interval };
  });
}

/** A car's distance along the track at `timeSec`, between the grid's samples; null off the track or outside the grid. */
export function progressAt(track: RaceProgressTrack, slot: number, timeSec: number): number | null {
  const distances = track.bySlot.get(slot);
  if (!distances) return null;
  const x = (timeSec - track.fromSec) * track.hz, i = Math.floor(x);
  if (i < 0 || i >= distances.length) return null;
  const a = distances[i];
  if (i === distances.length - 1 || x === i) return a;
  const b = distances[i + 1];
  return a === null || b === null ? null : a + (b - a) * (x - i);
}

/** When the car's distance reached `target` between `fromSec` and `toSec`; null when it did not. */
function timeAtDistance(track: RaceProgressTrack, slot: number, target: number, fromSec: number, toSec: number): number | null {
  let previousSec = fromSec, previous = progressAt(track, slot, fromSec);
  const first = Math.ceil((fromSec - track.fromSec) * track.hz), last = Math.floor((toSec - track.fromSec) * track.hz);
  const times = [...Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => track.fromSec + (first + k) / track.hz), toSec];
  for (const sec of times) {
    if (sec <= previousSec) continue;
    const distance = progressAt(track, slot, sec);
    if (previous !== null && distance !== null && previous <= target && distance >= target) {
      return distance > previous ? previousSec + (sec - previousSec) * (target - previous) / (distance - previous) : sec;
    }
    previousSec = sec; previous = distance;
  }
  return null;
}

/** First finite distance sample of `slot` in `[fromSec, toSec]`, when `fromSec` itself falls in a leading gap. */
function firstProgressIn(track: RaceProgressTrack, slot: number, fromSec: number, toSec: number): { sec: number; distance: number } | null {
  const exact = progressAt(track, slot, fromSec);
  if (exact !== null) return { sec: fromSec, distance: exact };
  const distances = track.bySlot.get(slot);
  if (!distances) return null;
  const first = Math.max(0, Math.ceil((fromSec - track.fromSec) * track.hz));
  const last = Math.min(distances.length - 1, Math.floor((toSec - track.fromSec) * track.hz));
  for (let i = first; i <= last; i++) {
    const distance = distances[i];
    if (distance !== null) return { sec: track.fromSec + i / track.hz, distance };
  }
  return null;
}

/**
 * Behind the class leader now, on the road: the time since the leader passed the car's place on the track, on the lap the
 * car is on. Null when either car is off the track or between laps, or the leader's lap has no such moment yet.
 */
function liveGap(index: RaceStandingsIndex, slot: number, leaderSlot: number, timeSec: number): RaceGap | null {
  const track = index.progress;
  if (!track) return null;
  const lap = index.lapsBySlot.get(slot)?.find(entry => entry.startSec <= timeSec && timeSec < entry.endSec);
  const leaderLap = lap && index.lapsBySlot.get(leaderSlot)?.find(entry => entry.lapNumber === lap.lapNumber);
  const here = progressAt(track, slot, timeSec);
  const leaderEnd = leaderLap ? Math.min(leaderLap.endSec, timeSec) : timeSec;
  const leaderStart = leaderLap ? firstProgressIn(track, leaderSlot, leaderLap.startSec, leaderEnd) : null;
  if (!leaderLap || here === null || !leaderStart) return null;
  // Each car's distance has its own zero: the leader reaches the car's place on the track this far into its lap.
  const length = track.trackLengthM;
  const target = leaderStart.distance + (((here - leaderStart.distance) % length) + length) % length;
  const passed = timeAtDistance(track, leaderSlot, target, leaderStart.sec, leaderEnd);
  return passed === null ? null : { kind: 'time', sec: timeSec - passed };
}

/** Behind the leader at the car's last line crossing: in time on the same lap, else in laps. */
function roadGap(own: RaceReplayLap[], leader: RaceReplayLap[]): RaceGap | null {
  if (!own.length) return null;
  const crossing = own[own.length - 1].endSec;
  const leaderLaps = leader.filter(lap => lap.endSec <= crossing).length;
  const lapsDown = leaderLaps - own.length;
  if (lapsDown >= 1) return { kind: 'laps', laps: lapsDown };
  const leaderCrossing = leader[own.length - 1]?.endSec;
  return leaderCrossing === undefined ? null : { kind: 'time', sec: Math.max(0, crossing - leaderCrossing) };
}
