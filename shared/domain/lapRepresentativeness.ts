import type { LapIncident, NonRepresentativeReason } from '../types/index.js';
import { isRacingLap } from './lapComparison.js';

/** A racing lap this much slower than the driver's median racing lap is off pace (traffic, a mistake, a yellow). */
export const OFF_PACE_RATIO = 1.03;

/** Below this many racing laps the median is not a pace reference, so no lap is called off pace. */
const MIN_LAPS_FOR_MEDIAN = 3;

interface ClassifiableLap {
  lapNum: number;
  lapTime: number | null;
  isValid: boolean;
  isPitStop: boolean;
  isOutLap?: boolean;
  incidents?: LapIncident[];
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
 * either had contact or damage, or was more than OFF_PACE_RATIO off that median. A rub on a
 * fast lap cost nothing, so that lap stays in.
 *
 * Runs once in the session parser, after lap times are inferred and incidents are attached.
 */
export function markNonRepresentativeLaps(laps: ClassifiableLap[]): void {
  // The start lap (lap 1) is already left out of flying pace, so it is not a pace reference either.
  const racing = laps.filter((lap) =>
    isRacingLap(lap) && lap.lapNum > 1 && typeof lap.lapTime === 'number' && lap.lapTime > 0
  );
  laps.forEach((lap) => { delete lap.nonRepresentativeReason; });
  if (racing.length < MIN_LAPS_FOR_MEDIAN) return;

  const medianLapTime = median(racing.map((lap) => lap.lapTime as number));
  racing.forEach((lap) => {
    const lapTime = lap.lapTime as number;
    if (lapTime <= medianLapTime) return;
    if (lap.incidents?.some((incident) => incident.type === 'contact' || incident.type === 'damage')) {
      lap.nonRepresentativeReason = 'contact';
    } else if (lapTime > medianLapTime * OFF_PACE_RATIO) {
      lap.nonRepresentativeReason = 'offPace';
    }
  });
}
