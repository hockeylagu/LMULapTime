import { TrackSummary } from '../types/index.js';
import type { DriverData, SessionMetadata } from '../types/session.js';
import {
  getDisplayTrackName,
  computeTheoreticalBest,
  parseDateStringToTimestamp,
  minValidTime,
} from './formatters.js';
import { matchesSessionCarClass } from './vehicleMapping.js';
import { getCircuitSpecification } from './circuitSpecs.js';

type TrackSummaryDriver = Pick<DriverData, 'name' | 'carType' | 'bestLapTime' | 'bestS1' | 'bestS2' | 'bestS3'> &
  Partial<Pick<DriverData, 'carClass' | 'bestLapWet' | 'declaredLapsCount' | 'isPlayer'>>;

/** Minimal input contract for track aggregation, including the detailed-session drivers fallback. */
export type TrackSessionSummary = Pick<SessionMetadata, 'trackVenue' | 'timeString'> &
  Partial<Pick<SessionMetadata, 'id' | 'filename' | 'trackCourse' | 'timestamp' | 'sessionName' | 'driversCount'>> & {
    sessionType?: string;
    playerDriver?: TrackSummaryDriver | null;
    drivers?: TrackSummaryDriver[];
  };

export interface AggregateTrackSummariesOptions {
  carClass?: string;
  includeEmptyVenues?: boolean;
}

const summaryKey = (venue: string, course?: string) => JSON.stringify([venue, course ?? '']);

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

  sessions.forEach(s => {
    const venue = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (!venue) return;
    const matchesClass = !selectedCarClass || selectedCarClass === 'All' || matchesSessionCarClass(s, selectedCarClass);
    if (!matchesClass && !includeEmptyVenues) return;

    const key = summaryKey(s.trackVenue, s.trackCourse);
    if (!map[key]) {
      map[key] = {
        trackVenue: venue,
        identityVenue: s.trackVenue,
        trackCourse: s.trackCourse ?? '',
        layoutKey: getCircuitSpecification(s.trackVenue, s.trackCourse).layoutKey,
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

    if (!matchesClass) return;

    const summary = map[key];
    summary.sessionsCount += 1;

    const timestamp = typeof s.timestamp === 'number' && s.timestamp > 0
      ? s.timestamp
      : parseDateStringToTimestamp(s.timeString);
    if (timestamp > (summary.lastSessionTimestamp || 0)) {
      summary.lastSessionTimestamp = timestamp;
    }

    const p = s.playerDriver || s.drivers?.find(d => d.isPlayer);
    if (p) {
      summary.totalLaps += p.declaredLapsCount || 0;
      if (p.carType && !summary.carsUsed.includes(p.carType)) {
        summary.carsUsed.push(p.carType);
      }

      if (p.bestLapTime && (summary.bestLapTime === null || p.bestLapTime < summary.bestLapTime)) {
        summary.bestLapTime = p.bestLapTime;
        summary.bestLapDriver = p.name;
        summary.bestLapCar = p.carType;
        summary.bestLapClass = p.carClass;
        summary.bestLapWet = 'bestLapWet' in p && p.bestLapWet ? true : undefined;
      }
      summary.bestS1 = minValidTime(summary.bestS1, p.bestS1);
      summary.bestS2 = minValidTime(summary.bestS2, p.bestS2);
      summary.bestS3 = minValidTime(summary.bestS3, p.bestS3);
    }

    summary.theoreticalBest = computeTheoreticalBest(summary.bestS1, summary.bestS2, summary.bestS3);
  });

  return map;
}
