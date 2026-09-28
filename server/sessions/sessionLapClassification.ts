import type { DriverData } from '../core/types.js';
import { annotateLapConditions, RainOverLap } from '../../shared/domain/lapConditions.js';
import { markNonRepresentativeLaps } from '../../shared/domain/lapRepresentativeness.js';
import { formatTime } from '../../shared/domain/formatters.js';
import { computeAverageLapTime } from './sessionAnalytics.js';

/**
 * Tags each lap's conditions, marks the laps that do not show the driver's pace, and recomputes
 * each driver's clean-lap average. The parser runs it once lap times, incidents and traffic are
 * attached, with the tyres only; it runs again with the linked replay's rain when the session gets
 * its replay or the replay's conditions are stored. Same rule both times: views and analytics only
 * read the result.
 */
export function classifySessionLaps(drivers: Array<Pick<DriverData, 'laps' | 'avgLapTime' | 'avgLapTimeString'>>, rainOverLap?: RainOverLap): void {
  for (const driver of drivers) {
    annotateLapConditions(driver.laps, rainOverLap);
    markNonRepresentativeLaps(driver.laps);
    driver.avgLapTime = computeAverageLapTime(driver.laps);
    driver.avgLapTimeString = formatTime(driver.avgLapTime);
  }
}
