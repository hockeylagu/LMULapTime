import type { ComparableLap } from '../../../../shared/types/index.js';

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
