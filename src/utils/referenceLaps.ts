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

/**
 * The debrief's reference: the fastest lap on this layout in the same car, by any driver, other
 * than the lap being analysed. When the analysed lap is the fastest there is, that makes the
 * reference the next fastest same-car lap. `laps` are the comparison laps for this layout and
 * car; only laps with a replay to compare against, driven at racing speed and not marked
 * non-representative, qualify.
 */
export function pickFastestSameCarLap(laps: ComparableLap[], analysed: AnalysedLap): ComparableLap | null {
  let best: ComparableLap | null = null;
  for (const lap of laps) {
    if (!lap.matchingReplayFile || !sameCar(lap.carType, analysed.carType)) continue;
    if (!lap.isValid || lap.isPitStop || lap.isOutLap || lap.nonRepresentativeReason) continue;
    if (typeof lap.lapTime !== 'number' || lap.lapTime <= 0) continue;
    if (lap.sessionId === analysed.sessionId && lap.driverName === analysed.driverName && lap.lapNum === analysed.lapNum) continue;
    if (!best || lap.lapTime < (best.lapTime as number)) best = lap;
  }
  return best;
}
