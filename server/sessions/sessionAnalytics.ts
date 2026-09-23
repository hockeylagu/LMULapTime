import {
  DetailedSession,
  ComparableLap,
  SessionProgressionPoint,
  TrackSummary,
  LapData,
} from '../core/types.js';
import {
  formatTime,
  compareSessions,
  computeTheoreticalBest,
  computeTheoreticalGap,
  getDisplayTrackName,
  minValidTime,
} from '../../src/utils/formatters.js';
import {
  computeTopNLapAverage,
  computeConsistencyRating,
  selectCleanLapCandidates,
} from '../../src/utils/lapComparison.js';
import { matchesTrack, matchesCarClass } from '../../src/utils/paceCategory.js';

const updateMinTime = minValidTime;

export const computeAverageLapTime = (laps: LapData[]): number | null => {
  const candidates = selectCleanLapCandidates(laps);
  if (candidates.length === 0) return null;
  const sum = candidates.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  return parseFloat((sum / candidates.length).toFixed(3));
};

export interface ComparableLapsResult {
  laps: ComparableLap[];
  allTimeBestLap: ComparableLap | null;
  playerBestLap?: ComparableLap | null;
  overallTrackBestLap: ComparableLap | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  bestS1String: string;
  bestS2String: string;
  bestS3String: string;
  theoreticalBestSec: number | null;
  theoreticalBestString: string;
  sessionsCount: number;
}

/**
 * Computes chronological session-over-session improvement points for a driver or overall.
 */
export function computeProgression(sessions: DetailedSession[], targetDriverName?: string): SessionProgressionPoint[] {
  const sorted = [...sessions].sort((a, b) => compareSessions(a, b, 'asc'));

  return sorted.map(s => {
    let driver = targetDriverName
      ? s.drivers.find(d => d.name.toLowerCase() === targetDriverName.toLowerCase())
      : s.playerDriver || s.drivers[0];

    if (!driver && s.drivers.length > 0) {
      driver = s.drivers[0];
    }

    const cleanLaps = (driver?.laps || []).filter(l => l.isValid && l.lapTime !== null && l.lapTime > 0);
    const cleanLapsCount = cleanLaps.length;
    const totalLapsCount = driver?.lapsCount || 0;
    const avgLapTime = driver?.laps ? computeAverageLapTime(driver.laps) : null;

    // Top 3 Clean Lap Average (filters out lap 1, pit stops, and out-laps after valid pit stops)
    const top3AvgLapTime = computeTopNLapAverage(driver?.laps || [], 3);

    // Theoretical Gap (Execution gap: Actual Best - Theoretical Best)
    const theoreticalGap = computeTheoreticalGap(driver?.bestLapTime, driver?.theoreticalBest);

    // Consistency score (%) based on standard deviation of clean flying laps
    const consistencyRating = computeConsistencyRating(driver?.laps || []);
    const consistencyScore = consistencyRating.consistencyScore;

    return {
      sessionId: s.id,
      timestamp: s.timestamp,
      dateString: s.timeString,
      sessionType: s.sessionType,
      sessionName: s.sessionName,
      trackVenue: s.trackVenue,
      trackCourse: s.trackCourse,
      displayTrack: getDisplayTrackName(s.trackVenue, s.trackCourse),
      weatherInfo: s.weatherInfo,
      carType: driver?.carType || 'Unknown Car',
      carClass: driver?.carClass || 'General',
      driverName: driver?.name || 'Unknown',
      bestLapTime: driver?.bestLapTime || null,
      bestS1: driver?.bestS1 || null,
      bestS2: driver?.bestS2 || null,
      bestS3: driver?.bestS3 || null,
      theoreticalBest: driver?.theoreticalBest || null,
      cleanLapsCount,
      totalLapsCount,
      avgLapTime,
      top3AvgLapTime,
      theoreticalGap,
      consistencyScore,
      matchingReplayFile: s.matchingReplayFile?.name,
    };
  });
}

/**
 * Aggregates summary statistics per track.
 */
