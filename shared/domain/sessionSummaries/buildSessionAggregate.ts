import type { DetailedSession } from '../../types/index.js';
import type { SessionAggregateProjection, SessionDriverProjection, SessionLapProjection } from '../../types/sessionSummaries.js';

/** Reuse driver projections; never recalculate clean pace or lap classification here. */
export function buildSessionAggregate(session: DetailedSession, drivers: SessionDriverProjection[], laps: SessionLapProjection[], primary: number): SessionAggregateProjection {
  const player = drivers.find(driver => driver.isPlayer) ?? null;
  const source = player ? session.drivers[player.driverOrdinal] : undefined;
  const trackLengthMeters = session.trackLengthMeters ?? null;
  const timeString = session.timeString ?? '';
  const fallbackTimestamp = Date.parse(timeString.replace(/\//g, '-') + (timeString ? 'Z' : ''));
  const primaryLaps = laps.filter(lap => lap.driverOrdinal === primary);
  return {
    player, timeString, sessionDay: timeString.split(' ')[0], trackLengthMeters,
    eventTimestamp: session.timestamp > 0 ? session.timestamp : Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0,
    distanceKm: (trackLengthMeters ?? 5000) * (player?.lapsCount ?? 0) / 1000,
    // Preserve the activity card's historical 4.5 km estimate when track length is absent.
    activityDistanceKm: (trackLengthMeters ?? 4500) * (player?.lapsCount ?? 0) / 1000,
    positionGain: source?.positionGain ?? null, bestLapTimeString: source?.bestLapTimeString ?? '',
    primaryLapCount: primaryLaps.length, primaryValidLapCount: primaryLaps.filter(lap => lap.isValid).length,
  };
}
