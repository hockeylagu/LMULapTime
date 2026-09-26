import React, { useState, useEffect, useMemo } from 'react';
import { findReferenceEntry, getPaceCategoryFromPercentage } from '../../../shared/domain/paceCategory.js';
import { aggregateTrackSummaries, TrackSessionSummary } from '../../../shared/domain/trackSummaryUtils.js';
import { ReferenceLaptimeEntry, PaceCategory, ReferenceLaptimesCache, TrackSummary } from '../../../shared/types/index.js';
import { TrackSummariesHeader, TracksSortOption } from './TrackSummariesHeader.js';
import { TrackSummaryCard, TrackSummaryItem } from './TrackSummaryCard.js';

export type { TracksSortOption, TrackSessionSummary };
export type TrackSummaryData = TrackSummary;

export interface TrackSummariesProps {
  sessions?: TrackSessionSummary[];
  onSelectTrack: (trackName: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

export const TrackSummaries: React.FC<TrackSummariesProps> = ({
  sessions = [],
  onSelectTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const [refCache, setRefCache] = useState<ReferenceLaptimesCache | null>(null);
  const [sortBy, setSortBy] = useState<TracksSortOption>('name-asc');

  useEffect(() => {
    fetch('/api/reference-laptimes')
      .then(res => res.json())
      .then(data => setRefCache(data))
      .catch(err => console.error('Failed to load reference laptimes in TrackSummaries:', err));
  }, []);

  const trackList: TrackSummaryItem[] = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return [];
    }

    const aggregated = aggregateTrackSummaries(sessions, {
      carClass: selectedCarClass,
      includeEmptyVenues: true,
    });

    return Object.values(aggregated).sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
  }, [sessions, selectedCarClass]);

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
        const lastA = a.lastSessionTimestamp || 0;
        const lastB = b.lastSessionTimestamp || 0;
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
