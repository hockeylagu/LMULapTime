import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import type { LapPlaces } from '../../../utils/lapTrafficText.js';
import type { LapDetailContext } from './lapDetailSections.js';
import { lapClassPosition } from '../../../../shared/domain/lapPlaces.js';
import { lapEvents, type LapEvents } from '../../../../shared/domain/lapComparison.js';
import { damageBeforeStop, type LapPitStop } from './pitStopText.js';

/** The driver's place at the end of the previous lap and of this one, when both are known. */
export function lapPlaces(
  session: DetailedSession, driver: DriverData | undefined, lap: LapData, prevLap: LapData | null, isMultiClass: boolean,
  positions?: ReadonlyMap<LapData, number>
): LapPlaces | undefined {
  if (!prevLap || prevLap.position <= 0 || lap.position <= 0) return undefined;
  return {
    from: positions?.get(prevLap) ?? lapClassPosition(session, driver, prevLap, isMultiClass),
    to: positions?.get(lap) ?? lapClassPosition(session, driver, lap, isMultiClass),
    inClass: isMultiClass,
  };
}

/** The stop a lap is part of: its own when it is the in-lap, the previous lap's when it is the out-lap. */
export function lapPitStop(driver: Pick<DriverData, 'laps' | 'incidents'>, lap: LapData, prevLap: LapData | null): LapPitStop | undefined {
  const laps = driver.laps;
  const inLap = lap.isPitStop ? lap : lap.isOutLap && prevLap?.isPitStop ? prevLap : undefined;
  if (!inLap) return undefined;
  const onOutLap = inLap !== lap;
  return {
    inLap,
    outLap: onOutLap ? lap : laps.find((l) => l.lapNumber === lap.lapNumber + 1 && l.isOutLap),
    damageBefore: inLap.pitService ? damageBeforeStop(driver, inLap) : undefined,
    onOutLap,
  };
}

/** What the rest of the driver's race adds to a lap's expanded row. */
export function lapDetailContext(
  session: DetailedSession, driver: DriverData | undefined, lap: LapData, prevLap: LapData | null, isMultiClass: boolean,
  positions?: ReadonlyMap<LapData, number>
): LapDetailContext & { events: LapEvents } {
  return {
    places: lapPlaces(session, driver, lap, prevLap, isMultiClass, positions),
    pitStop: driver ? lapPitStop(driver, lap, prevLap) : undefined,
    events: lapEvents(driver ?? {}, lap.lapNumber),
  };
}
