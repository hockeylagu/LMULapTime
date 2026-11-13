import type { RaceReplayLap, RaceReplayOverview, ReplayLapSummary } from '../../../../shared/types/index.js';

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

/** A sector time from the replay, or null. */
const known = (sec: number | null | undefined): sec is number => typeof sec === 'number' && Number.isFinite(sec) && sec > 0;

/**
 * The followed car's timing at `timeSec` for the map's timing panel: on a lap, its time so far, the sectors it finished and the
 * one it is in so far (`sector`); between laps (the pits, after the finish), its last lap in full; null before its first.
 * `laps` are the car's own laps.
 */
export function raceLapTimingAt(laps: RaceReplayLap[], timeSec: number): { summary: ReplayLapSummary; sector: 1 | 2 | 3 | null } | null {
  const current = laps.find(lap => lap.startSec <= timeSec && timeSec < lap.endSec);
  if (current) {
    const elapsed = timeSec - current.startSec;
    const { s1Sec: s1, s2Sec: s2 } = current;
    const sector = !known(s1) ? null : elapsed < s1 ? 1 : !known(s2) ? 2 : elapsed < s1 + s2 ? 2 : 3;
    return { sector, summary: {
      lapNumber: current.lapNumber, lapTimeSec: elapsed,
      s1Sec: sector === 1 ? elapsed : sector ? s1! : NaN,
      s2Sec: sector === 2 ? elapsed - s1! : sector === 3 ? s2! : NaN,
      s3Sec: sector === 3 ? elapsed - s1! - s2! : NaN,
    } };
  }
  const last = laps.filter(lap => lap.endSec <= timeSec).sort((a, b) => b.endSec - a.endSec)[0];
  return last ? { sector: null, summary: {
    lapNumber: last.lapNumber, lapTimeSec: last.lapTimeSec ?? NaN, s1Sec: last.s1Sec ?? NaN, s2Sec: last.s2Sec ?? NaN, s3Sec: last.s3Sec ?? NaN,
  } } : null;
}

/**
 * The race's laps: the most laps a car has in the results (a replay can hold one more after the flag), else in the replay.
 */
export function raceLapCount(overview: RaceReplayOverview): number {
  const counted = overview.cars.flatMap(car => Object.keys(car.sessionLapOrdinals ?? {}).map(Number).filter(Number.isFinite));
  return Math.max(0, ...(counted.length ? counted : overview.laps.map(lap => lap.lapNumber)));
}
