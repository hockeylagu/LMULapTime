import { DetailedSession, DriverData, LapData } from '../../../shared/types/index.js';
import { getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { normalizeCarClass } from '../../../shared/domain/paceCategory.js';


import { buildTelemetryComparePath } from '../../utils/telemetryCompareLink.js';

/**
 * The /telemetry path of one lap of the session's replay, for the driver selected on the session page:
 * without the driver name the telemetry view opens the player's lap.
 */
export function sessionTelemetryPath(
  current: URLSearchParams,
  session: DetailedSession,
  driver: DriverData | undefined,
  lap: LapData | number,
): string | null {
  if (!driver) return null;
  const driverOrdinal = sourceDriverOrdinal(session, driver);
  const sourceDriver = driverOrdinal >= 0 ? session.drivers?.[driverOrdinal] : undefined;
  const driverLaps = sourceDriver?.laps ?? driver.laps;
  const lapMatches = (candidate: LapData) => typeof lap === 'number'
    ? candidate.lapNum === lap
    : candidate.lapNum === lap.lapNum && candidate.lapTime === lap.lapTime && candidate.s1 === lap.s1 && candidate.s2 === lap.s2 && candidate.s3 === lap.s3;
  const matches = driverLaps.map((candidate, index) => lapMatches(candidate) ? index : -1).filter((index) => index >= 0);
  const lapOrdinal = typeof lap !== 'number' && driverLaps.includes(lap) ? driverLaps.indexOf(lap) : matches.length === 1 ? matches[0] : -1;
  if (driverOrdinal < 0 || lapOrdinal < 0) return null;
  return buildTelemetryComparePath(current, { sessionId: session.id, driverOrdinal, lapOrdinal, driverName: driver.name }, null);
}

function sourceDriverOrdinal(session: { drivers?: DriverData[] }, driver: Partial<DriverData>): number {
  const drivers = session.drivers ?? [];
  const exact = drivers.indexOf(driver as DriverData);
  if (exact >= 0) return exact;
  if (!driver.name || !driver.carType || !driver.carNumber || driver.isPlayer === undefined) return -1;
  const candidates = drivers.flatMap((candidate, index) =>
    candidate.name === driver.name && candidate.carType === driver.carType && candidate.carNumber === driver.carNumber && candidate.isPlayer === driver.isPlayer
      ? [index] : []
  );
  return candidates.length === 1 ? candidates[0] : -1;
}

/**
 * The leaderboard's compare card opened on one lap of the session. The class is the leaderboard's
 * (LMGT3, not the results file's GT3), so the lap is found on its board.
 */
export function sessionLapComparePath(
  session: Pick<DetailedSession, 'id' | 'trackVenue' | 'trackCourse'> & { drivers?: DetailedSession['drivers'] },
  driver: (Pick<DriverData, 'carClass' | 'carType'> & Partial<DriverData>) | undefined,
  lapNum: number | null | undefined,
): string {
  const params = new URLSearchParams({
    track: getDisplayTrackName(session.trackVenue, session.trackCourse),
    carClass: normalizeCarClass(driver?.carClass, driver?.carType) || 'LMGT3',
    sessionId: session.id,
  });
  if (lapNum) params.set('lapNum', String(lapNum));
  if (driver) {
    const driverOrdinal = sourceDriverOrdinal(session, driver);
    const sourceDriver = driverOrdinal >= 0 ? session.drivers?.[driverOrdinal] : undefined;
    const matches = (sourceDriver?.laps ?? driver.laps ?? []).flatMap((lap, index) => lap.lapNum === lapNum ? [index] : []);
    const lapOrdinal = matches.length === 1 ? matches[0] : -1;
    if (driverOrdinal >= 0 && lapOrdinal >= 0) {
      params.set('driverOrdinal', String(driverOrdinal));
      params.set('lapOrdinal', String(lapOrdinal));
    }
  }
  return `/leaderboard?${params.toString()}`;
}

export { findWeekendSessions, isSameWeekendSession, areSameTrackLayout } from '../../../shared/domain/weekendSessions.js';
export type { CandidateRelatedSession, WeekendSessionType, WeekendSessionLink } from '../../../shared/domain/weekendSessions.js';
