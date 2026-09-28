import type { ComparableLap } from '../../../../shared/types/index.js';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import type { TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';

/**
 * A driver's best board lap as the compare deck shows it. The id is the one the server gives the
 * same lap (session, driver, lap number), so the deck and the lap table recognise it.
 */
export function boardLapToComparable(entry: LeaderboardEntry, carClass: string, tag: string): ComparableLap {
  const lap = entry.bestLap;
  return {
    id: `${lap.sessionId}_${entry.driverName}_lap_${lap.lapNum}`,
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
