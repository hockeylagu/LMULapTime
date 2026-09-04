import { ReferenceLaptimeEntry, PaceCategory } from '../../../server/types';
import { getPaceCategoryFromPercentage } from '../../utils/paceCategory';
import { parseDateStringToTimestamp } from '../../utils/formatters';
import { SessionProgressionPoint } from '../ImprovementChart';

export interface SessionMeta {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  timeString: string;
  sessionType: string;
  sessionName: string;
  weatherInfo?: string;
  driversCount: number;
  matchingReplayFile?: {
    name: string;
    path: string;
  };
  playerDriver?: {
    name: string;
    carType: string;
    carClass: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1?: number | null;
    bestS2?: number | null;
    bestS3?: number | null;
    theoreticalBest?: number | null;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    avgLapTime?: number | null;
    avgLapTimeString?: string;
    position?: number;
    lapsCount: number;
  };
}

export function getPaceCategoryForLap(lapTime: number | null, benchmark: ReferenceLaptimeEntry | null) {
  if (!lapTime || !benchmark || !benchmark.targets.alienSec) return null;
  const alienSec = benchmark.targets.alienSec;
  const percentage = (lapTime / alienSec) * 100;
  const category = getPaceCategoryFromPercentage(percentage);
  return { category, percentage };
}

export function buildTrackProgression(
  filteredSessions: SessionMeta[],
  allSessions: SessionMeta[],
  progression: SessionProgressionPoint[]
): SessionProgressionPoint[] {
  if (filteredSessions.length > 0) {
    return filteredSessions
      .map((s) => {
        const p = s.playerDriver;
        const matchingPoint = progression.find((pt) => pt.sessionId === s.id);
        const top3AvgLapTime = matchingPoint?.top3AvgLapTime ?? null;
        const consistencyScore = matchingPoint?.consistencyScore ?? null;
        const theoreticalGap =
          matchingPoint?.theoreticalGap ??
          (p?.bestLapTime && p?.theoreticalBest ? parseFloat((p.bestLapTime - p.theoreticalBest).toFixed(3)) : null);

        return {
          sessionId: s.id,
          timestamp: parseDateStringToTimestamp(s.timeString),
          dateString: s.timeString,
          sessionType: s.sessionType,
          sessionName: s.sessionName,
          trackVenue: s.trackVenue,
          trackCourse: s.trackCourse,
          displayTrack: s.trackVenue,
          weatherInfo: s.weatherInfo,
          carType: p?.carType || 'Unknown Car',
          carClass: p?.carClass || 'General',
          driverName: p?.name || 'Driver',
          bestLapTime: p?.bestLapTime || null,
          bestS1: p?.bestS1 || null,
          bestS2: p?.bestS2 || null,
          bestS3: p?.bestS3 || null,
          theoreticalBest: p?.theoreticalBest || null,
          cleanLapsCount: p?.lapsCount || 0,
          totalLapsCount: p?.lapsCount || 0,
          avgLapTime: p?.avgLapTime ?? null,
          top3AvgLapTime,
          theoreticalGap,
          consistencyScore,
          matchingReplayFile: s.matchingReplayFile?.name,
        };
      })
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return (a.dateString || '').localeCompare(b.dateString || '');
      });
  }

  return allSessions.length === 0 ? progression : [];
}
