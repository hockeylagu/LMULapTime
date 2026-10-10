import type { ComparableLap } from '../../../../shared/types/index.js';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import type { TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';

/** The id the server gives a driver's best board lap (session, driver, lap number). */
export function boardLapId(entry: LeaderboardEntry): string {
  const lap = entry.bestLap;
  return Number.isInteger(lap.driverOrdinal) && Number.isInteger(lap.lapOrdinal)
    ? `${lap.sessionId}_driver_${lap.driverOrdinal}_lap_${lap.lapOrdinal}`
    : `${lap.sessionId}_${entry.driverName}_lap_${lap.lapNum}`;
}

/**
 * A driver's best board lap as the compare deck shows it. It keeps the id the server gives the
 * same lap, so the deck, the presets and the board recognise it.
 */
export function boardLapToComparable(entry: LeaderboardEntry, carClass: string, tag: string): ComparableLap {
  const lap = entry.bestLap;
  return {
    id: boardLapId(entry),
    sessionId: lap.sessionId,
    ...(lap.driverOrdinal === undefined ? {} : { driverOrdinal: lap.driverOrdinal }),
    ...(lap.lapOrdinal === undefined ? {} : { lapOrdinal: lap.lapOrdinal }),
    sessionName: lap.sessionName,
    sessionType: lap.sessionType,
    timestamp: lap.timestamp,
    driverName: entry.driverName,
    carType: lap.carType,
    carClass,
    lapNum: lap.lapNum,
    lapTime: lap.lapTime,
    lapTimeString: formatTime(lap.lapTime),
    s1: lap.s1,
    s2: lap.s2,
    s3: lap.s3,
    s1String: formatTime(lap.s1),
    s2String: formatTime(lap.s2),
    s3String: formatTime(lap.s3),
    topSpeed: null,
    isValid: true,
    isPlayer: entry.isPlayer,
    tag,
  };
}

/** The lap as the telemetry view opens it; null unless its source-order locator is available. */
export function boardLapTelemetryRef(entry: LeaderboardEntry): TelemetryLapRef | null {
  const lap = entry.bestLap;
  if (!Number.isInteger(lap.driverOrdinal) || !Number.isInteger(lap.lapOrdinal)) return null;
  return {
    sessionId: lap.sessionId,
    driverOrdinal: lap.driverOrdinal as number,
    lapOrdinal: lap.lapOrdinal as number,
    driverName: entry.driverName,
    lapNum: lap.lapNum,
  };
}
