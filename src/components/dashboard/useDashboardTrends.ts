import { useMemo } from 'react';
import { getDisplayTrackName, isSessionEmpty, getBestLapNumber } from '../../../shared/domain/formatters.js';
import { computeConsistencyRating } from '../../../shared/domain/lapComparison.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DetailedSession } from '../../../shared/types/session.js';
import type { DashboardLatestOuting, DashboardRecentPacePoint, DashboardTrends } from '../../../shared/types/dashboard.js';

export function useDashboardTrends(sessions: (SessionCard | DetailedSession)[]): DashboardTrends {
  return useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return {
        hasData: false,
        driverName: 'Driver',
        latestOuting: null,
        todayActivity: null,
        recentPaceTrend: [],
        paceDelta: null,
        paceTrendDirection: 'none',
        paceTrendClass: null,
        recentCleanRate: null,
        recentConsistency: null,
        recentNetPositions: 0,
      };
    }

    // Sort by timestamp descending (newest first).
    // When timeString matches, break ties using timestamp, then prefer Race > Qualifying > Practice.
    const SESSION_TYPE_ORDER: Record<string, number> = {
      Race: 3,
      Qualifying: 2,
      Practice: 1,
      Warmup: 1,
      Test: 1,
    };

    // Parse once per session instead of twice on every sort comparison.
    const times = new Map(sessions.map(session => [session,
      session.timeString ? new Date(session.timeString.replace(/\//g, '-')).getTime() : 0,
    ]));
    const sorted = [...sessions].sort((a, b) => {
      const timeA = times.get(a) ?? 0;
      const timeB = times.get(b) ?? 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      const stampA = a.timestamp ?? 0;
      const stampB = b.timestamp ?? 0;
      if (stampB !== stampA) {
        return stampB - stampA;
      }
      const rankA = SESSION_TYPE_ORDER[a.sessionType] || 0;
      const rankB = SESSION_TYPE_ORDER[b.sessionType] || 0;
      return rankB - rankA;
    });

    // Detect driver name from newest sessions
    let driverName = 'Driver';
    for (const s of sorted) {
      if (s.playerDriver?.name && s.playerDriver.name.trim() !== '') {
        driverName = s.playerDriver.name;
        break;
      }
    }

    // Filter for valid non-empty sessions:
    // Exclude sessions with 0 laps, null best lap times, or incomplete driver stints
    const validSessions = sorted.filter(s => {
      if (!s.playerDriver) return false;
      const laps = s.playerDriver.lapsCount ?? 0;
      if (laps <= 0) return false;
      const hasNumericBest = typeof s.playerDriver.bestLapTime === 'number' && s.playerDriver.bestLapTime > 0;
      const hasStringBest = Boolean(
        s.playerDriver.bestLapTimeString &&
        s.playerDriver.bestLapTimeString.trim() !== '' &&
        s.playerDriver.bestLapTimeString !== '--:--.---'
      );
      if (!hasNumericBest && !hasStringBest) return false;
      if (isSessionEmpty(s)) return false;
      return true;
    });

    // Find the latest outing:
    // Never pick an empty session, and prefer Race sessions over Practice/Qualifying
    let latestRaw: SessionCard | DetailedSession | undefined;

    if (validSessions.length > 0) {
      const newestValid = validSessions[0];
      const newestValidTime = times.get(newestValid) ?? 0;
      const newestDateStr = newestValid.timeString?.split(' ')[0] || '';

      // 1. If there is a valid non-empty Race session on the same day/event, prefer it!
      const sameDayRace = validSessions.find(
        s => s.sessionType === 'Race' && s.timeString && s.timeString.startsWith(newestDateStr)
      );

      if (sameDayRace) {
        latestRaw = sameDayRace;
      } else {
        // 2. If no Race on the same day, check for a recent Race in the last 5 sessions or within 7 days
        const recentRace = validSessions.slice(0, 5).find(s => {
          if (s.sessionType !== 'Race') return false;
          if (!s.timeString || !newestValidTime) return true;
          const sTime = times.get(s) ?? 0;
          return newestValidTime - sTime <= 7 * 24 * 60 * 60 * 1000;
        });

        latestRaw = recentRace || newestValid;
      }
    } else {
      // Fallback: If all sessions in history are technically empty, prefer Race, then whatever has laps
      latestRaw =
        sorted.find(
          s =>
            s.sessionType === 'Race' &&
            s.playerDriver &&
            (s.playerDriver.lapsCount > 0 || Boolean(s.playerDriver.bestLapTimeString))
        ) ||
        sorted.find(
          s => s.playerDriver && (s.playerDriver.lapsCount > 0 || Boolean(s.playerDriver.bestLapTimeString))
        ) ||
        sorted.find(s => Boolean(s.playerDriver));
    }

    let latestOuting: DashboardLatestOuting | null = null;
    if (latestRaw && latestRaw.playerDriver) {
      const p = latestRaw.playerDriver;
      const trackName = getDisplayTrackName(latestRaw.trackVenue, latestRaw.trackCourse);
      latestOuting = {
        id: latestRaw.id,
        trackName,
        trackVenue: latestRaw.trackVenue,
        trackCourse: latestRaw.trackCourse,
        sessionType: latestRaw.sessionType,
        timeString: latestRaw.timeString,
        carType: p.carType,
        carClass: p.carClass ? p.carClass : undefined,
        bestLapTimeString: p.bestLapTimeString,
        bestLapTime: p.bestLapTime,
        bestLapNum: getBestLapNumber(p),
        driverOrdinal: p.driverOrdinal,
        bestLapOrdinal: 'bestLapOrdinal' in p ? p.bestLapOrdinal : null,
        pacePercentage: p.bestLapPacePercentage,
        paceCategory: p.bestLapPaceCategory,
        bestLapWet: p.bestLapWet,
        position: p.position,
        gridPosition: 'gridPosition' in p ? p.gridPosition : null,
        positionGain: 'positionGain' in p ? p.positionGain : null,
        lapsCount: p.lapsCount || 0,
        hasReplay: Boolean(latestRaw.matchingReplayFile),
        hasDuckDbTelemetry: Boolean(
          latestRaw.hasDuckDbTelemetry ||
          latestRaw.matchingReplayFile?.hasDuckDbTelemetry
        ),
      };
    }

    // Activity on the latest outing's calendar day
    let todayActivity: DashboardTrends['todayActivity'] = null;
    if (latestOuting && latestOuting.timeString) {
      const latestDateStr = latestOuting.timeString.split(' ')[0] || '';
      if (latestDateStr) {
        const sameDaySessions = sorted.filter(s => s.timeString && s.timeString.startsWith(latestDateStr));
        let lapsCount = 0;
        let distanceKm = 0;

        for (const s of sameDaySessions) {
          const lCount = s.playerDriver?.lapsCount ?? 0;
          lapsCount += lCount;
          const trackLen = s.trackLengthMeters ? s.trackLengthMeters / 1000 : 4.5;
          distanceKm += lCount * trackLen;
        }

        todayActivity = {
          dateString: latestDateStr,
          sessionsCount: sameDaySessions.length,
          lapsCount,
          distanceKm: Number(distanceKm.toFixed(1)),
        };
      }
    }

    // Recent pace progression points (chronological order: oldest -> newest, max 6 points), in the
    // latest outing's car class only: a GT3 lap and a Hypercar lap are not one progression.
    const trendClass = latestRaw?.playerDriver
      ? latestRaw.playerDriver.carClass
      : '';
    const recentWithPace: DashboardRecentPacePoint[] = [];
    for (const s of sorted) {
      const inTrendClass = !trendClass || (s.playerDriver?.carClass ?? '') === trendClass;
      if (inTrendClass && s.playerDriver?.bestLapPacePercentage && s.playerDriver.bestLapPacePercentage > 0) {
        recentWithPace.push({
          id: s.id,
          trackName: getDisplayTrackName(s.trackVenue, s.trackCourse),
          carType: s.playerDriver.carType,
          timeString: s.timeString,
          bestLapTimeString: s.playerDriver.bestLapTimeString,
          pacePercentage: Number(s.playerDriver.bestLapPacePercentage.toFixed(2)),
          paceCategory: s.playerDriver.bestLapPaceCategory,
        });
        if (recentWithPace.length >= 6) break;
      }
    }

    // Reverse to chronological order (oldest -> newest) for display as a progression timeline
    const chronologicalPace = [...recentWithPace].reverse();

    // Pace delta: positive means improving (e.g. 103.5% down to 102.4% is +1.1% gain)
    let paceDelta: number | null = null;
    let paceTrendDirection: 'improving' | 'declining' | 'steady' | 'none' = 'none';

    if (chronologicalPace.length >= 2) {
      const oldestPace = chronologicalPace[0].pacePercentage;
      const newestPace = chronologicalPace[chronologicalPace.length - 1].pacePercentage;
      paceDelta = Number((oldestPace - newestPace).toFixed(2));
      // Under 0.3% the change is lap-to-lap noise (under 0.4 s on a 2-minute lap), not a trend.
      paceTrendDirection = paceDelta >= 0.3 ? 'improving' : paceDelta <= -0.3 ? 'declining' : 'steady';
    }

    // Recent stint stats (clean rate, lap consistency & positions across recent sessions)
    const recentWindow = sorted.slice(0, 8);
    let totalLaps = 0;
    let cleanLaps = 0;
    let recentNetPositions = 0;
    const consistencyScores: number[] = [];

    for (const s of recentWindow) {
      const laps = s.playerDriver && 'laps' in s.playerDriver ? s.playerDriver.laps : undefined;
      if (laps && laps.length > 0) {
        for (const lap of laps) {
          totalLaps++;
          if (lap.isValid) cleanLaps++;
        }
        const rating = computeConsistencyRating(laps);
        if (rating.consistencyScore !== null) {
          consistencyScores.push(rating.consistencyScore);
        }
      }
      const gain = s.playerDriver && 'positionGain' in s.playerDriver ? s.playerDriver.positionGain : null;
      if (gain !== null && gain !== undefined) {
        recentNetPositions += gain;
      }
    }

    const recentCleanRate = totalLaps > 0 ? Number(((cleanLaps / totalLaps) * 100).toFixed(1)) : null;
    const recentConsistency =
      consistencyScores.length > 0
        ? Number((consistencyScores.reduce((acc, score) => acc + score, 0) / consistencyScores.length).toFixed(1))
        : null;

    return {
      hasData: true,
      driverName,
      latestOuting,
      todayActivity,
      recentPaceTrend: chronologicalPace,
      paceDelta,
      paceTrendDirection,
      paceTrendClass: trendClass || null,
      recentCleanRate,
      recentConsistency,
      recentNetPositions,
    };
  }, [sessions]);
}
