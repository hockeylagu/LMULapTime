import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import type { LapPlaces } from '../../../utils/lapTrafficText.js';
import type { LapDetailContext } from './lapDetailSections.js';
import { damageBeforeStop, type LapPitStop } from './pitStopText.js';

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

/** The driver's place at the end of the previous lap and of this one, when both are known. */
export function lapPlaces(
  session: DetailedSession, driver: DriverData | undefined, lap: LapData, prevLap: LapData | null, isMultiClass: boolean
): LapPlaces | undefined {
  if (!prevLap || prevLap.position <= 0 || lap.position <= 0) return undefined;
  return {
    from: lapClassPosition(session, driver, prevLap, isMultiClass),
    to: lapClassPosition(session, driver, lap, isMultiClass),
    inClass: isMultiClass,
  };
}

/** The stop a lap is part of: its own when it is the in-lap, the previous lap's when it is the out-lap. */
export function lapPitStop(laps: LapData[], lap: LapData, prevLap: LapData | null): LapPitStop | undefined {
  const inLap = lap.isPitStop ? lap : lap.isOutLap && prevLap?.isPitStop ? prevLap : undefined;
  if (!inLap) return undefined;
  const onOutLap = inLap !== lap;
  return {
    inLap,
    outLap: onOutLap ? lap : laps.find((l) => l.lapNum === lap.lapNum + 1 && l.isOutLap),
    damageBefore: inLap.pitService ? damageBeforeStop(laps, inLap) : undefined,
    onOutLap,
  };
}

/** What the rest of the driver's race adds to a lap's expanded row. */
export function lapDetailContext(
  session: DetailedSession, driver: DriverData | undefined, lap: LapData, prevLap: LapData | null, isMultiClass: boolean
): LapDetailContext {
  return {
    places: lapPlaces(session, driver, lap, prevLap, isMultiClass),
    pitStop: lapPitStop(driver?.laps ?? [], lap, prevLap),
  };
}
