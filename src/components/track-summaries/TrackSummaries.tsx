import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { findReferenceEntry, getPaceCategoryFromPercentage } from '../../../shared/domain/paceCategory.js';
import { aggregateTrackSummaries, TrackSessionSummary } from '../../../shared/domain/trackSummaryUtils.js';
import { ReferenceLaptimeEntry, PaceCategory, ReferenceLaptimesCache, TrackSummary } from '../../../shared/types/index.js';
import { TrackSummariesHeader, TracksSortOption } from './TrackSummariesHeader.js';
import { loadReferenceLaptimes, peekReferenceLaptimes } from '../../api/referenceApi.js';
import { apiErrorMessage, isAbortError, fetchJson } from '../../api/apiClient.js';
import { useSessionDataContext } from '../../api/sessionDataContext.js';
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
  sessions,
  onSelectTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const { revision } = useSessionDataContext();
  const [storedTracks,setStoredTracks]=useState<TrackSummary[]>([]);
  const [trackError,setTrackError]=useState<string|null>(null);
  const [refCache, setRefCache] = useState<ReferenceLaptimesCache | null>(peekReferenceLaptimes);
  const [benchmarkState, setBenchmarkState] = useState<'loading' | 'error' | 'ready'>(() => peekReferenceLaptimes() ? 'ready' : 'loading');
  const [benchmarkError, setBenchmarkError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [sortBy, setSortBy] = useState<TracksSortOption>('name-asc');
  useEffect(()=>{
    if(sessions!==undefined)return;
    const controller=new AbortController();
    setTrackError(null);
    fetchJson<{tracks:TrackSummary[]}>(`/api/tracks?carClass=${encodeURIComponent(selectedCarClass)}`,{signal:controller.signal})
      .then(data=>setStoredTracks(data.tracks)).catch((err:unknown)=>{if(!isAbortError(err))setTrackError(apiErrorMessage(err,'Unable to load circuits.'));});
    return ()=>controller.abort();
  },[sessions,selectedCarClass,revision]);

  useEffect(() => {
    let active = true;
    setBenchmarkState('loading');
    setBenchmarkError('');
    loadReferenceLaptimes()
      .then(data => {
        if (!active) return;
        setRefCache(data);
        setBenchmarkState('ready');
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setBenchmarkError(apiErrorMessage(error, 'Could not load benchmark targets. Check the connection and try again.'));
        setBenchmarkState('error');
      });
    // The loader is shared: ignore this view's completion without cancelling other consumers.
    return () => { active = false; };
  }, [retryCount]);

  const trackList: TrackSummaryItem[] = useMemo(() => {
    if (sessions===undefined) return storedTracks;
    if (sessions.length === 0) {
      return [];
    }

    const aggregated = aggregateTrackSummaries(sessions, {
      carClass: selectedCarClass,
      includeEmptyVenues: true,
    });

    return Object.values(aggregated).sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
  }, [sessions, selectedCarClass,storedTracks]);

  const getRefEntryForTrack = (trackName: string, carType?: string, carClass?: string): ReferenceLaptimeEntry | null => {
    if (!refCache?.entries) return null;
    const targetClass = selectedCarClass !== 'All' ? selectedCarClass : carClass || carType || '';
    return findReferenceEntry(refCache.entries, trackName, '', targetClass, carType || '');
  };

  const getPaceCategoryForLap = (lapTime: number | null, refEntry: ReferenceLaptimeEntry | null): { category: PaceCategory; pct: number } | null => {
    if (!lapTime || !Number.isFinite(lapTime) || lapTime <= 0 || !refEntry || !Number.isFinite(refEntry.target100Sec) || refEntry.target100Sec <= 0) return null;
    const pct = (lapTime / refEntry.target100Sec) * 100;
    if (!Number.isFinite(pct)) return null;
    return { category: getPaceCategoryFromPercentage(pct) as PaceCategory, pct };
  };

  const benchmarkSortAvailable = benchmarkState === 'ready' && trackList.some(track =>
    getPaceCategoryForLap(track.bestLapWet ? null : track.bestLapTime, getRefEntryForTrack(track.trackVenue, track.bestLapCar, track.bestLapClass)) !== null
  );

  useEffect(() => {
    if (!benchmarkSortAvailable && sortBy === 'pace-asc') setSortBy('name-asc');
  }, [benchmarkSortAvailable, sortBy]);

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
        const paceA = getPaceCategoryForLap(a.bestLapWet ? null : a.bestLapTime, refA)?.pct ?? 999;
        const paceB = getPaceCategoryForLap(b.bestLapWet ? null : b.bestLapTime, refB)?.pct ?? 999;
        return paceA - paceB;
      }
      return 0;
    });
  }, [trackList, sortBy, refCache, selectedCarClass]);

  return (
    <div className="space-y-6">
      {trackError && <p role="alert" className="text-lmu-warn">{trackError}</p>}
      <TrackSummariesHeader
        totalTracks={sortedTrackList.length}
        benchmarkSortAvailable={benchmarkSortAvailable}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        selectedCarClass={selectedCarClass}
        onSelectCarClass={setSelectedCarClass}
      />

      {(benchmarkState === 'loading' || (benchmarkState === 'ready' && !benchmarkSortAvailable && trackList.length > 0)) && (
        <div role="status" aria-live="polite" className="text-xs text-lmu-muted">
          {benchmarkState === 'loading' ? 'Loading benchmark targets…' : (
            <p>No matching benchmark targets. <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-lmu-accent-text" to="/settings">Review benchmarks in Settings</Link>.</p>
          )}
        </div>
      )}
      {benchmarkState === 'error' && (
        <div role="alert" className="flex items-center justify-between gap-4 border border-lmu-border rounded-xl p-4 text-xs">
          <p className="text-lmu-text-soft break-words">Benchmarks unavailable: {benchmarkError}</p>
          <button type="button" onClick={() => setRetryCount(count => count + 1)} className="shrink-0 text-lmu-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-lmu-accent-text">Try again</button>
        </div>
      )}
      {sortedTrackList.length === 0 && (
        <div className="bg-lmu-card border border-lmu-border rounded-2xl p-12 text-center text-xs text-lmu-muted">
          <p className="text-lmu-text font-semibold">No track records yet</p>
          <p className="mt-2">Complete a session in LMU, then refresh the directory scan. <Link to="/settings" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-lmu-accent-text">Check the results folder in Settings</Link>.</p>
        </div>
      )}

      {/* Grid of Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sortedTrackList.map(t => {
          const refEntry = getRefEntryForTrack(t.trackVenue, t.bestLapCar, t.bestLapClass);
          const paceInfo = getPaceCategoryForLap(t.bestLapWet ? null : t.bestLapTime, refEntry);

          return (
            <TrackSummaryCard
              key={t.trackVenue}
              track={t}
              paceInfo={paceInfo}
              onSelectTrack={onSelectTrack}
              selectedCarClass={selectedCarClass}
              benchmarkState={benchmarkState}
            />
          );
        })}
      </div>
    </div>
  );
};
