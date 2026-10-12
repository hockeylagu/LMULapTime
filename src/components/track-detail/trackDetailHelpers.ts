import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { getPaceCategoryFromPercentage } from '../../../shared/domain/paceCategory.js';
import { parseDateStringToTimestamp, computeTheoreticalGap } from '../../../shared/domain/formatters.js';
import type { SessionProgressionPoint } from '../../../shared/types/index.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';

export function getPaceCategoryForLap(lapTime: number | null, benchmark: ReferenceLaptimeEntry | null) {
  if (!lapTime || !benchmark || !benchmark.targets.alienSec) return null;
  const alienSec = benchmark.targets.alienSec;
  const percentage = (lapTime / alienSec) * 100;
  const category = getPaceCategoryFromPercentage(percentage);
  return { category, percentage };
}

/** A session's best lap against the benchmark. A wet best lap has no rating: the targets are dry laps. */
export function getSessionBestLapPace(driver: SessionCard['playerDriver'], benchmark: ReferenceLaptimeEntry | null) {
  return driver?.bestLapWet ? null : getPaceCategoryForLap(driver?.bestLapTime || null, benchmark);
}

export function buildTrackProgression(
  filteredSessions: SessionCard[],
  allSessions: SessionCard[],
  progression: SessionProgressionPoint[]
): SessionProgressionPoint[] {
  if (filteredSessions.length > 0) {
    return filteredSessions
      .map((s) => {
        const p = s.playerDriver;
        const matchingPoint = progression.find((pt) => pt.sessionId === s.id);
        const top3Average = matchingPoint?.top3Average ?? null;
        const consistencyScore = matchingPoint?.consistencyScore ?? null;
        const theoreticalGap =
          matchingPoint?.theoreticalGap ??
          computeTheoreticalGap(p?.bestLapTime, p?.theoreticalBest);

        return {
          sessionId: s.id,
          timestamp: parseDateStringToTimestamp(s.timeString),
          timeString: s.timeString,
          sessionType: s.sessionType,
          sessionName: s.sessionName,
          trackVenue: s.trackVenue,
          trackCourse: s.trackCourse,
          displayTrack: s.trackVenue,
          weather: s.weather,
          carType: p?.carType || 'Unknown Car',
          carClass: p?.carClass || 'General',
          driverName: p?.name || 'Driver',
          bestLapTime: p?.bestLapTime || null,
          bestLapWet: p?.bestLapWet,
          bestS1: p?.bestS1 || null,
          bestS2: p?.bestS2 || null,
          bestS3: p?.bestS3 || null,
          theoreticalBest: p?.theoreticalBest || null,
          cleanLapsCount: matchingPoint?.cleanLapsCount ?? (p?.avgLapTime && (p?.declaredLapsCount || 0) > 0 ? (p.declaredLapsCount || 0) : 0),
          declaredLapsCount: matchingPoint?.declaredLapsCount ?? (p?.declaredLapsCount || 0),
          avgLapTime: p?.avgLapTime ?? null,
          top3Average,
          theoreticalGap,
          consistencyScore,
        };
      })
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return (a.timeString || '').localeCompare(b.timeString || '');
      });
  }

  return allSessions.length === 0 ? progression : [];
}
