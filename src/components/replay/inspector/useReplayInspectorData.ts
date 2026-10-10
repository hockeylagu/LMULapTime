import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import { useSearchParams } from 'react-router';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ComparableLap } from '../../../../shared/types/index.js';
import { areComparableCarClasses, resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { isRacingLap } from '../../../../shared/domain/lapComparison.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import { updateSearchParams } from '../../../utils/urlParams.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';
import { fetchSessionTelemetry, fetchSessionTelemetryMetadata } from '../../../api/replayApi.js';
import { CompareLapFilter } from './compare/ReplayCompareLapPicker.js';
import { advancePlaybackClock, PlaybackClock, playbackClockAt } from './replayPlaybackClock.js';
import { createPlaybackCursor } from './replayPlaybackCursor.js';
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
  const [baselineTrajectory, setBaselineTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [baselineMetadata, setBaselineMetadata] = useState<ReplayMetadata | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState<boolean>(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [availableCompareLaps, setAvailableCompareLaps] = useState<ComparableLap[]>([]);
  const [comparePage, setComparePage] = useState(1);
  const [compareTotal, setCompareTotal] = useState(0);
  const [compareLapFilter, setCompareLapFilter] = useState<CompareLapFilter>('player');
  const [isCompareLapsLoading, setIsCompareLapsLoading] = useState(false);
  const [compareLapsError, setCompareLapsError] = useState<string | null>(null);
  const [compareLoadVersion, setCompareLoadVersion] = useState(0);
  const [baselineLoadVersion, setBaselineLoadVersion] = useState(0);
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
  const playbackCursor = useMemo(createPlaybackCursor, []);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const setCurrentIndex = useCallback((index: number) => {
    setIsPlaying(false);
    playbackCursor.clear();
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
  const hasInitializedRef = useRef<boolean>(false);
  const trajectoryRequestIdRef = useRef(0);
  const trajectoryControllerRef = useRef<AbortController | null>(null);
  const lastTrajectoryRequestRef = useRef<{ lap: number; slot: number | null; resolution: TelemetryResolution; source: 'duckdb' | 'vcr' } | null>(null);
  // Requests can finish after navigation. Report their lap using the current route callback,
  // so its query parameters retain the swapped session, driver and comparison selection.
  const onLocatorChangeRef = useRef(onLocatorChange);
  onLocatorChangeRef.current = onLocatorChange;

  useEffect(() => {
    setActiveSessionId(sessionId);
    setSelectedDriverOrdinal(initialDriverOrdinal ?? 0);
    setSelectedLapOrdinal(initialLapOrdinal ?? 0);
  }, [sessionId]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen]);

  // Load the selected session's metadata and initial trajectory.
  useEffect(() => {
    trajectoryControllerRef.current?.abort();
    trajectoryRequestIdRef.current++;
    if (!isOpen || !activeSessionId) {
      hasInitializedRef.current = false;
      setMetadata(null); setTrajectory(null); setSelectedDriverSlot(null); setCurrentIndex(0);
      setIsPlaying(false); setIsCompareMode(false); setIsComparePickerOpen(false); setBaselineSessionId(null); setBaselineLapNumber(null);
      setBaselineTrajectory(null); setBaselineMetadata(null); setChartZoomRange(null); setBaselineLapOrdinal(null);
      setAvailableCompareLaps([]); setBaselineDriverName(null);
      setIsLoading(false); setIsTrajLoading(false); setIsBaselineLoading(false);
      return;
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setIsCompareMode(initialCompareMode ?? false);
      setIsComparePickerOpen(false);
      setBaselineSessionId(initialBaselineSessionId ?? (initialCompareMode ? activeSessionId : null));
      setBaselineLapNumber(null);
      setBaselineLapOrdinal(initialBaselineLapOrdinal ?? null);
      setBaselineDriverOrdinal(initialBaselineDriverOrdinal ?? 0);
    }

    let isMounted = true;
    const requestId = ++trajectoryRequestIdRef.current;
    // Clear the previous session while the newly selected session loads.
    setMetadata(null);
    setTrajectory(null);
    setSelectedDriverSlot(null);
    setIsTrajLoading(false);
    lastTrajectoryRequestRef.current = null;
    setIsLoading(true);
    setError(null);
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
          const defaultSlot = pendingDriver?.slot ?? trajData.driverSlot ??
            metaData?.drivers?.find((d: ReplayDriverEntry) => d.isPlayer)?.slot ??
            metaData?.drivers?.[0]?.slot ?? null;
          setSelectedDriverSlot(defaultSlot);
          setSelectedDriverOrdinal(trajData.driverOrdinal ?? pendingDriver?.sessionDriverOrdinal ?? requestedDriver);
          setSelectedLapOrdinal(trajData.lapOrdinal ?? requestedLap);
        } else if (metaData?.drivers?.length) {
          const player = metaData.drivers.find((d: ReplayDriverEntry) => d.isPlayer) || metaData.drivers[0];
          if (player && typeof player.slot === 'number') setSelectedDriverSlot(player.slot);
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
  }, [isOpen, activeSessionId, replayLoadVersion, selectedDriverOrdinal, selectedLapOrdinal]);

  useEffect(() => { setComparePage(1); }, [metadata, activeSessionId, selectedDriverSlot, compareLapFilter]);

  // Fetch replay-backed comparison laps. Player laps are the safe default; the
  // all-driver view exposes the same candidate pool as Compare Laps.
  useEffect(() => {
    const trackToQuery = metadata?.displayTrack || metadata?.trackCourse || metadata?.trackName;
    // Wait for the metadata: before it the inspected driver's car class is unknown, and the
    // request would be repeated with it (laps are only compared within one car class).
    if (!isOpen || !metadata || !trackToQuery) {
      setAvailableCompareLaps([]); setIsCompareLapsLoading(false);
      setCompareLapsError(null);
      return;
    }
    const controller = new AbortController();
    let isCurrent = true;
    setAvailableCompareLaps([]);
    setCompareLapsError(null);
    setIsCompareLapsLoading(true);
    const activeDriver = metadata?.drivers?.find(d => d.slot === selectedDriverSlot) || metadata?.drivers?.find(d => d.isPlayer) || metadata?.drivers?.[0];
    // Laps are only compared within one car class: the INSPECTED driver's, which in a multiclass
    // replay may differ from the replay's own (player's) class in metadata.carClass.
    const carClass = resolveDriverCarClass(activeDriver) || metadata?.carClass;
    const needsAllDrivers = compareLapFilter === 'all' || compareLapFilter === 'same-sessions';
    const query = new URLSearchParams({
      track: trackToQuery,
      playerOnly: String(!needsAllDrivers),
      telemetryOnly: 'true', page: String(comparePage), pageSize: '50',
    });
    if (carClass) query.set('carClass', carClass);
    if (compareLapFilter === 'same-session-lap' || compareLapFilter === 'same-sessions') query.set('sessionId', activeSessionId!);

    fetchJson<{ laps?: ComparableLap[]; total?: number }>(`/api/compare/laps?${query.toString()}`, { signal: controller.signal })
      .then(data => {
        if (!isCurrent) return;
        const laps = Array.isArray(data?.laps) ? data.laps : [];
        setCompareTotal(data.total ?? laps.length);
        setAvailableCompareLaps(laps.filter((lap: ComparableLap) =>
          Boolean(lap.matchingReplayFile) && isRacingLap(lap) &&
          typeof lap.lapTime === 'number' && lap.lapTime > 0
        ));
        setIsCompareLapsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isCurrent || isAbortError(err)) return;
        setAvailableCompareLaps([]);
        setCompareLapsError(apiErrorMessage(err, 'Failed to load comparison laps'));
        setIsCompareLapsLoading(false);
      });
    return () => { isCurrent = false; controller.abort(); };
  }, [isOpen, metadata, activeSessionId, selectedDriverSlot, compareLapFilter, compareLoadVersion, comparePage]);

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
    setBaselineTrajectory(null);
    setBaselineMetadata(null);
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

  // Load baseline trajectory
  useEffect(() => {
    if (!isOpen || !isCompareMode || !baselineSessionId) {
      setBaselineTrajectory(null); setBaselineMetadata(null); setBaselineError(null); setIsBaselineLoading(false); return;
    }
    let isMounted = true;
    const controller = new AbortController();
    setBaselineTrajectory(null);
    setBaselineMetadata(null);
    setIsBaselineLoading(true);
    setBaselineError(null);
    const targetSessionId = baselineSessionId;
    const targetLap = baselineLapNumber ?? 1;
    const targetLapOrdinal = baselineLapOrdinal ?? 0;

    // A baseline from the inspected session uses its metadata; only another session's is fetched.
    const fetchMeta = targetSessionId === activeSessionId
      ? Promise.resolve(null)
      // Its metadata only labels the lap: a failed fetch must not drop a lap that loaded.
      : fetchSessionTelemetryMetadata(targetSessionId, { signal: controller.signal }).catch((err: unknown) => {
        if (isAbortError(err)) throw err;
        return null;
      });

    const fetchTraj = fetchSessionTelemetry(targetSessionId, {
      resolutionQuery: trajectoryResolutionQuery(telemetryResolution),
      driverOrdinal: baselineDriverOrdinal,
      lapOrdinal: targetLapOrdinal,
      source: selectedSource,
    }, { signal: controller.signal });

    Promise.all([fetchMeta, fetchTraj])
      .then(([meta, rawTraj]: [ReplayMetadata | null, ReplayTrajectoryData | null]) => {
        if (!isMounted) return;
        if (targetSessionId !== activeSessionId && meta) setBaselineMetadata(meta);
        const traj = applyTelemetryPostProcessingToTrajectory(rawTraj);
        if (!traj?.points.length) throw new Error('Comparison lap has no telemetry samples');
        setBaselineTrajectory(traj);
        setIsBaselineLoading(false);
        if (traj?.currentLap && typeof traj.currentLap === 'number' && traj.currentLap !== targetLap) {
          setBaselineLapNumber(traj.currentLap);
          setBaselineLapOrdinal(traj.lapOrdinal ?? targetLapOrdinal);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted || isAbortError(err)) return;
        setBaselineTrajectory(null);
        setBaselineError(apiErrorMessage(err, 'Failed to load comparison lap'));
        setIsBaselineLoading(false);
      });

    return () => { isMounted = false; controller.abort(); };
  }, [isOpen, isCompareMode, baselineSessionId, baselineLapNumber, baselineLapOrdinal, baselineDriverOrdinal, activeSessionId, telemetryResolution, selectedSource, baselineLoadVersion]);

  const fetchTrajectory = (
    lapNum?: number,
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
    const targetLap = lapNum ?? trajectory?.currentLap ?? 1;
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
  const handleRetryCompareLaps = () => setCompareLoadVersion(version => version + 1);
  const handleRetryBaseline = () => setBaselineLoadVersion(version => version + 1);

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

  const handleSelectLap = (lapNum: number) => {
    setIsPlaying(false); setCurrentIndex(0); setChartZoomRange(null);
    fetchTrajectory(lapNum, selectedDriverSlot);
  };

  const handleChangeResolution = (res: TelemetryResolution) => {
    setTelemetryResolution(res); fetchTrajectory(trajectory?.currentLap, selectedDriverSlot, res);
  };

  const handleSelectCompareLap = (lap: ComparableLap) => {
    if (!lap.sessionId || lap.driverOrdinal === undefined || lap.lapOrdinal === undefined) return;
    setIsCompareMode(true);
    setBaselineSessionId(lap.sessionId);
    setBaselineLapNumber(lap.lapNum ?? 1);
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
      playbackCursor.clear();
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    // Playback follows the lap's clock (see replayPlaybackClock), not the sample count.
    const points = trajectory.points;
    lastTimeRef.current = performance.now();
    playbackClockRef.current = playbackClockAt(points, currentIndexRef.current);
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
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); playbackCursor.clear(); };
  }, [isPlaying, trajectory, playbackSpeed, playbackCursor]);

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

  return {
    metadata, trajectory, selectedDriverSlot, selectedDriver, playerDriver,
    isLoading, isTrajLoading, error, handleRetryLoad, isCompareMode, handleToggleCompare,
    handleSwapBaseline, handleRemoveCompare, handleCloseComparePicker, isComparePickerOpen, baselineSessionId, setBaselineSessionId,
    baselineLapNumber, setBaselineLapNumber, baselineDriverName, setBaselineDriverName,
    baselineTrajectory: comparableBaselineTrajectory, baselineMetadata, availableCompareLaps, compareLapFilter,
    isCompareLapsLoading, compareLapsError, handleRetryCompareLaps, handleRetryBaseline, setCompareLapFilter, handleSelectCompareLap,
    comparePagination: { page: comparePage, pageSize: 50, total: compareTotal, onPageChange: setComparePage },
    isBaselineLoading, baselineError: comparableBaselineError, currentIndex, setCurrentIndex, isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed, playbackCursor, chartZoomRange, setChartZoomRange,
    handleSelectDriver, handleSelectLap, telemetryResolution, handleChangeResolution,
    currentPoint, currentLapSummary, lapDeltas, activeSessionId,
    handleSelectBaselineLap,
    selectedSource,
    handleSelectSource,
    hasDuckDbTelemetry: Boolean(metadata?.hasDuckDbTelemetry || trajectory?.duckdbFilename || trajectory?.source === 'duckdb'),
    duckdbUnavailableReason: trajectory?.duckdbUnavailableReason,
  };
}
