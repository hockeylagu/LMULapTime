import type { DetailedSession, DriverData, LapData } from '../types/index.js';

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
