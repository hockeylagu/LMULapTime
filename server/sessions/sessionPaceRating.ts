import type { DriverData } from '../core/types.js';
import { calculatePaceCategory } from '../benchmarks/referenceLaptimes.js';

type RatedDriver = Pick<DriverData, 'laps' | 'carClass' | 'carType' | 'bestLapTime' | 'bestLapPaceCategory' | 'bestLapPacePercentage'>;

export interface PaceTrack {
  venue: string;
  course: string;
  trackLengthMeters?: number | null;
}

/**
 * Rates every valid lap and each driver's best lap against the current benchmark targets. A lap
 * whose layout and class have no target loses any rating it carried. The parser runs it once; it
 * runs again on stored sessions when the targets change (dbSessionPace.ts). classifySessionLaps
 * then decides whether the best lap keeps its rating (a wet best lap does not).
 */
export function rateDriversPace(drivers: RatedDriver[], track: PaceTrack): void {
  const rate = (lapTime: number | null, driver: RatedDriver) =>
    calculatePaceCategory(lapTime, track.venue, track.course, driver.carClass, driver.carType, track.trackLengthMeters);
  for (const driver of drivers) {
    for (const lap of driver.laps) {
      const info = lap.isValid && lap.lapTime ? rate(lap.lapTime, driver) : null;
      if (info) {
        lap.paceCategory = info.category;
        lap.pacePercentage = info.percentage;
        lap.target100Sec = info.target100Sec;
      } else {
        delete lap.paceCategory;
        delete lap.pacePercentage;
        delete lap.target100Sec;
      }
    }
    const best = driver.bestLapTime ? rate(driver.bestLapTime, driver) : null;
    driver.bestLapPaceCategory = best?.category;
    driver.bestLapPacePercentage = best?.percentage;
  }
}
