import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { fetchJson, isAbortError } from '../../api/apiClient.js';
import { getBestLapNumber } from '../../../shared/domain/formatters.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { TrackDetailSortOption } from './TrackSessionsToolbar.js';
import { SessionMeta } from './trackDetailHelpers.js';
import { TRACK_DETAIL_SORT_OPTIONS } from './trackDetailSortOptions.js';

const readSort = (value: string | null): TrackDetailSortOption =>
  TRACK_DETAIL_SORT_OPTIONS.find(option => option.value === value)?.value ?? 'date-desc';

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
    readSort(searchParams.get('sort'))
  );
  const [data, setData] = useState<TrackDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const prevCarClassRef = useRef(selectedCarClass);

  useEffect(() => {
    setHideEmptyState(searchParams.get('hideEmpty') !== 'false');
    setHasReplayState(searchParams.get('hasReplay') === 'true');
    setSelectedCarModelState(searchParams.get('model') || 'All');
    setFilterTypeState(searchParams.get('type') || 'All');
    setSearchQueryState(searchParams.get('q') || '');
    setSortByState(readSort(searchParams.get('sort')));
  }, [searchParams]);

  const handleOpenReplay = (sessionId: string) => {
    const session = data?.sessions.find((item) => item.id === sessionId);
    if (!session?.matchingReplayFile) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('replayName', session.matchingReplayFile.name);
    const bestLap = getBestLapNumber(session.playerDriver);
    replayParams.set('lap', String(bestLap));
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

  /**
   * Clears every session filter in one URL write; separate setters would each undo the previous one.
   * `showEmpty` also lists empty sessions (the empty-state recovery); otherwise they stay hidden, the default.
   */
  const resetSessionFilters = (showEmpty = false) => {
    updateSearchParams(searchParams, setSearchParams, { model: null, type: null, q: null, hideEmpty: !showEmpty, hasReplay: null });
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
    setData(null);
    setError(null);
    fetchJson<TrackDetailData>(`/api/track/${encodeURIComponent(trackName)}`, { signal: controller.signal })
      .then((resData) => {
        if (!isCurrent) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : 'Unable to load track details.');
        setLoading(false);
      });
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [trackName, loadAttempt]);

  return {
    loading,
    data,
    error,
    retry: () => setLoadAttempt(attempt => attempt + 1),
    hideEmpty,
    setHideEmpty,
    hasReplay,
    setHasReplay,
    resetSessionFilters,
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
