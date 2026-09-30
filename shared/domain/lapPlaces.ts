import type { DetailedSession, DriverData, LapData } from '../types/index.js';

/** Index a driver's lap positions once, preserving the first recorded lap of each rival. */
export function lapClassPositions(session: DetailedSession, driver: DriverData | undefined, isMultiClass: boolean): ReadonlyMap<LapData, number> {
  const positions = new Map<LapData, number>();
  const laps = driver?.laps ?? [];
  const peers = new Map<number, number[]>();
  if (isMultiClass) {
    const carClass = (driver?.carClass || '').toLowerCase();
    for (const other of session.drivers || []) {
      if (other.name === driver?.name || (other.carClass || '').toLowerCase() !== carClass) continue;
      const seen = new Set<number>();
      for (const lap of other.laps || []) {
        if (seen.has(lap.lapNum)) continue;
        seen.add(lap.lapNum);
        if (lap.position <= 0) continue;
        const onLap = peers.get(lap.lapNum) ?? [];
        onLap.push(lap.position);
        peers.set(lap.lapNum, onLap);
      }
    }
  }
  for (const lap of laps) {
    positions.set(lap, !isMultiClass || lap.position <= 0 ? lap.position
      : 1 + (peers.get(lap.lapNum) ?? []).filter(position => position < lap.position).length);
  }
  return positions;
}

/**
 * The driver's position at the end of a lap: in their class in a multiclass session (the cars of
 * the class ahead of them on that lap, plus one), otherwise overall.
 */
export function lapClassPosition(session: DetailedSession, driver: DriverData | undefined, lap: LapData, isMultiClass: boolean): number {
  if (!isMultiClass || lap.position <= 0) return lap.position;
  const carClass = (driver?.carClass || '').toLowerCase();
  return 1 + (session.drivers || [])
    .filter((d) => d.name !== driver?.name && (d.carClass || '').toLowerCase() === carClass)
    .filter((d) => {
      const otherLap = d.laps?.find((ol) => ol.lapNum === lap.lapNum);
      return otherLap && otherLap.position > 0 && otherLap.position < lap.position;
    }).length;
}
