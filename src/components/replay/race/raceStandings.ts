import type { RaceReplayCar, RaceReplayLap, RaceReplayOverview, RaceRunningOrder } from '../../../../shared/types/index.js';
import { isNonRaceSession } from '../../../../shared/domain/raceTraffic.js';

export type RaceGap =
  | { kind: 'leader' }
  | { kind: 'time'; sec: number }
  | { kind: 'laps'; laps: number };

export interface RaceStandingRow {
  car: RaceReplayCar;
  position: number;
  classPosition: number;
  lapsDone: number;
  lastLapSec: number | null;
  bestLapSec: number | null;
  /** Race: behind the class leader on the road. Practice and qualifying: best lap behind the class best. */
  gap: RaceGap | null;
}

/** Each car's laps in lap order, and the cars in replay order, prepared once per overview. */
export interface RaceStandingsIndex {
  isRace: boolean;
  cars: RaceReplayCar[];
  lapsBySlot: Map<number, RaceReplayLap[]>;
  runningOrder: RaceRunningOrder[];
}

export function indexRaceStandings(overview: RaceReplayOverview): RaceStandingsIndex {
  const lapsBySlot = new Map<number, RaceReplayLap[]>();
  for (const lap of overview.laps) lapsBySlot.set(lap.slot, [...lapsBySlot.get(lap.slot) ?? [], lap]);
  for (const laps of lapsBySlot.values()) laps.sort((a, b) => a.endSec - b.endSec);
  return { isRace: !isNonRaceSession(overview.sessionType), cars: overview.cars, lapsBySlot, runningOrder: overview.runningOrder };
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

  const ordered = runningOrderAt(index.runningOrder, timeSec).filter(slot => bySlot.has(slot));
  const listed = new Set(ordered);
  const rest = index.cars.filter(car => !listed.has(car.slot))
    .sort((a, b) => (progress.get(b.slot)!.done.length - progress.get(a.slot)!.done.length) || a.slot - b.slot)
    .map(car => car.slot);

  const classLeader = new Map<string, number>();
  const classBest = new Map<string, number>();
  for (const slot of [...ordered, ...rest]) {
    const best = progress.get(slot)!.bestLapSec;
    const carClass = bySlot.get(slot)!.carClass ?? '';
    if (best !== null && best < (classBest.get(carClass) ?? Infinity)) classBest.set(carClass, best);
  }
  const classCounts = new Map<string, number>();
  return [...ordered, ...rest].map((slot, i) => {
    const car = bySlot.get(slot)!;
    const carClass = car.carClass ?? '';
    const classPosition = (classCounts.get(carClass) ?? 0) + 1;
    classCounts.set(carClass, classPosition);
    if (classPosition === 1) classLeader.set(carClass, slot);
    const own = progress.get(slot)!;
    let gap: RaceGap | null;
    if (index.isRace) {
      gap = classPosition === 1 ? { kind: 'leader' } : roadGap(own.done, progress.get(classLeader.get(carClass)!)!.done);
    } else {
      const best = classBest.get(carClass);
      gap = classPosition === 1 ? { kind: 'leader' }
        : own.bestLapSec !== null && best !== undefined ? { kind: 'time', sec: own.bestLapSec - best } : null;
    }
    return { car, position: i + 1, classPosition, lapsDone: own.done.length, lastLapSec: own.lastLapSec, bestLapSec: own.bestLapSec, gap };
  });
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
