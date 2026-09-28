import type { LapConditions, LapIncident, LapTraffic, NonRepresentativeReason } from '../types/index.js';
import { isRacingLap } from './lapComparison.js';
import { LapConditionGroup, lapConditionGroup } from './lapConditions.js';
import { hadTraffic } from './raceTraffic.js';

/**
 * A racing lap this much slower than the driver's median racing lap is off pace (a mistake, a
 * yellow, traffic the line crossings do not show). Measured over 929 sessions (2026-09-27): laps
 * with nothing logged sit within 1.1% of the median 95% of the time and thin out past 1.5%, in
 * every class and on every layout with enough laps, so 2% is just past a driver's normal spread.
 */
export const OFF_PACE_RATIO = 1.02;

/** Below this many racing laps the median is not a pace reference, so no lap is called off pace. */
const MIN_LAPS_FOR_MEDIAN = 3;

interface ClassifiableLap {
  lapNum: number;
  lapTime: number | null;
  isValid: boolean;
  isPitStop: boolean;
  isOutLap?: boolean;
  incidents?: LapIncident[];
  traffic?: LapTraffic;
  conditions?: LapConditions;
  nonRepresentativeReason?: NonRepresentativeReason;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Marks the racing laps that do not show the driver's pace, so averages and consistency leave
 * them out. A lap is only marked when it is slower than the driver's median racing lap and it
 * had contact or damage, was spent overtaking, being overtaken or following another car, or was
 * more than OFF_PACE_RATIO off that median. A rub or a pass on a fast lap cost nothing, so that
 * lap stays in.
 *
 * The median is taken within the lap's conditions (lapConditions.ts): a wet lap is compared with
 * the driver's other wet laps, so a shower does not make every lap in it off pace. With fewer than
 * MIN_LAPS_FOR_MEDIAN wet laps there is no wet reference and those laps are never called off pace;
 * dry laps then fall back to the median of all racing laps, as without conditions.
 *
 * Runs in the session classification (sessionLapClassification.ts), after lap times are inferred
 * and incidents, traffic and conditions are attached.
 */
export function markNonRepresentativeLaps(laps: ClassifiableLap[]): void {
  // The start lap (lap 1) is already left out of flying pace, so it is not a pace reference either.
  const racing = laps.filter((lap) =>
    isRacingLap(lap) && lap.lapNum > 1 && typeof lap.lapTime === 'number' && lap.lapTime > 0
  );
  laps.forEach((lap) => { delete lap.nonRepresentativeReason; });
  if (racing.length < MIN_LAPS_FOR_MEDIAN) return;

  const overallMedian = median(racing.map((lap) => lap.lapTime as number));
  const groupMedian = new Map<LapConditionGroup, number | null>();
  for (const group of ['dry', 'wet'] as const) {
    const times = racing.filter((lap) => lapConditionGroup(lap) === group).map((lap) => lap.lapTime as number);
    groupMedian.set(group, times.length >= MIN_LAPS_FOR_MEDIAN ? median(times) : group === 'dry' ? overallMedian : null);
  }

  racing.forEach((lap) => {
    const lapTime = lap.lapTime as number;
    const medianLapTime = groupMedian.get(lapConditionGroup(lap)) ?? null;
    if (medianLapTime === null || lapTime <= medianLapTime) return;
    if (lap.incidents?.some((incident) => incident.type === 'contact' || incident.type === 'damage')) {
      lap.nonRepresentativeReason = 'contact';
    } else if (hadTraffic(lap.traffic)) {
      lap.nonRepresentativeReason = 'traffic';
    } else if (lapTime > medianLapTime * OFF_PACE_RATIO) {
      lap.nonRepresentativeReason = 'offPace';
    }
  });
}
