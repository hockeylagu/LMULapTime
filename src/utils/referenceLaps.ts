import type { ComparableLap } from '../../shared/types/index.js';

const sameCar = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The lap being analysed, as the session knows it. */
export interface AnalysedLap {
  sessionId: string;
  driverName: string;
  lapNumber: number;
  carType: string;
}

/** How much faster than the analysed lap the realistic reference aims to be (0.5%). */
export const ATTAINABLE_GAIN_RATIO = 0.005;

/**
 * Same-car laps on this layout the debrief can compare against: with a replay, driven at racing
 * speed, not marked non-representative, and not the lap being analysed.
 */
function sameCarCandidates(laps: ComparableLap[], analysed: AnalysedLap): Array<ComparableLap & { lapTime: number }> {
  return laps.filter((lap): lap is ComparableLap & { lapTime: number } => {
    if (!lap.matchingReplayFile || !sameCar(lap.carType, analysed.carType)) return false;
    if (!lap.isValid || lap.isPitStop || lap.isOutLap || lap.nonRepresentativeReason) return false;
    if (typeof lap.lapTime !== 'number' || lap.lapTime <= 0) return false;
    return !(lap.sessionId === analysed.sessionId && lap.driverName === analysed.driverName && lap.lapNumber === analysed.lapNumber);
  });
}

/**
 * The debrief's technique reference: the fastest lap on this layout in the same car, by any
 * driver, other than the lap being analysed (the next fastest when the analysed lap is the
 * fastest there is). It shows the best way through each corner, however far off it is.
 */
export function pickFastestSameCarLap(laps: ComparableLap[], analysed: AnalysedLap): ComparableLap | null {
  let best: ComparableLap | null = null;
  for (const lap of sameCarCandidates(laps, analysed)) {
    if (!best || lap.lapTime < (best.lapTime as number)) best = lap;
  }
  return best;
}

/**
 * The debrief's realistic reference: the same-car lap closest to ATTAINABLE_GAIN_RATIO faster
 * than the analysed lap, so the time it shows per corner is within reach next session. Only
 * faster laps qualify; null when there is none.
 */
export function pickAttainableSameCarLap(laps: ComparableLap[], analysed: AnalysedLap & { lapTime: number }): ComparableLap | null {
  const target = analysed.lapTime * (1 - ATTAINABLE_GAIN_RATIO);
  let best: ComparableLap | null = null;
  for (const lap of sameCarCandidates(laps, analysed)) {
    if (lap.lapTime >= analysed.lapTime) continue;
    const distance = Math.abs(lap.lapTime - target);
    const bestDistance = best ? Math.abs((best.lapTime as number) - target) : Infinity;
    if (distance < bestDistance || (distance === bestDistance && lap.lapTime < (best?.lapTime as number))) best = lap;
  }
  return best;
}
