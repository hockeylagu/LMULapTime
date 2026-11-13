import type { RaceReplayOverview } from '../../../../shared/types/index.js';

/** Where the clock starts: the URL's time, else the start of the asked lap, else the session start. */
export function initialRaceTime(overview: RaceReplayOverview, timeSec?: number | null, slot?: number | null, lapNumber?: number | null): number {
  if (timeSec !== null && timeSec !== undefined && Number.isFinite(timeSec)) return timeSec;
  const lap = overview.laps.find(entry => entry.slot === slot && entry.lapNumber === lapNumber);
  return lap?.startSec ?? overview.startSec;
}

/** The session driver and lap the followed car is on at `timeSec`, for the lap view; null when it is not a session driver. */
export function lapAt(overview: RaceReplayOverview, slot: number | null, timeSec: number): { driverOrdinal: number; lapOrdinal: number; lapNumber: number } | null {
  const car = overview.cars.find(entry => entry.slot === slot);
  if (!car || car.sessionDriverOrdinal === undefined || !car.sessionLapOrdinals) return null;
  const laps = overview.laps.filter(lap => lap.slot === slot);
  const lap = laps.find(entry => entry.startSec <= timeSec && timeSec < entry.endSec)
    ?? [...laps].reverse().find(entry => entry.endSec <= timeSec) ?? laps[0];
  const lapOrdinal = lap ? car.sessionLapOrdinals[String(lap.lapNumber)] : undefined;
  return lap && lapOrdinal !== undefined ? { driverOrdinal: car.sessionDriverOrdinal, lapOrdinal, lapNumber: lap.lapNumber } : null;
}
