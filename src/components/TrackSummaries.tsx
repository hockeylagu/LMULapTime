import React, { useState, useEffect, useMemo } from 'react';
import { getDisplayTrackName, computeTheoreticalBest, parseDateStringToTimestamp } from '../utils/formatters.js';
import { matchesCarClass, findReferenceEntry, getPaceCategoryFromPercentage } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';
import { TrackSummariesHeader, TracksSortOption } from './track-summaries/TrackSummariesHeader';
import { TrackSummaryCard, TrackSummaryItem } from './track-summaries/TrackSummaryCard';

export type { TracksSortOption };

export interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  timeString: string;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string;
  driversCount: number;
  playerDriver?: {
    name: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    lapsCount: number;
  };
}

export interface TrackSummaryData {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestLapClass?: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
}

export interface TrackSummariesProps {
  sessions?: SessionSummary[];
  tracksMap: Record<string, TrackSummaryData>;
  onSelectTrack: (trackName: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

export const TrackSummaries: React.FC<TrackSummariesProps> = ({
  sessions = [],
  tracksMap = {},
  onSelectTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const [refCache, setRefCache] = useState<any>(null);
  const [sortBy, setSortBy] = useState<TracksSortOption>('name-asc');

  useEffect(() => {
    fetch('/api/reference-laptimes')
      .then(res => res.json())
      .then(data => setRefCache(data))
      .catch(err => console.error('Failed to load reference laptimes in TrackSummaries:', err));
  }, []);

  const trackList: TrackSummaryItem[] = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return Object.values(tracksMap).sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
    }

    const minTime = (current: number | null, next: number | null | undefined): number | null =>
      next !== null && next !== undefined && next > 0 && (current === null || next < current) ? next : current;

    // Group filtered sessions by display track name in a single pass
    const sessionsByVenue = new Map<string, SessionSummary[]>();
    const allVenues = new Set<string>();

    sessions.forEach(s => {
      const venue = getDisplayTrackName(s.trackVenue, (s as any).trackCourse);
      if (!venue) return;
      allVenues.add(venue);
      if (matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass)) {
        const group = sessionsByVenue.get(venue) || [];
        group.push(s);
        sessionsByVenue.set(venue, group);
      }
    });

    const list = Array.from(allVenues).map(venue => {
      const venueSessions = sessionsByVenue.get(venue) || [];
      const fallback = tracksMap[venue];

      let bestLapTime: number | null = null;
      let bestLapDriver = '';
      let bestLapCar = '';
      let bestLapClass = '';
      let bestS1: number | null = null;
      let bestS2: number | null = null;
      let bestS3: number | null = null;
      let totalLaps = 0;
      const carsUsedSet = new Set<string>();
      let lastSessionTimestamp = 0;

      venueSessions.forEach(s => {
        const timestamp = parseDateStringToTimestamp(s.timeString);
        if (timestamp > lastSessionTimestamp) lastSessionTimestamp = timestamp;

        const p = s.playerDriver;
        if (p) {
          totalLaps += p.lapsCount || 0;
          if (p.carType) carsUsedSet.add(p.carType);

          if (p.bestLapTime && (bestLapTime === null || p.bestLapTime < bestLapTime)) {
            bestLapTime = p.bestLapTime;
            bestLapDriver = p.name;
            bestLapCar = p.carType;
            bestLapClass = p.carClass || '';
          }
          bestS1 = minTime(bestS1, p.bestS1);
          bestS2 = minTime(bestS2, p.bestS2);
          bestS3 = minTime(bestS3, p.bestS3);
        }
      });

      const hasVenueSessions = venueSessions.length > 0;
      const useFallback = !hasVenueSessions && selectedCarClass === 'All' && fallback;

      return {
        trackVenue: venue,
        sessionsCount: venueSessions.length,
        totalLaps: hasVenueSessions ? totalLaps : (useFallback ? fallback.totalLaps : 0),
        bestLapTime: bestLapTime ?? (useFallback ? fallback.bestLapTime : null),
        bestLapDriver: bestLapDriver || (useFallback ? fallback.bestLapDriver : ''),
        bestLapCar: bestLapCar || (useFallback ? fallback.bestLapCar : ''),
        bestLapClass: bestLapClass || '',
        bestS1: bestS1 ?? (useFallback ? fallback.bestS1 : null),
        bestS2: bestS2 ?? (useFallback ? fallback.bestS2 : null),
        bestS3: bestS3 ?? (useFallback ? fallback.bestS3 : null),
        theoreticalBest: computeTheoreticalBest(bestS1, bestS2, bestS3) ?? (useFallback ? fallback.theoreticalBest : null),
        carsUsed: carsUsedSet.size > 0 ? Array.from(carsUsedSet) : (useFallback ? fallback.carsUsed : []),
        lastSessionTimestamp,
      };
    });

    return list.sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
  }, [sessions, tracksMap, selectedCarClass]);

  const getRefEntryForTrack = (trackName: string, carType?: string, carClass?: string): ReferenceLaptimeEntry | null => {
    if (!refCache?.entries) return null;
    const targetClass = selectedCarClass !== 'All' ? selectedCarClass : carClass || carType || '';
    return findReferenceEntry(refCache.entries, trackName, '', targetClass, carType || '');
  };

  const getPaceCategoryForLap = (lapTime: number | null, refEntry: ReferenceLaptimeEntry | null): { category: PaceCategory; pct: number } | null => {
    if (!lapTime || !refEntry || !refEntry.target100Sec) return null;
    const pct = (lapTime / refEntry.target100Sec) * 100;
    return { category: getPaceCategoryFromPercentage(pct) as PaceCategory, pct };
  };

  const sortedTrackList = useMemo(() => {
    return [...trackList].sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.trackVenue.localeCompare(b.trackVenue);
      }
      if (sortBy === 'name-desc') {
        return b.trackVenue.localeCompare(a.trackVenue);
      }
      if (sortBy === 'last-session-desc') {
        const lastA = (a as any).lastSessionTimestamp || 0;
        const lastB = (b as any).lastSessionTimestamp || 0;
        return lastB - lastA;
      }
      if (sortBy === 'pace-asc') {
        const refA = getRefEntryForTrack(a.trackVenue, a.bestLapCar, a.bestLapClass);
        const refB = getRefEntryForTrack(b.trackVenue, b.bestLapCar, b.bestLapClass);
        const paceA = getPaceCategoryForLap(a.bestLapTime, refA)?.pct ?? 999;
        const paceB = getPaceCategoryForLap(b.bestLapTime, refB)?.pct ?? 999;
        return paceA - paceB;
      }
      return 0;
    });
  }, [trackList, sortBy, refCache, selectedCarClass]);

  return (
    <div className="space-y-6">
      <TrackSummariesHeader
        totalTracks={sortedTrackList.length}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        selectedCarClass={selectedCarClass}
        onSelectCarClass={setSelectedCarClass}
      />

      {/* Grid of Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sortedTrackList.map(t => {
          const refEntry = getRefEntryForTrack(t.trackVenue, t.bestLapCar, t.bestLapClass);
          const paceInfo = getPaceCategoryForLap(t.bestLapTime, refEntry);

          return (
            <TrackSummaryCard
              key={t.trackVenue}
              track={t}
              paceInfo={paceInfo}
              onSelectTrack={onSelectTrack}
            />
          );
        })}
      </div>
    </div>
  );
};
