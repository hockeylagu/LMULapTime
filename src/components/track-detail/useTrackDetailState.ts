import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { TrackDetailSortOption } from './TrackSessionsToolbar.js';
import { SessionMeta } from './trackDetailHelpers.js';

export interface TrackDetailData {
  trackName: string;
  normalizedTrackName: string;
  sessionsCount: number;
  sessions: SessionMeta[];
  benchmarks: ReferenceLaptimeEntry[];
}

export function useTrackDetailState(trackName: string, selectedCarClass: string) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [hideEmpty, setHideEmptyState] = useState<boolean>(searchParams.get('hideEmpty') !== 'false');
  const [hasReplay, setHasReplayState] = useState<boolean>(searchParams.get('hasReplay') === 'true');
  const [selectedCarModel, setSelectedCarModelState] = useState<string>(searchParams.get('model') || 'All');
  const [filterType, setFilterTypeState] = useState<string>(searchParams.get('type') || 'All');
  const [searchQuery, setSearchQueryState] = useState<string>(searchParams.get('q') || '');
  const [sortBy, setSortByState] = useState<TrackDetailSortOption>(
    (searchParams.get('sort') as TrackDetailSortOption) || 'date-desc'
  );
  const [data, setData] = useState<TrackDetailData | null>(null);
  const prevCarClassRef = useRef(selectedCarClass);

  useEffect(() => {
    setHideEmptyState(searchParams.get('hideEmpty') !== 'false');
    setHasReplayState(searchParams.get('hasReplay') === 'true');
    setSelectedCarModelState(searchParams.get('model') || 'All');
    setFilterTypeState(searchParams.get('type') || 'All');
    setSearchQueryState(searchParams.get('q') || '');
    setSortByState((searchParams.get('sort') as TrackDetailSortOption) || 'date-desc');
  }, [searchParams]);

  const handleOpenReplay = (sessionId: string) => {
    const session = data?.sessions.find((item) => item.id === sessionId);
    if (!session?.matchingReplayFile) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('replayName', session.matchingReplayFile.name);
    replayParams.set('lap', '1');
    navigate(`/telemetry?${replayParams.toString()}`);
  };

  const setSortBy = (val: TrackDetailSortOption) => {
    setSortByState(val);
    updateSearchParams(searchParams, setSearchParams, { sort: val });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateSearchParams(searchParams, setSearchParams, { model });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateSearchParams(searchParams, setSearchParams, { type });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateSearchParams(searchParams, setSearchParams, { q });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateSearchParams(searchParams, setSearchParams, { hideEmpty: hide });
  };

  const setHasReplay = (replayOnly: boolean) => {
    setHasReplayState(replayOnly);
    updateSearchParams(searchParams, setSearchParams, { hasReplay: replayOnly ? 'true' : null });
  };

  useEffect(() => {
    if (prevCarClassRef.current !== selectedCarClass) {
      prevCarClassRef.current = selectedCarClass;
      if (selectedCarModel !== 'All') {
        setSelectedCarModel('All');
      }
    }
  }, [selectedCarClass, selectedCarModel]);

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/track/${encodeURIComponent(trackName)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((resData) => {
        if (!isCurrent) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent || err?.name === 'AbortError') return;
        console.error('Failed to fetch track details:', err);
        setLoading(false);
      });
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [trackName]);

  return {
    loading,
    data,
    hideEmpty,
    setHideEmpty,
    hasReplay,
    setHasReplay,
    selectedCarModel,
    setSelectedCarModel,
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    handleOpenReplay,
  };
}