export function computeTrackSummaries(sessions: DetailedSession[]): Record<string, TrackSummary> {
  const map: Record<string, TrackSummary> = {};

  sessions.forEach(s => {
    const track = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (!map[track]) {
      map[track] = {
        trackVenue: track,
        sessionsCount: 0,
        totalLaps: 0,
        bestLapTime: null,
        bestLapDriver: '',
        bestLapCar: '',
        bestS1: null,
        bestS2: null,
        bestS3: null,
        theoreticalBest: null,
        carsUsed: [],
      };
    }

    const summary = map[track];
    summary.sessionsCount += 1;

    const p = s.playerDriver || s.drivers.find(d => d.isPlayer);
    if (p) {
      summary.totalLaps += p.lapsCount || 0;
      if (p.carType && !summary.carsUsed.includes(p.carType)) {
        summary.carsUsed.push(p.carType);
      }

      if (p.bestLapTime && (summary.bestLapTime === null || p.bestLapTime < summary.bestLapTime)) {
        summary.bestLapTime = p.bestLapTime;
        summary.bestLapDriver = p.name;
        summary.bestLapCar = p.carType;
      }
      summary.bestS1 = updateMinTime(summary.bestS1, p.bestS1);
      summary.bestS2 = updateMinTime(summary.bestS2, p.bestS2);
      summary.bestS3 = updateMinTime(summary.bestS3, p.bestS3);
    }

    summary.theoreticalBest = computeTheoreticalBest(summary.bestS1, summary.bestS2, summary.bestS3);
  });

  return map;
}

/**
 * Extracts and aggregates comparable laps across sessions matching a specific track and optional filters.
 */
