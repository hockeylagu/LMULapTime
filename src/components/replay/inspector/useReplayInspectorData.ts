import { useState, useEffect, useEffectEvent, useRef, useMemo, useCallback } from 'react';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import { useSearchParams } from 'react-router';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ComparableLap } from '../../../../shared/types/index.js';
import { areComparableCarClasses, resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import { findIndexAtDistance, getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../utils/lapAlignment.js';
import { updateSearchParams } from '../../../utils/urlParams.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';
import { useRequest } from '../../../api/useRequest.js';
import { fetchSessionTelemetry, fetchSessionTelemetryMetadata } from '../../../api/replayApi.js';
import { CompareLapFilter } from './compare/ReplayCompareLapPicker.js';
import { replayCompareScope } from './compare/compareLapsQuery.js';
import { DEFAULT_COMPARE_CONTROLS, type CompareLapControls } from './compare/compareLapControls.js';
import { advancePlaybackClock, PlaybackClock, playbackClockAt } from './replayPlaybackClock.js';
import { createPlaybackCursor } from './replayPlaybackCursor.js';
import { PLAYBACK_SPEEDS, type ReplayFullscreenControls } from './replayFullscreenControls.js';
import { DEFAULT_TELEMETRY_RESOLUTION, TelemetryResolution, trajectoryResolutionQuery } from '../telemetry/telemetryResolution.js';

export interface UseReplayInspectorDataProps {
  isOpen: boolean;
  sessionId: string | null;
  initialDriverOrdinal?: number;
  initialLapOrdinal?: number;
  onLocatorChange?: (driverOrdinal: number, lapOrdinal: number) => void;
  initialCompareMode?: boolean;
  initialBaselineSessionId?: string | null;
  initialBaselineDriverOrdinal?: number;
  initialBaselineLapOrdinal?: number | null;
}

export function useReplayInspectorData({
  isOpen,
  sessionId,
  initialDriverOrdinal,
  initialLapOrdinal,
  onLocatorChange,
  initialCompareMode,
  initialBaselineSessionId,
  initialBaselineDriverOrdinal,
  initialBaselineLapOrdinal,
}: UseReplayInspectorDataProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);
  const [metadata, setMetadata] = useState<ReplayMetadata | null>(null);
  const [trajectory, setTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [selectedDriverSlot, setSelectedDriverSlot] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTrajLoading, setIsTrajLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState<boolean>(initialCompareMode ?? false);
  const [isComparePickerOpen, setIsComparePickerOpen] = useState<boolean>(false);
  const [baselineSessionId, setBaselineSessionId] = useState<string | null>(initialBaselineSessionId ?? null);
  const [baselineLapNumber, setBaselineLapNumber] = useState<number | null>(null);
  const [baselineLapOrdinal, setBaselineLapOrdinal] = useState<number | null>(initialBaselineLapOrdinal ?? null);
  const [selectedDriverOrdinal, setSelectedDriverOrdinal] = useState<number>(initialDriverOrdinal ?? 0);
  const [selectedLapOrdinal, setSelectedLapOrdinal] = useState<number>(initialLapOrdinal ?? 0);
  const [baselineDriverOrdinal, setBaselineDriverOrdinal] = useState<number>(initialBaselineDriverOrdinal ?? 0);
  const [compareLapFilter, setCompareLapFilter] = useState<CompareLapFilter>('player');
  const [compareControls, setCompareControls] = useState<CompareLapControls>(DEFAULT_COMPARE_CONTROLS);
  const [compareCarTypes, setCompareCarTypes] = useState<string[]>([]);
  const [replayLoadVersion, setReplayLoadVersion] = useState(0);
  // Seeded from the props, not only by the open effect: the baseline load runs in the same commit
  // and would otherwise fetch the lap once without its driver (the replay player's lap instead).
  const [baselineDriverName, setBaselineDriverName] = useState<string | null>(null);
  const [currentIndex, setCurrentIndexState] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [chartZoomRange, setChartZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [telemetryResolution, setTelemetryResolution] = useState<TelemetryResolution>(DEFAULT_TELEMETRY_RESOLUTION);
  const [selectedSource, setSelectedSource] = useState<'duckdb' | 'vcr'>('duckdb');

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playbackClockRef = useRef<PlaybackClock | null>(null);
  const playbackCursor = useMemo(() => createPlaybackCursor(), []);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const setCurrentIndex = useCallback((index: number) => {
    setIsPlaying(false);
    playbackCursor.clear();
    playbackClockRef.current = null;
    currentIndexRef.current = index;
    setCurrentIndexState(index);
  }, [playbackCursor]);
  useEffect(() => {
    if (!isOpen || !trajectory?.points.length) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || replayShortcutBlocked(event) || !isReplaySurfaceTarget(event)) return;
      event.preventDefault(); setIsPlaying(playing => !playing);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, trajectory]);
  const trajectoryRequestIdRef = useRef(0);
  const trajectoryControllerRef = useRef<AbortController | null>(null);
  const lastTrajectoryRequestRef = useRef<{ lap: number; slot: number | null; resolution: TelemetryResolution; source: 'duckdb' | 'vcr' } | null>(null);
  // Requests can finish after navigation. Report their lap using the current route callback,
  // so its query parameters retain the swapped session, driver and comparison selection.
  const onLocatorChangeRef = useRef(onLocatorChange);
  onLocatorChangeRef.current = onLocatorChange;

  // The initial driver and lap apply only when the session changes, not when the caller's props change.
  const [seenSessionId, setSeenSessionId] = useState(sessionId);
  if (sessionId !== seenSessionId) {
    setSeenSessionId(sessionId);
    setActiveSessionId(sessionId);
    setSelectedDriverOrdinal(initialDriverOrdinal ?? 0);
    setSelectedLapOrdinal(initialLapOrdinal ?? 0);
  }

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen]);

  // Opening, closing or another session: what was shown is cleared before the load starts.
  const sessionLoadKey = `${isOpen}|${activeSessionId}|${replayLoadVersion}`;
  const [sessionLoadedKey, setSessionLoadedKey] = useState<string | null>(null);
  const [compareInitialized, setCompareInitialized] = useState(false);
  if (sessionLoadKey !== sessionLoadedKey) {
    setSessionLoadedKey(sessionLoadKey);
    if (!isOpen || !activeSessionId) {
      setCompareInitialized(false);
      setMetadata(null); setTrajectory(null); setSelectedDriverSlot(null); setCurrentIndexState(0);
      setIsPlaying(false); setIsCompareMode(false); setIsComparePickerOpen(false); setBaselineSessionId(null); setBaselineLapNumber(null);
      setChartZoomRange(null); setBaselineLapOrdinal(null); setBaselineDriverName(null);
      setIsLoading(false); setIsTrajLoading(false);
    } else {
      if (!compareInitialized) {
        setCompareInitialized(true);
        setIsCompareMode(initialCompareMode ?? false);
        setIsComparePickerOpen(false);
        setBaselineSessionId(initialBaselineSessionId ?? (initialCompareMode ? activeSessionId : null));
        setBaselineLapNumber(null);
        setBaselineLapOrdinal(initialBaselineLapOrdinal ?? null);
        setBaselineDriverOrdinal(initialBaselineDriverOrdinal ?? 0);
      }
      // Clear the previous session while the newly selected session loads.
      setMetadata(null);
      setTrajectory(null);
      setSelectedDriverSlot(null);
      setIsTrajLoading(false);
      setIsLoading(true);
      setError(null);
    }
  }

  // Load the selected session's metadata and initial trajectory.
  const loadSession = useEffectEvent(() => {
    trajectoryControllerRef.current?.abort();
    trajectoryRequestIdRef.current++;
    if (!isOpen || !activeSessionId) {
      playbackCursor.clear();
      currentIndexRef.current = 0;
      return;
    }

    let isMounted = true;
    const requestId = ++trajectoryRequestIdRef.current;
    lastTrajectoryRequestRef.current = null;
    const requestedLap = selectedLapOrdinal;
    const requestedDriver = selectedDriverOrdinal;
    let metadataError: string | null = null;
    let trajectoryError: string | null = null;

    Promise.all([
      fetchSessionTelemetryMetadata(activeSessionId).catch((err: unknown) => {
        metadataError = `Could not load metadata for session ${activeSessionId}: ${apiErrorMessage(err, 'request failed')}`;
        return null;
      }),
      // Without a trajectory the inspector still opens on the metadata (its driver list).
      fetchSessionTelemetry(activeSessionId, {
        resolutionQuery: trajectoryResolutionQuery(telemetryResolution),
        lapOrdinal: requestedLap,
        driverOrdinal: requestedDriver,
        source: selectedSource,
      }).catch((err: unknown) => {
        trajectoryError = apiErrorMessage(err, 'Failed to load replay lap');
        return null;
      }),
    ])
      .then(([metaData, rawTrajData]) => {
        if (!isMounted) return;
        if (metaData) setMetadata(metaData);
        setError(metadataError ?? trajectoryError);
        setIsLoading(false);
        // A lap or driver picked while this was loading asked for its own trajectory: that one is shown.
        if (requestId !== trajectoryRequestIdRef.current) return;

        const trajData = applyTelemetryPostProcessingToTrajectory(rawTrajData);
        if (trajData) {
          setTrajectory(previous => ({
            ...trajData,
            duckdbRawPointsCount: trajData.duckdbRawPointsCount ?? previous?.duckdbRawPointsCount,
            duckdbRawSampleRateHz: trajData.duckdbRawSampleRateHz ?? previous?.duckdbRawSampleRateHz,
          }));
          if (trajData.currentLap) onLocatorChangeRef.current?.(trajData.driverOrdinal ?? requestedDriver, trajData.lapOrdinal ?? requestedLap);
          const pendingDriver = metaData?.drivers?.find((d: ReplayDriverEntry) => d.sessionDriverOrdinal === requestedDriver);
          const markedPlayers = metaData?.drivers?.filter((d: ReplayDriverEntry) => d.isPlayer) ?? [];
          const defaultSlot = pendingDriver?.slot ?? trajData.driverSlot ??
            (markedPlayers.length === 1 ? markedPlayers[0].slot : null) ?? null;
          setSelectedDriverSlot(defaultSlot);
          setSelectedDriverOrdinal(trajData.driverOrdinal ?? pendingDriver?.sessionDriverOrdinal ?? requestedDriver);
          setSelectedLapOrdinal(trajData.lapOrdinal ?? requestedLap);
        } else if (metaData?.drivers?.length) {
          const players = metaData.drivers.filter((d: ReplayDriverEntry) => d.isPlayer);
          if (players.length === 1 && typeof players[0].slot === 'number') setSelectedDriverSlot(players[0].slot);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(apiErrorMessage(err, 'Failed to load replay data'));
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      trajectoryRequestIdRef.current++;
      trajectoryControllerRef.current?.abort();
    };
  });
  // Lap/driver changes already load through fetchTrajectory. Their successful locator updates
  // must not clear the session again or remount an expanded map.
  useEffect(() => loadSession(), [isOpen, activeSessionId, replayLoadVersion]);

  // 'Same condition' follows the inspected lap's own weather; unknown, it filters nothing.
  const currentCondition = trajectory?.weatherCondition ?? metadata?.weatherCondition ?? null;
  const conditionFilter = compareControls.condition === 'same' ? currentCondition : compareControls.condition;
  // The page belongs to the laps and filters it was picked for: other laps or filters show page 1.
  const compareFilters = JSON.stringify([activeSessionId, selectedDriverSlot, compareLapFilter, compareControls, conditionFilter]);
  const [pickedPage, setPickedPage] = useState({ filters: compareFilters, page: 1 });
  const comparePage = pickedPage.filters === compareFilters ? pickedPage.page : 1;
  const setComparePage = (page: number) => setPickedPage({ filters: compareFilters, page });

  // Fetch replay-backed comparison laps. Player laps are the safe default; the
  // all-driver view exposes the same candidate pool as Compare Laps.
  const compareQuery = useMemo(() => {
    // Wait for the metadata: before it the inspected driver's car class is unknown, and the
    // request would be repeated with it (laps are only compared within one car class).
    if (!isOpen || !metadata) return null;
    const markedPlayers = metadata.drivers.filter(d => d.isPlayer);
    const activeDriver = metadata.drivers.find(d => d.slot === selectedDriverSlot) ||
      (markedPlayers.length === 1 ? markedPlayers[0] : undefined);
    // Laps are only compared within one car class: the INSPECTED driver's, which in a multiclass
    // replay may differ from the replay's own (player's) class in metadata.carClass.
    const query = replayCompareScope(metadata, activeDriver);
    if (!query) return null;
    const needsAllDrivers = compareLapFilter === 'all' || compareLapFilter === 'same-sessions';
    query.set('playerOnly', String(!needsAllDrivers));
    query.set('telemetryOnly', 'true'); query.set('page', String(comparePage)); query.set('pageSize', '50');
    query.set('sort', compareControls.sort);
    if (compareControls.carType !== 'all') query.set('carType', compareControls.carType);
    if (compareControls.sessionKind !== 'all') query.set('sessionType', compareControls.sessionKind);
    if (conditionFilter && conditionFilter !== 'all') query.set('condition', conditionFilter);
    if (compareLapFilter === 'same-session-lap' || compareLapFilter === 'same-sessions') query.set('sessionId', activeSessionId!);
    return query.toString();
  }, [isOpen, metadata, activeSessionId, selectedDriverSlot, compareLapFilter, compareControls, conditionFilter, comparePage]);
  // The list empties while a request loads; the total stays, so the pagination does not jump.
  const compareLaps = useRequest(compareQuery, async (query, signal) => {
    const data = await fetchJson<{ laps?: ComparableLap[]; total?: number; carTypes?: string[] }>(`/api/compare/laps?${query}`, { signal });
    // The server lists the cars on page 1 only; later pages keep that list.
    if (Array.isArray(data.carTypes) && !signal.aborted) setCompareCarTypes(data.carTypes);
    const laps = Array.isArray(data?.laps) ? data.laps : [];
    return { laps, total: data.total ?? laps.length };
  }, { keepPrevious: true });
  const availableCompareLaps = useMemo(() => compareLaps.loading ? [] : compareLaps.data?.laps ?? [],
    [compareLaps.loading, compareLaps.data]);
  const compareTotal = compareLaps.data?.total ?? 0;
  const isCompareLapsLoading = compareLaps.loading;
  const compareLapsError = compareLaps.error ? apiErrorMessage(compareLaps.error, 'Failed to load comparison laps') : null;

  // Open the comparison lap picker. Comparison stays active until explicitly removed.
  const handleToggleCompare = () => {
    setIsComparePickerOpen(true);
  };

  const handleCloseComparePicker = () => setIsComparePickerOpen(false);

  const handleRemoveCompare = () => {
    setIsCompareMode(false);
    setIsComparePickerOpen(false);
    setBaselineSessionId(null);
    setBaselineLapNumber(null);
    setBaselineLapOrdinal(null);
    setBaselineDriverName(null);
    updateSearchParams(searchParams, setSearchParams, {
      baselineSessionId: null,
      baselineDriverOrdinal: null,
      baselineLapOrdinal: null,
      compareDriver: null,
    });
  };

  // Swap primary lap and baseline lap
  const handleSwapBaseline = () => {
    if (!isCompareMode || isLoading || isTrajLoading || isBaselineLoading || !baselineTrajectory || baselineError) return;
    const curPrimaryLap = trajectory?.currentLap ?? 1;
    const curPrimaryLapOrdinal = trajectory?.lapOrdinal ?? initialLapOrdinal ?? 0;
    const curBaseLap = baselineLapNumber ?? 1;
    const curBaseLapOrdinal = baselineLapOrdinal ?? 0;
    const curPrimarySessionId = activeSessionId;
    const curBaseSessionId = baselineSessionId || activeSessionId;
    const curPrimaryDriver = selectedDriver?.name || trajectory?.driverName || null;

    if (curBaseSessionId === curPrimarySessionId) {
      const baseSlot = metadata?.drivers?.find(d => d.sessionDriverOrdinal === baselineDriverOrdinal)?.slot;
      setBaselineDriverName(curPrimaryDriver);
      setBaselineLapNumber(curPrimaryLap);
      setBaselineLapOrdinal(curPrimaryLapOrdinal);
      setBaselineDriverOrdinal(selectedDriverOrdinal);
      if (typeof baseSlot === 'number') {
        setSelectedDriverSlot(baseSlot);
        setSelectedDriverOrdinal(baselineDriverOrdinal);
        setSelectedLapOrdinal(curBaseLapOrdinal);
        fetchTrajectory(curBaseLap, baseSlot);
      } else {
        handleSelectLap(curBaseLap);
      }
    } else {
      setBaselineSessionId(curPrimarySessionId);
      setBaselineDriverName(curPrimaryDriver);
      setBaselineLapNumber(curPrimaryLap);
      setBaselineLapOrdinal(curPrimaryLapOrdinal);
      setBaselineDriverOrdinal(selectedDriverOrdinal);
      setSelectedDriverOrdinal(baselineDriverOrdinal);
      setSelectedLapOrdinal(curBaseLapOrdinal);
      setSelectedDriverSlot(null);
      setActiveSessionId(curBaseSessionId);
      setIsPlaying(false);
      setCurrentIndex(0);
      setChartZoomRange(null);
    }
    updateSearchParams(searchParams, setSearchParams, {
      sessionId: curBaseSessionId,
      driverOrdinal: String(baselineDriverOrdinal),
      lapOrdinal: String(curBaseLapOrdinal),
      baselineSessionId: curPrimarySessionId,
      baselineDriverOrdinal: String(selectedDriverOrdinal),
      baselineLapOrdinal: String(curPrimaryLapOrdinal),
      compareDriver: curPrimaryDriver,
    });
  };

  // Load the baseline lap; only what is sent identifies the request.
  const baselineRequest = isOpen && isCompareMode && baselineSessionId ? {
    sessionId: baselineSessionId,
    driverOrdinal: baselineDriverOrdinal,
    lapOrdinal: baselineLapOrdinal ?? 0,
    // A baseline from the inspected session uses its metadata; only another session's is fetched.
    fetchMetadata: baselineSessionId !== activeSessionId,
    resolution: telemetryResolution,
    source: selectedSource,
  } : null;
  const baseline = useRequest(baselineRequest, async (request, signal) => {
    const fetchMeta = !request.fetchMetadata
      ? Promise.resolve(null)
      // Its metadata only labels the lap: a failed fetch must not drop a lap that loaded.
      : fetchSessionTelemetryMetadata(request.sessionId, { signal }).catch((err: unknown) => {
        if (isAbortError(err)) throw err;
        return null;
      });
    const fetchTraj = fetchSessionTelemetry(request.sessionId, {
      resolutionQuery: trajectoryResolutionQuery(request.resolution),
      driverOrdinal: request.driverOrdinal,
      lapOrdinal: request.lapOrdinal,
      source: request.source,
    }, { signal });
    const [meta, rawTraj] = await Promise.all([fetchMeta, fetchTraj]);
    const traj = applyTelemetryPostProcessingToTrajectory(rawTraj);
    if (!traj?.points.length) throw new Error('Comparison lap has no telemetry samples');
    // A lap picked by ordinal alone names its own lap number; the number is not sent, only shown.
    if (typeof traj.currentLap === 'number' && traj.currentLap !== (baselineLapNumber ?? 1) && !signal.aborted) {
      setBaselineLapNumber(traj.currentLap);
      setBaselineLapOrdinal(traj.lapOrdinal ?? request.lapOrdinal);
    }
    return { trajectory: traj, metadata: meta };
  });
  const baselineTrajectory = baseline.data?.trajectory ?? null;
  const baselineMetadata = baseline.data?.metadata ?? null;
  const isBaselineLoading = baseline.loading;
  const baselineError = baseline.error ? apiErrorMessage(baseline.error, 'Failed to load comparison lap') : null;

  const fetchTrajectory = (
    lapNumber?: number,
    slot?: number | null,
    res: TelemetryResolution = telemetryResolution,
    src: 'duckdb' | 'vcr' = selectedSource
  ) => {
    if (!activeSessionId) return;
    trajectoryControllerRef.current?.abort();
    const controller = new AbortController();
    trajectoryControllerRef.current = controller;
    const requestId = ++trajectoryRequestIdRef.current;
    setIsTrajLoading(true);
    const targetSlot = slot !== undefined ? slot : selectedDriverSlot;
    const driverEntry = metadata?.drivers.find(driver => driver.slot === targetSlot) ?? metadata?.drivers.find(driver => driver.sessionDriverOrdinal === selectedDriverOrdinal);
    const driverOrdinal = driverEntry?.sessionDriverOrdinal ?? selectedDriverOrdinal;
    const targetLap = lapNumber ?? trajectory?.currentLap ?? 1;
    const lapOrdinal = driverEntry?.sessionLapOrdinals?.[String(targetLap)] ??
      (trajectory?.currentLap === targetLap ? trajectory.lapOrdinal : undefined) ??
      (trajectory ? undefined : initialLapOrdinal ?? 0);
    if (lapOrdinal === undefined) {
      setError('This lap has no session telemetry locator');
      setIsTrajLoading(false);
      return;
    }
    lastTrajectoryRequestRef.current = { lap: targetLap, slot: targetSlot, resolution: res, source: src };
    setError(null);
    fetchSessionTelemetry(activeSessionId, {
      resolutionQuery: trajectoryResolutionQuery(res),
      lapOrdinal,
      driverOrdinal,
      source: src,
    }, { signal: controller.signal })
      .then(rawTrajData => {
        if (requestId !== trajectoryRequestIdRef.current) return;
        const trajData = applyTelemetryPostProcessingToTrajectory(rawTrajData);
        if (!trajData?.points.length) throw new Error('Requested lap has no telemetry samples');
        // Source/resolution changes replace the samples of the same lap. Indices no longer
        // identify the same position, so carry the live cursor and zoom over by lap distance.
        if (trajectory?.points.length && trajectory.sessionId === activeSessionId
          && trajectory.driverOrdinal === driverOrdinal && trajectory.lapOrdinal === lapOrdinal) {
          const trackLengthM = trajectory.trackLengthM ?? trajData.trackLengthM;
          const previousDistances = getTrajectoryDistances(trajectory.points, trackLengthM);
          const nextDistances = getDistancesInReferenceFrame(trajData.points, trajectory.points, trackLengthM);
          const indexAtPreviousPosition = (index: number) => findIndexAtDistance(nextDistances,
            previousDistances[Math.max(0, Math.min(previousDistances.length - 1, index))]);
          const nextIndex = indexAtPreviousPosition(currentIndexRef.current);
          playbackCursor.clear();
          playbackClockRef.current = null;
          currentIndexRef.current = nextIndex;
          setCurrentIndexState(nextIndex);
          setChartZoomRange(range => range ? {
            start: indexAtPreviousPosition(range.start), end: indexAtPreviousPosition(range.end),
          } : null);
        }
        setTrajectory(previous => ({
          ...trajData,
          duckdbRawPointsCount: trajData.duckdbRawPointsCount ?? previous?.duckdbRawPointsCount,
          duckdbRawSampleRateHz: trajData.duckdbRawSampleRateHz ?? previous?.duckdbRawSampleRateHz,
        }));
        onLocatorChangeRef.current?.(trajData.driverOrdinal ?? driverOrdinal, trajData.lapOrdinal ?? lapOrdinal);
        setSelectedDriverSlot(trajData.driverSlot ?? targetSlot);
        setSelectedDriverOrdinal(trajData.driverOrdinal ?? driverOrdinal);
        setSelectedLapOrdinal(trajData.lapOrdinal ?? lapOrdinal);
        setIsTrajLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== trajectoryRequestIdRef.current || isAbortError(err)) return;
        // The lap on screen stays; say why the requested one is not shown.
        setSelectedDriverSlot(trajectory?.driverSlot ?? null);
        setError(`Could not load lap ${targetLap}: ${apiErrorMessage(err, 'request failed')}`);
        setIsTrajLoading(false);
      });
  };

  const handleRetryLoad = () => {
    const request = lastTrajectoryRequestRef.current;
    if (!metadata || !request) setReplayLoadVersion(version => version + 1);
    else fetchTrajectory(request.lap, request.slot, request.resolution, request.source);
  };
  const handleRetryCompareLaps = compareLaps.reload;
  const handleRetryBaseline = baseline.reload;

  const handleSelectSource = (newSource: 'duckdb' | 'vcr') => {
    setSelectedSource(newSource);
    fetchTrajectory(trajectory?.currentLap, selectedDriverSlot, telemetryResolution, newSource);
  };

  const handleSelectDriver = (slot: number) => {
    const ordinal = metadata?.drivers.find(driver => driver.slot === slot)?.sessionDriverOrdinal;
    if (ordinal === undefined) return;
    setSelectedDriverSlot(slot); setSelectedDriverOrdinal(ordinal); setIsPlaying(false); setCurrentIndex(0); setChartZoomRange(null);
    fetchTrajectory(trajectory?.currentLap, slot);
  };

  const handleSelectLap = (lapNumber: number) => {
    setIsPlaying(false); setCurrentIndex(0); setChartZoomRange(null);
    fetchTrajectory(lapNumber, selectedDriverSlot);
  };

  const handleChangeResolution = (res: TelemetryResolution) => {
    setTelemetryResolution(res); fetchTrajectory(trajectory?.currentLap, selectedDriverSlot, res);
  };

  const handleSelectCompareLap = (lap: ComparableLap) => {
    if (!lap.sessionId || lap.driverOrdinal === undefined || lap.lapOrdinal === undefined) return;
    setIsCompareMode(true);
    setBaselineSessionId(lap.sessionId);
    setBaselineLapNumber(lap.lapNumber ?? 1);
    setBaselineLapOrdinal(lap.lapOrdinal);
    setBaselineDriverOrdinal(lap.driverOrdinal);
    setBaselineDriverName(lap.driverName || null);
    setIsComparePickerOpen(false);
    updateSearchParams(searchParams, setSearchParams, {
      baselineSessionId: String(lap.sessionId),
      baselineDriverOrdinal: String(lap.driverOrdinal),
      baselineLapOrdinal: String(lap.lapOrdinal),
      compareDriver: lap.driverName || null,
    });
  };

  // Opens a lap from this same replay/driver as the comparison baseline (e.g. from the
  // consistency chart's per-lap bars), rather than picking a lap from another session.
  const handleSelectBaselineLap = (lapNumber: number) => {
    if (!activeSessionId) return;
    const driverName = selectedDriver?.name || trajectory?.driverName || null;
    const lapOrdinal = metadata?.drivers.find(driver => driver.slot === selectedDriverSlot)?.sessionLapOrdinals?.[String(lapNumber)];
    if (lapOrdinal === undefined) return;
    setIsCompareMode(true);
    setBaselineSessionId(activeSessionId);
    setBaselineLapNumber(lapNumber);
    setBaselineLapOrdinal(lapOrdinal);
    setBaselineDriverOrdinal(selectedDriverOrdinal);
    setBaselineDriverName(driverName);
    updateSearchParams(searchParams, setSearchParams, {
      baselineSessionId: activeSessionId,
      baselineDriverOrdinal: String(selectedDriverOrdinal),
      baselineLapOrdinal: String(lapOrdinal),
      compareDriver: driverName,
    });
  };

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || !trajectory || trajectory.points.length === 0) {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (!trajectory || trajectory.points.length === 0 || playbackCursor.getSnapshot()?.points !== trajectory.points) {
        playbackCursor.clear();
        playbackClockRef.current = null;
      } else if (playbackClockRef.current && currentIndexRef.current !== playbackClockRef.current.index) {
        // Keep React state in sync with the paused sample index so
        // timeline and other integer-sample views match where the car stopped.
        currentIndexRef.current = playbackClockRef.current.index;
        setCurrentIndexState(playbackClockRef.current.index);
      }
      return;
    }
    // Playback follows the lap's clock (see replayPlaybackClock), not the sample count.
    const points = trajectory.points;
    lastTimeRef.current = performance.now();
    let currentClock = playbackClockRef.current;
    if (!currentClock || currentClock.index !== currentIndexRef.current) {
      currentClock = playbackClockAt(points, currentIndexRef.current);
      playbackClockRef.current = currentClock;
    }
    const loop = (now: number) => {
      const elapsedMs = now - lastTimeRef.current;
      lastTimeRef.current = now;
      let clock = playbackClockRef.current;
      // The cursor was moved (scrub, corner jump) while playing: carry on from there.
      if (!clock || clock.index !== currentIndexRef.current) clock = playbackClockAt(points, currentIndexRef.current);
      const next = advancePlaybackClock(points, clock, elapsedMs, playbackSpeed);
      if (!next) {
        playbackCursor.clear();
        playbackClockRef.current = null;
        setIsPlaying(false);
        setCurrentIndex(0);
        return;
      }
      playbackClockRef.current = next;
      playbackCursor.publish(points, next);
      if (next.index !== clock.index) {
        currentIndexRef.current = next.index;
        setCurrentIndexState(next.index);
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [isPlaying, trajectory, playbackSpeed, playbackCursor, setCurrentIndex]);

  const selectedDriver = metadata?.drivers?.find(d => d.slot === selectedDriverSlot) || metadata?.drivers?.find(d => d.name === trajectory?.driverName);
  const playerDriver = useMemo(() => metadata?.drivers?.find(d => d.isPlayer), [metadata?.drivers]);
  const currentPoint = trajectory?.points[currentIndex];
  const currentLapSummary = trajectory?.laps?.find(l => l.lapNumber === trajectory.currentLap) || trajectory?.laps?.[0];

  // Laps are only ever compared within one car class. However the baseline was chosen (URL,
  // lap picker, swap) or the inspected driver changed afterwards, a baseline of another class
  // is withheld and reported instead of being compared.
  const inspectedCarClass = resolveDriverCarClass(selectedDriver ?? playerDriver);
  const baselineCarClass = useMemo(() => {
    if (!baselineSessionId) return '';
    const meta = baselineSessionId === activeSessionId ? metadata : baselineMetadata;
    const name = (baselineDriverName || baselineTrajectory?.driverName || '').toLowerCase();
    return resolveDriverCarClass(meta?.drivers?.find(d => (name ? d.name.toLowerCase() === name : d.isPlayer)));
  }, [baselineSessionId, activeSessionId, metadata, baselineMetadata, baselineDriverName, baselineTrajectory?.driverName]);
  const isBaselineClassMismatch = Boolean(baselineTrajectory) && !areComparableCarClasses(inspectedCarClass, baselineCarClass);
  const comparableBaselineTrajectory = isBaselineClassMismatch ? null : baselineTrajectory;
  const comparableBaselineError = isBaselineClassMismatch
    ? `Comparison lap is ${baselineCarClass}, not ${inspectedCarClass}: laps are only compared within the same car class`
    : baselineError;

  const baselineLapSummary = useMemo(() => {
    if (!comparableBaselineTrajectory) return null;
    const laps = comparableBaselineTrajectory.laps || baselineMetadata?.laps || [];
    const cur = comparableBaselineTrajectory.currentLap ?? baselineLapNumber ?? 1;
    return laps.find(l => l.lapNumber === cur) || laps[0] || null;
  }, [comparableBaselineTrajectory, baselineMetadata, baselineLapNumber]);

  const lapDeltas = useMemo(() => {
    if (!currentLapSummary || !baselineLapSummary) return null;
    const calc = (c?: number, b?: number) => typeof c === 'number' && typeof b === 'number' ? c - b : null;
    return {
      lapDelta: calc(currentLapSummary.lapTimeSec, baselineLapSummary.lapTimeSec),
      s1Delta: calc(currentLapSummary.s1Sec, baselineLapSummary.s1Sec),
      s2Delta: calc(currentLapSummary.s2Sec, baselineLapSummary.s2Sec),
      s3Delta: calc(currentLapSummary.s3Sec, baselineLapSummary.s3Sec),
    };
  }, [currentLapSummary, baselineLapSummary]);

  // The fullscreen lap controls read this through context: keep it stable across renders that do not
  // change lap selection (scrubbing, playback), calling the latest handlers through a ref.
  const lapActionsRef = useRef({ handleToggleCompare, handleRemoveCompare, handleSelectLap, handleRetryLoad, handleRetryBaseline, setPlaybackSpeed });
  lapActionsRef.current = { handleToggleCompare, handleRemoveCompare, handleSelectLap, handleRetryLoad, handleRetryBaseline, setPlaybackSpeed };
  const lapOrdinals = selectedDriver?.sessionLapOrdinals;
  const primaryLaps = useMemo(() => (trajectory?.laps ?? []).filter(lap => lapOrdinals?.[String(lap.lapNumber)] !== undefined),
    [trajectory?.laps, lapOrdinals]);
  const primaryLapNumber = trajectory?.currentLap ?? null;
  const isPrimaryLoading = isLoading || isTrajLoading;
  const fullscreenControls = useMemo<ReplayFullscreenControls>(() => ({
    onOpenBaselinePicker: () => lapActionsRef.current.handleToggleCompare(),
    onRemoveBaseline: () => lapActionsRef.current.handleRemoveCompare(),
    primary: {
      laps: primaryLaps, lapNumber: primaryLapNumber, onSelect: lap => lapActionsRef.current.handleSelectLap(lap),
      isLoading: isPrimaryLoading, error, onRetry: () => lapActionsRef.current.handleRetryLoad(),
    },
    baseline: isCompareMode ? {
      lapNumber: baselineLapNumber, isLoading: isBaselineLoading, error: comparableBaselineError,
      onRetry: () => lapActionsRef.current.handleRetryBaseline(),
    } : undefined,
    playback: { speed: playbackSpeed, speeds: PLAYBACK_SPEEDS, onChangeSpeed: speed => lapActionsRef.current.setPlaybackSpeed(speed) },
  }), [primaryLaps, primaryLapNumber, isPrimaryLoading, error, isCompareMode, baselineLapNumber, isBaselineLoading, comparableBaselineError, playbackSpeed]);

  return {
    metadata, trajectory, selectedDriverSlot, selectedDriver, playerDriver,
    isLoading, isTrajLoading, error, handleRetryLoad, isCompareMode, handleToggleCompare,
    handleSwapBaseline, handleRemoveCompare, handleCloseComparePicker, isComparePickerOpen, baselineSessionId, setBaselineSessionId,
    baselineLapNumber, setBaselineLapNumber, baselineDriverOrdinal, baselineLapOrdinal, baselineDriverName, setBaselineDriverName,
    baselineTrajectory: comparableBaselineTrajectory, baselineMetadata, availableCompareLaps, compareLapFilter, compareControls, compareCarTypes, setCompareControls,
    isCompareLapsLoading, compareLapsError, handleRetryCompareLaps, handleRetryBaseline, setCompareLapFilter, handleSelectCompareLap,
    comparePagination: { page: comparePage, pageSize: 50, total: compareTotal, onPageChange: setComparePage },
    isBaselineLoading, baselineError: comparableBaselineError, currentIndex, setCurrentIndex, isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed, playbackCursor, chartZoomRange, setChartZoomRange,
    handleSelectDriver, handleSelectLap, telemetryResolution, handleChangeResolution,
    currentPoint, currentLapSummary, lapDeltas, activeSessionId,
    handleSelectBaselineLap,
    fullscreenControls,
    selectedSource,
    handleSelectSource,
    hasDuckDbTelemetry: Boolean(metadata?.duckdbFilename || trajectory?.duckdbFilename || trajectory?.source === 'duckdb'),
    duckdbUnavailableReason: trajectory?.duckdbUnavailableReason,
  };
}
