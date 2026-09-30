import type { DriverData } from '../core/types.js';
import { annotateLapConditions, RainOverLap } from '../../shared/domain/lapConditions.js';
import { markNonRepresentativeLaps } from '../../shared/domain/lapRepresentativeness.js';
import { formatTime } from '../../shared/domain/formatters.js';
import { computeAverageLapTime } from './sessionAnalytics.js';

type ClassifiedDriver = Pick<DriverData, 'laps' | 'avgLapTime' | 'avgLapTimeString' | 'bestLapNum' | 'bestLapTime'
  | 'bestLapPaceCategory' | 'bestLapPacePercentage' | 'bestLapWet'>;

/**
 * The benchmark targets are dry laps, so a wet best lap is not rated against them: it is flagged
 * `bestLapWet` instead. A dry best lap takes its lap's rating back (the parser rated every valid lap).
 */
function rateBestLap(driver: ClassifiedDriver): void {
  const best = driver.laps.find(l => l.lapNum === driver.bestLapNum)
    ?? (driver.bestLapTime ? driver.laps.find(l => l.lapTime === driver.bestLapTime) : undefined);
  if (!best) return;
  if (best.conditions) {
    driver.bestLapWet = true;
    delete driver.bestLapPaceCategory;
    delete driver.bestLapPacePercentage;
    return;
  }
  delete driver.bestLapWet;
  if (best.paceCategory && typeof best.pacePercentage === 'number') {
    driver.bestLapPaceCategory = best.paceCategory;
    driver.bestLapPacePercentage = best.pacePercentage;
  }
}

/**
 * Tags each lap's conditions, marks the laps that do not show the driver's pace, recomputes each
 * driver's clean-lap average and rates the best lap against the dry benchmark only when it was dry. The parser runs it once lap times, incidents and traffic are
 * attached, with the tyres only; it runs again with the linked replay's rain when the session gets
 * its replay or the replay's conditions are stored. Same rule both times: views and analytics only
 * read the result.
 */
export function classifySessionLaps(drivers: ClassifiedDriver[], rainOverLap?: RainOverLap): void {
  for (const driver of drivers) {
    annotateLapConditions(driver.laps, rainOverLap);
    markNonRepresentativeLaps(driver.laps);
    driver.avgLapTime = computeAverageLapTime(driver.laps);
    driver.avgLapTimeString = formatTime(driver.avgLapTime);
    rateBestLap(driver);
  }
}
