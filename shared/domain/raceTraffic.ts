import type { LapTraffic, TrafficCar, TrafficGap } from '../types/index.js';
import { areComparableCarClasses } from './vehicleMapping.js';

/** A car this close ahead on the road at both ends of a lap was followed through it (dirty air, a fight). */
export const FOLLOW_GAP_SEC = 1.0;

interface TrafficLap {
  lapNum: number;
  lapTime: number | null;
  elapsedSeconds?: number | null;
  isPitStop: boolean;
  isOutLap?: boolean;
  traffic?: LapTraffic;
}

interface TrafficDriver {
  name: string;
  carClass: string;
  laps: TrafficLap[];
}

/** One lap on the timing line: it starts at `start` and ends at `finish`. */
interface LineLap {
  start: number;
  finish: number;
  lap: TrafficLap;
  /**
   * The car was on its way into, in or out of the pits: passing it is not traffic, and its line
   * times around a stop do not match its lap times.
   */
  nearPits: boolean;
}

interface DriverLine {
  car: Omit<TrafficCar, 'sameClass'>;
  laps: LineLap[];
  /** The start of each of `laps`, in the same order. */
  starts: number[];
  /** Every line crossing in time order: each lap's start, then the last lap's finish. */
  crossings: number[];
}

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && value > 0;

/**
 * A driver's laps as spans between line crossings. LMU writes each lap's `et` when the lap
 * starts; a lap finishes at the next lap's start, or its own start plus its time for the last lap.
 */
function lineLaps(driver: TrafficDriver): DriverLine {
  const timed = driver.laps
    .filter((lap) => positive(lap.elapsedSeconds))
    .sort((a, b) => a.lapNum - b.lapNum);
  const pitLaps = new Set(driver.laps.filter((lap) => lap.isPitStop).map((lap) => lap.lapNum));
  const laps: LineLap[] = [];
  timed.forEach((lap, index) => {
    const start = lap.elapsedSeconds as number;
    const next = timed[index + 1];
    const finish = next && next.lapNum === lap.lapNum + 1
      ? next.elapsedSeconds as number
      : !next && positive(lap.lapTime) ? start + lap.lapTime : null;
    const nearPits = lap.isPitStop || lap.isOutLap === true || pitLaps.has(lap.lapNum + 1);
    if (finish !== null && finish > start) laps.push({ start, finish, lap, nearPits });
  });
  const crossings = [...new Set([...timed.map((lap) => lap.elapsedSeconds as number), ...laps.map((l) => l.finish)])]
    .sort((a, b) => a - b);
  return { car: { name: driver.name, carClass: driver.carClass }, laps, starts: laps.map((l) => l.start), crossings };
}

/** How many of the sorted values are below `time` (strictly, or up to and including it). */
function countBelow(sorted: number[], time: number, inclusive: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < time || (inclusive && sorted[mid] === time)) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** The lap of `line` that is under way at `time` (started strictly before, finished strictly after). */
function lapSpanning(line: DriverLine, time: number): LineLap | null {
  const lap = line.laps[countBelow(line.starts, time, false) - 1];
  return lap && lap.finish > time ? lap : null;
}

/** The first lap of `line` that starts strictly after `time`. */
function lapStartingAfter(line: DriverLine, time: number): LineLap | null {
  return line.laps[countBelow(line.starts, time, true)] ?? null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** The nearest car on the road ahead of (direction -1) or behind (direction 1) a line crossing. */
function nearestOnRoad(others: Array<{ line: DriverLine; car: TrafficCar }>, time: number, direction: -1 | 1): TrafficGap | null {
  let best: TrafficGap | null = null;
  for (const { line, car } of others) {
    const crossing = direction < 0
      ? line.crossings[countBelow(line.crossings, time, false) - 1]
      : line.crossings[countBelow(line.crossings, time, true)];
    if (crossing === undefined) continue;
    const gapSec = Math.abs(time - crossing);
    if (best === null || gapSec < best.gapSec) best = { car, gapSec: round3(gapSec) };
  }
  return best;
}

/**
 * Works out, for every driver's laps, the cars around them on the road and who passed whom,
 * from the timing-line crossings of every car in the session. A car that started the lap ahead
 * and finished it behind was passed (and the other way round); a car in the pits is not an
 * overtake. Runs once in the session parser, before laps are classified.
 */
export function annotateLapTraffic(drivers: TrafficDriver[]): void {
  const lines = drivers.map((driver) => ({ driver, line: lineLaps(driver) }));
  for (const { driver, line } of lines) {
    const others = lines
      .filter((other) => other.driver !== driver)
      .map((other) => ({
        line: other.line,
        car: { ...other.line.car, sameClass: areComparableCarClasses(driver.carClass, other.driver.carClass) },
      }));
    driver.laps.forEach((lap) => { delete lap.traffic; });

    for (const { start, finish, lap } of line.laps) {
      const passed: TrafficCar[] = [];
      const passedBy: TrafficCar[] = [];
      for (const other of others) {
        const overtaken = lapSpanning(other.line, start);
        if (overtaken && overtaken.finish > finish && !overtaken.nearPits) passed.push(other.car);
        const overtaker = lapStartingAfter(other.line, start);
        if (overtaker && overtaker.finish < finish && !overtaker.nearPits) passedBy.push(other.car);
      }
      const ahead = nearestOnRoad(others, start, -1);
      const aheadAtFinish = nearestOnRoad(others, finish, -1);
      const behind = nearestOnRoad(others, start, 1);
      const behindAtFinish = nearestOnRoad(others, finish, 1);
      lap.traffic = {
        ahead,
        behind,
        following: ahead !== null && ahead.gapSec <= FOLLOW_GAP_SEC
          && aheadAtFinish !== null && aheadAtFinish.gapSec <= FOLLOW_GAP_SEC,
        pressured: behind !== null && behind.gapSec <= FOLLOW_GAP_SEC
          && behindAtFinish !== null && behindAtFinish.gapSec <= FOLLOW_GAP_SEC,
        passed,
        passedBy,
      };
    }
  }
}

/** Whether a lap was spent overtaking, being overtaken, following another car or with one right behind. */
export function hadTraffic(traffic: LapTraffic | undefined): boolean {
  return !!traffic && (traffic.following || traffic.pressured === true || traffic.passed.length > 0 || traffic.passedBy.length > 0);
}
