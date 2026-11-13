import type { RaceReplayProgress } from '../../shared/types/index.js';
import { distanceAt, type RacePositions } from './racePositions.js';

/** Grid samples per second: distance is near linear over a second, so gaps read from it stay within a few hundredths. */
export const RACE_PROGRESS_HZ = 1;

/** The race positions index on one clock grid for every car, in tenths of a metre. */
export function raceProgressGrid(positions: RacePositions, hz = RACE_PROGRESS_HZ): RaceReplayProgress {
  const drivers = positions.drivers.filter(driver => driver.times.length >= 2);
  const first = Math.min(...drivers.map(driver => driver.times[0]));
  const last = Math.max(...drivers.map(driver => driver.times[driver.times.length - 1]));
  if (!drivers.length) return { fromSec: 0, hz, trackLengthM: positions.trackLengthM, cars: [] };
  const fromSec = Math.floor(first * hz) / hz;
  const count = Math.floor((last - fromSec) * hz) + 1;
  return {
    fromSec, hz, trackLengthM: positions.trackLengthM,
    cars: drivers.map(driver => ({
      slot: driver.slot,
      distances: Array.from({ length: count }, (_, k) => {
        const distance = distanceAt(driver, fromSec + k / hz);
        return distance === null ? null : Math.round(distance * 10) / 10;
      }),
    })),
  };
}
