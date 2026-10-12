/** Test-only parity oracle for the paged progression and comparable-lap queries. */
import type { DetailedSession, ComparableLap, SessionProgressionPoint } from '../../shared/types/index.js';
import { compareSessions, computeTheoreticalGap, getDisplayTrackName } from '../../shared/domain/formatters.js';
import { computeTopNLapAverage, computeConsistencyRating, selectCleanLapCandidates } from '../../shared/domain/lapComparison.js';
import { matchesTrack } from '../../shared/domain/paceCategory.js';
import { isHumanDriver, selectLeaderboardLaps } from '../../shared/domain/leaderboard.js';
import { computeAverageLapTime, toComparableLap } from '../../server/sessions/sessionAnalytics.js';
import type { ComparableLapsResult } from '../../server/sessions/sessionAnalytics.js';

/**
 * Computes chronological session-over-session improvement points for a driver or overall.
 */
export function computeProgression(sessions: DetailedSession[], targetDriverName?: string): SessionProgressionPoint[] {
  const sorted = [...sessions].sort((a, b) => compareSessions(a, b, 'asc'));

  return sorted.map(s => {
    const driver = targetDriverName
      ? s.drivers.find(d => d.name.toLowerCase() === targetDriverName.toLowerCase())
      : s.playerDriver;

    const cleanLaps = driver?.laps && driver.laps.length > 0
      ? selectCleanLapCandidates(driver.laps)
      : [];
    const cleanLapsCount = driver?.laps && driver.laps.length > 0
      ? cleanLaps.length
      : (driver?.avgLapTime && (driver?.declaredLapsCount || 0) > 0 ? (driver.declaredLapsCount || 0) : 0);
    const declaredLapsCount = driver?.declaredLapsCount || 0;
    const avgLapTime = driver?.laps ? computeAverageLapTime(driver.laps) : null;

    // Top 3 Clean Lap Average (filters out lap 1, pit stops, and out-laps after valid pit stops)
    const top3Average = computeTopNLapAverage(driver?.laps || [], 3);

    // Theoretical Gap (Execution gap: Actual Best - Theoretical Best)
    const theoreticalGap = computeTheoreticalGap(driver?.bestLapTime, driver?.theoreticalBest);

    // Consistency score (%) based on standard deviation of clean flying laps
    const consistencyRating = computeConsistencyRating(driver?.laps || []);
    const consistencyScore = consistencyRating.consistencyScore;

    return {
      sessionId: s.id,
      timestamp: s.timestamp,
      timeString: s.timeString,
      sessionType: s.sessionType,
      sessionName: s.sessionName,
      trackVenue: s.trackVenue,
      trackCourse: s.trackCourse,
      displayTrack: getDisplayTrackName(s.trackVenue, s.trackCourse),
      weather: s.weather,
      carType: driver?.carType || 'Unknown Car',
      carClass: driver?.carClass || 'General',
      driverName: driver?.name || 'Unknown',
      bestLapTime: driver?.bestLapTime || null,
      bestS1: driver?.bestS1 || null,
      bestS2: driver?.bestS2 || null,
      bestS3: driver?.bestS3 || null,
      theoreticalBest: driver?.theoreticalBest || null,
      cleanLapsCount,
      declaredLapsCount,
      avgLapTime,
      top3Average,
      theoreticalGap,
      consistencyScore,
      settings: s.settings?.serverName || s.settings?.modeSetting
        ? { serverName: s.settings?.serverName, modeSetting: s.settings?.modeSetting }
        : undefined,
    };
  });
}


/**
 * Extracts and aggregates comparable laps across sessions matching a specific track and optional filters.
 */
