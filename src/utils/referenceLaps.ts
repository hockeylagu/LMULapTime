import type { ComparableLap } from '../../shared/types/index.js';

const sameCar = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The lap to compare against by default: the driver's fastest lap on this layout in the car they
 * are driving in this replay, when it beats the lap on screen. `laps` are the replay-backed
 * comparison laps already filtered to this layout and car class; the car is read from this
 * replay's own laps, so car names never have to match across data sources.
 * Laps the parser marked non-representative are skipped.
 */
export function suggestReferenceLap(
  laps: ComparableLap[],
  replayName: string | null,
  driverName: string | null,
  currentLapNumber: number | null | undefined,
  currentLapTime: number | null | undefined
): ComparableLap | null {
  if (!replayName || !driverName) return null;
  const driversLaps = laps.filter(l => l.driverName === driverName);
  const carType = driversLaps.find(l => l.matchingReplayFile === replayName)?.carType;
  if (!carType) return null;

  let best: ComparableLap | null = null;
  for (const lap of driversLaps) {
    if (!sameCar(lap.carType, carType) || lap.nonRepresentativeReason) continue;
    if (lap.matchingReplayFile === replayName && lap.lapNum === currentLapNumber) continue;
    if (typeof lap.lapTime !== 'number' || lap.lapTime <= 0) continue;
    if (!best || lap.lapTime < (best.lapTime as number)) best = lap;
  }
  if (!best) return null;
  if (typeof currentLapTime === 'number' && currentLapTime > 0 && (best.lapTime as number) >= currentLapTime) return null;
  return best;
}

/** The lap being analysed, as the session knows it. */
export interface AnalysedLap {
  sessionId: string;
  driverName: string;
  lapNum: number;
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
    return !(lap.sessionId === analysed.sessionId && lap.driverName === analysed.driverName && lap.lapNum === analysed.lapNum);
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
