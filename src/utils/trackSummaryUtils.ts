import { TrackSummary } from '../../server/core/types.js';
import {
  getDisplayTrackName,
  computeTheoreticalBest,
  parseDateStringToTimestamp,
  minValidTime,
} from './formatters.js';
import { matchesSessionCarClass } from './paceCategory.js';

export interface TrackSessionSummary {
  id?: string;
  filename?: string;
  trackVenue: string;
  trackCourse?: string;
  timeString: string;
  timestamp?: number;
  sessionType?: 'Practice' | 'Qualifying' | 'Race' | 'Unknown' | string;
  sessionName?: string;
  driversCount?: number;
  playerDriver?: {
    name: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString?: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    lapsCount?: number;
    isPlayer?: boolean;
  } | null;
  drivers?: Array<{
    name: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString?: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    lapsCount?: number;
    isPlayer?: boolean;
  }>;
}

export interface AggregateTrackSummariesOptions {
  carClass?: string;
  includeEmptyVenues?: boolean;
}

/**
 * Aggregates summary statistics per track venue from session logs.
 * Preserves all capabilities: car class filtering, sector bests, theoretical best,
 * bestLapClass, and latest session timestamps for sorting.
 */
export function aggregateTrackSummaries<T extends TrackSessionSummary>(
  sessions: T[],
  options?: AggregateTrackSummariesOptions
): Record<string, TrackSummary> {
  const map: Record<string, TrackSummary> = {};
  const selectedCarClass = options?.carClass;
  const includeEmptyVenues = options?.includeEmptyVenues ?? false;

  if (includeEmptyVenues) {
    sessions.forEach(s => {
      const venue = getDisplayTrackName(s.trackVenue, s.trackCourse);
      if (!venue) return;
      if (!map[venue]) {
        map[venue] = {
          trackVenue: venue,
          sessionsCount: 0,
          totalLaps: 0,
          bestLapTime: null,
          bestLapDriver: '',
          bestLapCar: '',
          bestLapClass: '',
          bestS1: null,
          bestS2: null,
          bestS3: null,
          theoreticalBest: null,
          carsUsed: [],
          lastSessionTimestamp: 0,
        };
      }
    });
  }

  sessions.forEach(s => {
    const venue = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (!venue) return;

    if (!map[venue]) {
      map[venue] = {
        trackVenue: venue,
        sessionsCount: 0,
        totalLaps: 0,
        bestLapTime: null,
        bestLapDriver: '',
        bestLapCar: '',
        bestLapClass: '',
        bestS1: null,
        bestS2: null,
        bestS3: null,
        theoreticalBest: null,
        carsUsed: [],
        lastSessionTimestamp: 0,
      };
    }

    if (selectedCarClass && selectedCarClass !== 'All' && !matchesSessionCarClass(s, selectedCarClass)) {
      return;
    }

    const summary = map[venue];
    summary.sessionsCount += 1;

    const timestamp = typeof s.timestamp === 'number' && s.timestamp > 0
      ? s.timestamp
      : parseDateStringToTimestamp(s.timeString);
    if (timestamp > (summary.lastSessionTimestamp || 0)) {
      summary.lastSessionTimestamp = timestamp;
    }

    const p = s.playerDriver || s.drivers?.find(d => d.isPlayer);
    if (p) {
      summary.totalLaps += p.lapsCount || 0;
      if (p.carType && !summary.carsUsed.includes(p.carType)) {
        summary.carsUsed.push(p.carType);
      }

      if (p.bestLapTime && (summary.bestLapTime === null || p.bestLapTime < summary.bestLapTime)) {
        summary.bestLapTime = p.bestLapTime;
        summary.bestLapDriver = p.name;
        summary.bestLapCar = p.carType;
        summary.bestLapClass = p.carClass || '';
      }
      summary.bestS1 = minValidTime(summary.bestS1, p.bestS1);
      summary.bestS2 = minValidTime(summary.bestS2, p.bestS2);
      summary.bestS3 = minValidTime(summary.bestS3, p.bestS3);
    }

    summary.theoreticalBest = computeTheoreticalBest(summary.bestS1, summary.bestS2, summary.bestS3);
  });

  return map;
}