export function extractComparableLaps(
  sessions: DetailedSession[],
  filters: {
    trackName?: string;
    carClass?: string;
    carType?: string;
    driverName?: string;
    sessionId?: string;
    playerOnly?: boolean;
    /** Leaves out the AI drivers of offline sessions, for the track records too. */
    humansOnly?: boolean;
  }
): ComparableLapsResult {
  const normTrack = (filters.trackName || '').toLowerCase().trim();
  const targetClass = (filters.carClass || '').trim();
  const targetModel = (filters.carType || '').toLowerCase().trim();
  const targetDriver = (filters.driverName || '').toLowerCase().trim();

  const matchingSessions = sessions.filter(s => {
    if (!normTrack || normTrack === 'all') return true;
    return matchesTrack(filters.trackName, s.trackVenue, s.trackCourse);
  });

  const laps: ComparableLap[] = [];
  let allTimeBestLap: ComparableLap | null = null;
  let playerBestLap: ComparableLap | null = null;
  let overallTrackBestLap: ComparableLap | null = null;
  let bestS1: number | null = null;
  let bestS2: number | null = null;
  let bestS3: number | null = null;

  matchingSessions.forEach(s => {
    if (filters.sessionId && s.id !== filters.sessionId) {
      // If a specific session is requested for isolation, but we still search all matching sessions for all-time stats
    }

    // Check all drivers in matching sessions to determine overall track record without driver restriction
    (s.drivers || []).forEach(d => {
      const isPlayerDriver = Boolean(d.isPlayer ||
        (typeof s.playerDriver?.driverOrdinal === 'number' && d.driverOrdinal === s.playerDriver.driverOrdinal));
      // The personal best comes from the same laps as the best sectors, so the theoretical best never exceeds it.
      const leaderboardLaps = isPlayerDriver ? new Set(selectLeaderboardLaps(d.laps || [])) : null;
      if (filters.humansOnly && !isHumanDriver(s, d)) return;
      if (targetClass && targetClass !== 'All' && d.carClass !== targetClass) {
        return;
      }

      if (targetModel && targetModel !== 'all' && d.carType.toLowerCase().trim() !== targetModel) {
        return;
      }

      (d.laps || []).forEach(l => {
        if (l.isValid && l.lapTime && l.lapTime > 0) {
          if (!overallTrackBestLap || overallTrackBestLap.lapTime === null || l.lapTime < overallTrackBestLap.lapTime) {
            overallTrackBestLap = toComparableLap(s, d, l, {
              isOverallTrackBest: true,
              tag: `🏆 All-Time Best (${d.name})`,
            });
          }

          if (leaderboardLaps?.has(l) && (!playerBestLap || playerBestLap.lapTime === null || l.lapTime < playerBestLap.lapTime)) {
            playerBestLap = toComparableLap(s, d, l, {
              isAllTimePB: true,
              isPlayer: true,
              tag: '⭐ Personal Best',
            });
          }
        }
      });
    });

    const driversToProcess = filters.playerOnly
      ? (s.playerDriver ? [s.playerDriver] : s.drivers.filter(d => d.isPlayer))
      : s.drivers;

    driversToProcess.forEach(d => {
      if (filters.humansOnly && !isHumanDriver(s, d)) return;
      if (targetDriver && targetDriver !== 'all' && !d.name.toLowerCase().includes(targetDriver)) {
        return;
      }

      if (targetClass && targetClass !== 'All' && d.carClass !== targetClass) {
        return;
      }

      if (targetModel && targetModel !== 'all' && d.carType.toLowerCase().trim() !== targetModel) {
        return;
      }

      const sessionBestTime = d.bestLapTime;
      // The best lap and sectors come from the laps a leaderboard counts, as the rival's theoretical gap does.
      const representative = new Set(selectLeaderboardLaps(d.laps || []));

      (d.laps || []).forEach(l => {
        const isSessionBest = l.lapTime !== null && sessionBestTime !== null && Math.abs(l.lapTime - sessionBestTime) < 0.0005;
        const isPlayer = Boolean(d.isPlayer || s.playerDriver?.name === d.name);
        const isAllTimePB = false;

        const lapItem = toComparableLap(s, d, l, {
          isSessionBest,
          isAllTimePB,
          isPlayer,
        });

        if (representative.has(l) && l.lapTime !== null) {
          if (!allTimeBestLap || allTimeBestLap.lapTime === null || l.lapTime < allTimeBestLap.lapTime) {
            allTimeBestLap = { ...lapItem, isAllTimePB: true, tag: '⭐ All-Time Best Lap' };
          }
          if (l.s1 && (bestS1 === null || l.s1 < bestS1)) bestS1 = l.s1;
          if (l.s2 && (bestS2 === null || l.s2 < bestS2)) bestS2 = l.s2;
          if (l.s3 && (bestS3 === null || l.s3 < bestS3)) bestS3 = l.s3;
        }

        if (!filters.sessionId || s.id === filters.sessionId) {
          laps.push(lapItem);
        }
      });
    });
  });

  // Flag exactly one lap per driver as isAllTimePB (fastest valid lap), keyed by index
  const bestLapIndexByDriver = new Map<string, number>();
  laps.forEach((item, idx) => {
    if (!item.isValid || item.lapTime === null || item.lapTime <= 0) return;
    const key = item.driverName.toLowerCase().trim();
    const bestIdx = bestLapIndexByDriver.get(key);
    if (bestIdx === undefined || (laps[bestIdx].lapTime ?? Infinity) > item.lapTime) {
      bestLapIndexByDriver.set(key, idx);
    }
  });
  const bestLapIndices = new Set(bestLapIndexByDriver.values());
  laps.forEach((item, idx) => {
    item.isAllTimePB = bestLapIndices.has(idx);
  });

  const theoreticalBestSec = bestS1 !== null && bestS2 !== null && bestS3 !== null
    ? parseFloat((bestS1 + bestS2 + bestS3).toFixed(3))
    : null;

  return {
    laps,
    allTimeBestLap,
    playerBestLap,
    overallTrackBestLap,
    bestS1,
    bestS2,
    bestS3,
    theoreticalBestSec,
    sessionsCount: matchingSessions.length,
  };
}
