import type { DriverData } from '../../../../shared/types/index.js';

/**
 * Seconds from the race start to the driver's flag: the game's `<FinishTime>` when the session has it (parser 2.25),
 * else the end of the last timed lap (a lap's `et` is its start) from the first lap's start. Pass `fromXml` the same
 * for every driver of a session so gaps never mix the two.
 */
export function raceFinishSeconds(driver: DriverData, fromXml: boolean): number | null {
  if (fromXml) return driver.finishTime ?? null;
  const timed = driver.laps.filter(lap => typeof lap.elapsedSeconds === 'number');
  const first = timed[0];
  const last = timed.at(-1);
  if (!first || !last) return null;
  return (last.elapsedSeconds as number) + (last.lapTime ?? 0) - (first.elapsedSeconds as number);
}
