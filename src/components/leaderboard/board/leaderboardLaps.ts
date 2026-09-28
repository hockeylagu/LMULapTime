import type { ComparableLap } from '../../../../shared/types/index.js';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import type { TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';

/** The id the server gives a driver's best board lap (session, driver, lap number). */
export function boardLapId(entry: LeaderboardEntry): string {
  return `${entry.bestLap.sessionId}_${entry.driverName}_lap_${entry.bestLap.lapNum}`;
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
    matchingReplayFile: lap.replayName ?? undefined,
    tag,
  };
}

/** The lap as the telemetry view opens it; null without the replay that recorded it. */
export function boardLapTelemetryRef(entry: LeaderboardEntry): TelemetryLapRef | null {
  const lap = entry.bestLap;
  if (!lap.replayName) return null;
  return { replayName: lap.replayName, sessionId: lap.sessionId, driverName: entry.driverName, lapNum: lap.lapNum };
}
