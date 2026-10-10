import { useState, useEffect, useRef } from 'react';
import { useSessionDataContext } from '../../api/sessionDataContext.js';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { fetchJson, isAbortError } from '../../api/apiClient.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { TrackDetailSortOption } from './TrackSessionsToolbar.js';
import { SessionMeta } from './trackDetailHelpers.js';
import { TRACK_DETAIL_SORT_OPTIONS } from './trackDetailSortOptions.js';
import type { TrackSummary } from '../../../shared/types/index.js';
import type { SessionProgressionPoint } from './improvement-chart/index.js';

const readSort = (value: string | null): TrackDetailSortOption =>
  TRACK_DETAIL_SORT_OPTIONS.find(option => option.value === value)?.value ?? 'date-desc';

export interface TrackDetailData {
  trackName: string;
  normalizedTrackName: string;
  sessionsCount: number;
  sessions: SessionMeta[];
  benchmarks: ReferenceLaptimeEntry[];
  summary?: TrackSummary;
  filters?: { carModels: string[]; sessionTypes: string[]; emptyCount: number; replayCount: number };
  progression?: { points: SessionProgressionPoint[]; total: number; page: number; pageSize: number };
  positions?: { qualifyingAveragePosition: number | null; finishAveragePosition: number | null };
  latestSession?: { trackCourse?: string; trackLengthMeters?: number | null; carClass?: string; carType?: string };
  page?: number;
  pageSize?: number;
  total?: number;
}

export function useTrackDetailState(trackName: string, selectedCarClass: string) {
  const { revision } = useSessionDataContext();
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
  const [loadedTrack, setLoadedTrack] = useState<{ trackName: string; data: TrackDetailData } | null>(null);
  const data = loadedTrack?.trackName === trackName ? loadedTrack.data : null;
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const prevCarClassRef = useRef(selectedCarClass);
  const requestedTrackRef = useRef<string | null>(null);
  const lastRequestVersionRef = useRef<{ attempt: number; revision: number } | null>(null);

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
    const driverOrdinal = session?.playerDriver?.driverOrdinal;
    const lapOrdinal = session?.playerDriver?.bestLapOrdinal;
    if (!session?.matchingReplayFile || !Number.isInteger(driverOrdinal) || !Number.isInteger(lapOrdinal)) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('sessionId', session.id);
    replayParams.set('driverOrdinal', String(driverOrdinal));
    replayParams.set('lapOrdinal', String(lapOrdinal));
    navigate(`/telemetry?${replayParams.toString()}`);
  };

  const setSortBy = (val: TrackDetailSortOption) => {
    setSortByState(val);
    updateSearchParams(searchParams, setSearchParams, { sort: val, page: null });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateSearchParams(searchParams, setSearchParams, { model, page: null, progressionPage: null });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateSearchParams(searchParams, setSearchParams, { type, page: null, progressionPage: null });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateSearchParams(searchParams, setSearchParams, { q, page: null, progressionPage: null });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateSearchParams(searchParams, setSearchParams, { hideEmpty: hide, page: null, progressionPage: null });
  };

  const setHasReplay = (replayOnly: boolean) => {
    setHasReplayState(replayOnly);
    updateSearchParams(searchParams, setSearchParams, { hasReplay: replayOnly ? 'true' : null, page: null, progressionPage: null });
  };

  /**
   * Clears every session filter in one URL write; separate setters would each undo the previous one.
   * `showEmpty` also lists empty sessions (the empty-state recovery); otherwise they stay hidden, the default.
   */
  const resetSessionFilters = (showEmpty = false) => {
    updateSearchParams(searchParams, setSearchParams, { model: null, type: null, q: null, hideEmpty: !showEmpty, hasReplay: null, page: null, progressionPage: null });
  };

  const progressionPage = Math.max(1, Number(searchParams.get('progressionPage')) || 1);
  const setProgressionPage = (page: number) => updateSearchParams(searchParams, setSearchParams, { progressionPage: page <= 1 ? null : String(page) });

  useEffect(() => {
    if (prevCarClassRef.current !== selectedCarClass) {
      prevCarClassRef.current = selectedCarClass;
      setSelectedCarModelState('All');
      updateSearchParams(searchParams, setSearchParams, { model: null, page: null, progressionPage: null });
    }
  }, [selectedCarClass, searchParams, setSearchParams]);

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();
    const sameRequestVersion = lastRequestVersionRef.current?.attempt === loadAttempt && lastRequestVersionRef.current?.revision === revision;
    if (loadedTrack?.trackName === trackName && requestedTrackRef.current === trackName && !loadedTrack.data.filters && sameRequestVersion) return () => controller.abort();
    if (requestedTrackRef.current !== trackName || loadedTrack?.trackName !== trackName) setLoading(true);
    requestedTrackRef.current = trackName;
    lastRequestVersionRef.current = { attempt: loadAttempt, revision };
    setError(null);
    const requestParams = new URLSearchParams(searchParams);
    requestParams.set('carClass', selectedCarClass);
    requestParams.set('car', searchParams.get('model') || 'All');
    requestParams.set('pageSize', '25');
    requestParams.set('hideEmpty', searchParams.get('hideEmpty') ?? 'true');
    fetchJson<TrackDetailData>(`/api/track/${encodeURIComponent(trackName)}?${requestParams.toString()}`, { signal: controller.signal })
      .then((resData) => {
        if (!isCurrent) return;
        setLoadedTrack({ trackName, data: resData });
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
  }, [trackName, loadAttempt, revision, selectedCarClass, searchParams]);

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
    progressionPage,
    setProgressionPage,
  };
}