export function extractComparableLaps(
  sessions: DetailedSession[],
  filters: {
    trackName?: string;
    carClass?: string;
    carModel?: string;
    driverName?: string;
    sessionId?: string;
    playerOnly?: boolean;
  }
): ComparableLapsResult {
  const normTrack = (filters.trackName || '').toLowerCase().trim();
  const targetClass = (filters.carClass || '').trim();
  const targetModel = (filters.carModel || '').toLowerCase().trim();
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
      if (targetClass && targetClass !== 'All' && !matchesCarClass(d.carClass || '', d.carType || '', targetClass)) {
        return;
      }

      if (targetModel && targetModel !== 'all' && d.carType.toLowerCase().trim() !== targetModel) {
        return;
      }

      (d.laps || []).forEach(l => {
        if (l.isValid && l.lapTime && l.lapTime > 0) {
          if (!overallTrackBestLap || overallTrackBestLap.lapTime === null || l.lapTime < overallTrackBestLap.lapTime) {
            overallTrackBestLap = {
              id: `${s.id}_${d.name}_lap_${l.lapNum}`,
              sessionId: s.id,
              sessionName: s.sessionName,
              sessionType: s.sessionType,
              dateString: s.timeString,
              timestamp: s.timestamp,
              driverName: d.name,
              carType: d.carType,
              carClass: d.carClass || 'General',
              lapNum: l.lapNum,
              lapTime: l.lapTime,
              lapTimeString: l.lapTimeString,
              s1: l.s1,
              s2: l.s2,
              s3: l.s3,
              s1String: formatTime(l.s1),
              s2String: formatTime(l.s2),
              s3String: formatTime(l.s3),
              topSpeed: l.topSpeed,
              fCompound: l.fCompound,
              rCompound: l.rCompound,
              flCompound: l.flCompound,
              frCompound: l.frCompound,
              rlCompound: l.rlCompound,
              rrCompound: l.rrCompound,
              tireWear: l.tireWear,
              fuel: l.fuel,
              fuelUsed: l.fuelUsed,
              virtualEnergy: l.virtualEnergy,
              virtualEnergyUsed: l.virtualEnergyUsed,
              elapsedSeconds: l.elapsedSeconds,
              elapsedTimeString: l.elapsedTimeString,
              pitStopDurationString: l.pitStopDurationString,
              gapToLeaderString: l.gapToLeaderString,
              isPitStop: l.isPitStop,
              isValid: l.isValid,
              paceCategory: l.paceCategory || null,
              pacePercentage: l.pacePercentage || null,
              isOverallTrackBest: true,
              tag: `🏆 All-Time Best (${d.name})`,
              matchingReplayFile: typeof s.matchingReplayFile === 'string' ? s.matchingReplayFile : s.matchingReplayFile?.name,
            };
          }

          const isPlayerDriver = Boolean(d.isPlayer || s.playerDriver?.name === d.name);
          if (isPlayerDriver && (!playerBestLap || playerBestLap.lapTime === null || l.lapTime < playerBestLap.lapTime)) {
            playerBestLap = {
              id: `${s.id}_${d.name}_lap_${l.lapNum}`,
              sessionId: s.id,
              sessionName: s.sessionName,
              sessionType: s.sessionType,
              dateString: s.timeString,
              timestamp: s.timestamp,
              driverName: d.name,
              carType: d.carType,
              carClass: d.carClass || 'General',
              lapNum: l.lapNum,
              lapTime: l.lapTime,
              lapTimeString: l.lapTimeString,
              s1: l.s1,
              s2: l.s2,
              s3: l.s3,
              s1String: formatTime(l.s1),
              s2String: formatTime(l.s2),
              s3String: formatTime(l.s3),
              topSpeed: l.topSpeed,
              fCompound: l.fCompound,
              rCompound: l.rCompound,
              flCompound: l.flCompound,
              frCompound: l.frCompound,
              rlCompound: l.rlCompound,
              rrCompound: l.rrCompound,
              tireWear: l.tireWear,
              fuel: l.fuel,
              fuelUsed: l.fuelUsed,
              virtualEnergy: l.virtualEnergy,
              virtualEnergyUsed: l.virtualEnergyUsed,
              elapsedSeconds: l.elapsedSeconds,
              elapsedTimeString: l.elapsedTimeString,
              pitStopDurationString: l.pitStopDurationString,
              gapToLeaderString: l.gapToLeaderString,
              isPitStop: l.isPitStop,
              isValid: l.isValid,
              paceCategory: l.paceCategory || null,
              pacePercentage: l.pacePercentage || null,
              isAllTimePB: true,
              isPlayer: true,
              tag: '⭐ Personal Best',
              matchingReplayFile: typeof s.matchingReplayFile === 'string' ? s.matchingReplayFile : s.matchingReplayFile?.name,
            };
          }
        }
      });
    });

    const driversToProcess = filters.playerOnly
      ? (s.playerDriver ? [s.playerDriver] : s.drivers.filter(d => d.isPlayer))
      : s.drivers;

    driversToProcess.forEach(d => {
      if (targetDriver && targetDriver !== 'all' && !d.name.toLowerCase().includes(targetDriver)) {
        return;
      }

      if (targetClass && targetClass !== 'All' && !matchesCarClass(d.carClass || '', d.carType || '', targetClass)) {
        return;
      }

      if (targetModel && targetModel !== 'all' && d.carType.toLowerCase().trim() !== targetModel) {
        return;
      }

      const sessionBestTime = d.bestLapTime;

      (d.laps || []).forEach(l => {
        const isSessionBest = l.lapTime !== null && sessionBestTime !== null && Math.abs(l.lapTime - sessionBestTime) < 0.0005;
        const isPlayer = Boolean(d.isPlayer || s.playerDriver?.name === d.name);
        const isAllTimePB = false;

        const lapItem = {
          id: `${s.id}_${d.name}_lap_${l.lapNum}`,
          sessionId: s.id,
          sessionName: s.sessionName,
          sessionType: s.sessionType,
          dateString: s.timeString,
          timestamp: s.timestamp,
          driverName: d.name,
          carType: d.carType,
          carClass: d.carClass || 'General',
          lapNum: l.lapNum,
          lapTime: l.lapTime,
          lapTimeString: l.lapTimeString,
          s1: l.s1,
          s2: l.s2,
          s3: l.s3,
          s1String: formatTime(l.s1),
          s2String: formatTime(l.s2),
          s3String: formatTime(l.s3),
          topSpeed: l.topSpeed,
          fCompound: l.fCompound,
          rCompound: l.rCompound,
          flCompound: l.flCompound,
          frCompound: l.frCompound,
          rlCompound: l.rlCompound,
          rrCompound: l.rrCompound,
          tireWear: l.tireWear,
          fuel: l.fuel,
          fuelUsed: l.fuelUsed,
          virtualEnergy: l.virtualEnergy,
          virtualEnergyUsed: l.virtualEnergyUsed,
          elapsedSeconds: l.elapsedSeconds,
          elapsedTimeString: l.elapsedTimeString,
          pitStopDurationString: l.pitStopDurationString,
          gapToLeaderString: l.gapToLeaderString,
          isPitStop: l.isPitStop,
          isOutLap: l.isOutLap || false,
          isValid: l.isValid,
          isInferred: l.isInferred || false,
          paceCategory: l.paceCategory || null,
          pacePercentage: l.pacePercentage || null,
          isSessionBest,
          isAllTimePB,
          isPlayer,
          matchingReplayFile: typeof s.matchingReplayFile === 'string' ? s.matchingReplayFile : s.matchingReplayFile?.name,
        };

        if (l.isValid && l.lapTime && l.lapTime > 0) {
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
    bestS1String: formatTime(bestS1),
    bestS2String: formatTime(bestS2),
    bestS3String: formatTime(bestS3),
    theoreticalBestSec,
    theoreticalBestString: formatTime(theoreticalBestSec),
    sessionsCount: matchingSessions.length,
  };
}
