import { useState, useEffect, useRef, useMemo } from 'react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ReplayLapSummary } from '../../../server/types.js';
import { ComparableLap } from '../../utils/lapComparison.js';
import { mapVehicleIdToClass } from '../../utils/replayComparison.js';

export interface UseReplayInspectorDataProps {
  isOpen: boolean;
  replayName: string | null;
  initialLapNumber?: number;
  onLapChange?: (lapNumber: number) => void;
  initialCompareMode?: boolean;
  initialBaselineReplayName?: string | null;
  initialBaselineLapNumber?: number | null;
}

export function useReplayInspectorData({
  isOpen,
  replayName,
  initialLapNumber,
  onLapChange,
  initialCompareMode,
  initialBaselineReplayName,
  initialBaselineLapNumber,
}: UseReplayInspectorDataProps) {
  const [activeReplayName, setActiveReplayName] = useState<string | null>(replayName);
  const [metadata, setMetadata] = useState<ReplayMetadata | null>(null);
  const [trajectory, setTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [selectedDriverSlot, setSelectedDriverSlot] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTrajLoading, setIsTrajLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState<boolean>(initialCompareMode ?? false);
  const [isComparePickerOpen, setIsComparePickerOpen] = useState<boolean>(initialCompareMode ?? false);
  const [baselineReplayName, setBaselineReplayName] = useState<string | null>(initialBaselineReplayName ?? null);
  const [baselineLapNumber, setBaselineLapNumber] = useState<number | null>(initialBaselineLapNumber ?? null);
  const [baselineTrajectory, setBaselineTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [baselineMetadata, setBaselineMetadata] = useState<ReplayMetadata | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState<boolean>(false);
  const [availableCompareLaps, setAvailableCompareLaps] = useState<ComparableLap[]>([]);
  const [compareLapFilter, setCompareLapFilter] = useState<'player' | 'all'>('player');
  const [isCompareLapsLoading, setIsCompareLapsLoading] = useState(false);
  const [baselineDriverName, setBaselineDriverName] = useState<string | null>(null);
  const [pendingDriverName, setPendingDriverName] = useState<string | null>(null);
  const [pendingLapNumber, setPendingLapNumber] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [chartZoomRange, setChartZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [telemetryResolution, setTelemetryResolution] = useState<number>(2400);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const hasInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    setActiveReplayName(replayName);
  }, [replayName]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen]);

  // Load replay metadata & initial trajectory (only on open or when activeReplayName changes)
  useEffect(() => {
    if (!isOpen || !activeReplayName) {
      hasInitializedRef.current = false;
      setMetadata(null); setTrajectory(null); setSelectedDriverSlot(null); setCurrentIndex(0);
      setIsPlaying(false); setIsCompareMode(false); setIsComparePickerOpen(false); setBaselineReplayName(null); setBaselineLapNumber(null);
      setBaselineTrajectory(null); setBaselineMetadata(null); setChartZoomRange(null);
      setAvailableCompareLaps([]); setBaselineDriverName(null);
      setPendingDriverName(null); setPendingLapNumber(null);
      return;
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setIsCompareMode(initialCompareMode ?? false);
      setIsComparePickerOpen(initialCompareMode ?? false);
      setBaselineReplayName(initialBaselineReplayName ?? (initialCompareMode ? activeReplayName : null));
      setBaselineLapNumber(initialBaselineLapNumber ?? null);
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    const requestedLap = pendingLapNumber ?? initialLapNumber;
    const lapQuery = requestedLap && requestedLap > 0 ? `&lap=${requestedLap}` : '';
    const driverQuery = pendingDriverName ? `&driverName=${encodeURIComponent(pendingDriverName)}` : '';

    Promise.all([
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/metadata`).then(r => (r.ok ? r.json() : null)),
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/trajectory?maxPoints=${telemetryResolution}${lapQuery}${driverQuery}`).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([metaData, trajData]) => {
        if (!isMounted) return;
        if (!metaData) setError(`Could not load metadata for replay ${activeReplayName}`);
        else setMetadata(metaData);

        if (trajData) {
          setTrajectory(trajData);
          if (trajData.currentLap) onLapChange?.(trajData.currentLap);
          const pendingDriver = pendingDriverName ? metaData?.drivers?.find((d: ReplayDriverEntry) => d.name.toLowerCase() === pendingDriverName.toLowerCase()) : undefined;
          const defaultSlot = pendingDriver?.slot ?? trajData.driverSlot ??
            metaData?.drivers?.find((d: ReplayDriverEntry) => d.isPlayer)?.slot ??
            metaData?.drivers?.[0]?.slot ?? null;
          setSelectedDriverSlot(defaultSlot);
        } else if (metaData?.drivers?.length) {
          const player = metaData.drivers.find((d: ReplayDriverEntry) => d.isPlayer) || metaData.drivers[0];
          if (player && typeof player.slot === 'number') setSelectedDriverSlot(player.slot);
        }
        setPendingDriverName(null);
        setPendingLapNumber(null);
        setIsLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load replay data');
        setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, activeReplayName]);

  // Fetch replay-backed comparison laps. Player laps are the safe default; the
  // all-driver view exposes the same candidate pool as Compare Laps.
  useEffect(() => {
    if (!isOpen || !metadata?.trackName) {
      setAvailableCompareLaps([]); setIsCompareLapsLoading(false);
      return;
    }
    setIsCompareLapsLoading(true);
    const activeDriver = metadata.drivers?.find(d => d.slot === selectedDriverSlot) || metadata.drivers?.find(d => d.isPlayer) || metadata.drivers?.[0];
    const carClass = metadata.carClass || activeDriver?.carClass || (activeDriver ? mapVehicleIdToClass(activeDriver.vehicleId, activeDriver.carModel) : undefined);
    const query = new URLSearchParams({
      track: metadata.trackName,
      playerOnly: String(compareLapFilter === 'player'),
    });
    if (carClass) query.set('carClass', carClass);

    fetch(`http://localhost:3001/api/compare/laps?${query.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const laps = Array.isArray(data?.laps) ? data.laps : [];
        setAvailableCompareLaps(laps.filter((lap: ComparableLap) =>
          Boolean(lap.matchingReplayFile) && Boolean(lap.isValid) && !lap.isPitStop && !lap.isOutLap &&
          typeof lap.lapTime === 'number' && lap.lapTime > 0
        ));
        setIsCompareLapsLoading(false);
      })
      .catch(() => { setAvailableCompareLaps([]); setIsCompareLapsLoading(false); });
  }, [isOpen, metadata?.trackName, metadata?.carClass, selectedDriverSlot, compareLapFilter]);

  // Open the comparison lap picker. Comparison stays active until explicitly removed.
  const handleToggleCompare = () => {
    setIsComparePickerOpen(true);
  };

  const handleCloseComparePicker = () => setIsComparePickerOpen(false);

  const handleRemoveCompare = () => {
    setIsCompareMode(false);
    setIsComparePickerOpen(false);
    setBaselineReplayName(null);
    setBaselineLapNumber(null);
    setBaselineDriverName(null);
    setPendingDriverName(null);
    setPendingLapNumber(null);
    setBaselineTrajectory(null);
    setBaselineMetadata(null);
  };

  // Swap primary lap and baseline lap
  const handleSwapBaseline = () => {
    if (!isCompareMode) return;
    const curPrimaryLap = trajectory?.currentLap ?? initialLapNumber ?? 1;
    const curBaseLap = baselineLapNumber ?? 1;
    const curPrimaryReplay = activeReplayName;
    const curBaseReplay = baselineReplayName || activeReplayName;
    const curPrimaryDriver = selectedDriver?.name || trajectory?.driverName || null;
    const curBaseDriver = baselineDriverName || baselineTrajectory?.driverName || null;

    if (curBaseReplay === curPrimaryReplay) {
      const baseSlot = curBaseDriver
        ? metadata?.drivers?.find(d => d.name.toLowerCase() === curBaseDriver.toLowerCase())?.slot
        : undefined;
      setBaselineDriverName(curPrimaryDriver);
      setBaselineLapNumber(curPrimaryLap);
      if (typeof baseSlot === 'number') {
        setSelectedDriverSlot(baseSlot);
        fetchTrajectory(curBaseLap, baseSlot);
      } else {
        handleSelectLap(curBaseLap);
      }
    } else {
      setBaselineReplayName(curPrimaryReplay);
      setBaselineDriverName(curPrimaryDriver);
      setBaselineLapNumber(curPrimaryLap);
      setPendingDriverName(curBaseDriver);
      setPendingLapNumber(curBaseLap);
      setSelectedDriverSlot(null);
      setActiveReplayName(curBaseReplay);
      setIsPlaying(false);
      setCurrentIndex(0);
      setChartZoomRange(null);
    }
  };

  // Load baseline trajectory
  useEffect(() => {
    if (!isCompareMode || !baselineReplayName) {
      setBaselineTrajectory(null); setBaselineMetadata(null); return;
    }
    let isMounted = true;
    setIsBaselineLoading(true);
    const targetReplay = baselineReplayName;
    const targetLap = baselineLapNumber ?? 1;

    const fetchMeta = targetReplay === activeReplayName && metadata
      ? Promise.resolve(metadata)
      : fetch(`http://localhost:3001/api/replays/${encodeURIComponent(targetReplay)}/metadata`).then(r => (r.ok ? r.json() : null));

    fetchMeta.then((meta: ReplayMetadata | null) => {
      if (!isMounted) return;
      if (targetReplay !== activeReplayName) setBaselineMetadata(meta);
      let validLap = targetLap;
      if (meta?.laps && meta.laps.length > 0 && !meta.laps.some((l: ReplayLapSummary) => l.lapNumber === validLap)) {
        validLap = meta.laps.find((l: ReplayLapSummary) => l.isBest)?.lapNumber || meta.laps[0].lapNumber;
        setBaselineLapNumber(validLap);
      }
      const driverQuery = baselineDriverName ? `&driverName=${encodeURIComponent(baselineDriverName)}` : '';
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(targetReplay)}/trajectory?maxPoints=${telemetryResolution}&lap=${validLap}${driverQuery}`)
        .then(r => (r.ok ? r.json() : null))
        .then((traj: ReplayTrajectoryData | null) => {
          if (isMounted) {
            setBaselineTrajectory(traj);
            setIsBaselineLoading(false);
            if (traj?.laps && traj.laps.length > 0 && !traj.laps.some(l => l.lapNumber === validLap)) {
              setBaselineLapNumber(traj.currentLap || traj.laps.find(l => l.isBest)?.lapNumber || traj.laps[0].lapNumber);
            }
          }
        })
        .catch(() => { if (isMounted) setIsBaselineLoading(false); });
    }).catch(() => { if (isMounted) setIsBaselineLoading(false); });

    return () => { isMounted = false; };
  }, [isCompareMode, baselineReplayName, baselineLapNumber, baselineDriverName, activeReplayName, metadata, telemetryResolution]);

  // Handle external lap changes
  useEffect(() => {
    if (isOpen && initialLapNumber && trajectory && trajectory.currentLap !== initialLapNumber) {
      handleSelectLap(initialLapNumber);
    }
  }, [isOpen, initialLapNumber]);

  const fetchTrajectory = (lapNum?: number, slot?: number | null, res: number = telemetryResolution) => {
    if (!activeReplayName) return;
    setIsTrajLoading(true);
    const targetLap = lapNum ?? trajectory?.currentLap ?? initialLapNumber ?? 1;
    const targetSlot = slot !== undefined ? slot : selectedDriverSlot;
    const slotParam = typeof targetSlot === 'number' ? `&driverSlot=${targetSlot}` : '';
    fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/trajectory?maxPoints=${res}&lap=${targetLap}${slotParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then((trajData: ReplayTrajectoryData | null) => {
        if (trajData) {
          setTrajectory(trajData);
          if (trajData.currentLap) onLapChange?.(trajData.currentLap);
        }
        setIsTrajLoading(false);
      })
      .catch(() => setIsTrajLoading(false));
  };

  const handleSelectDriver = (slot: number) => {
    setSelectedDriverSlot(slot); setIsPlaying(false); setCurrentIndex(0); setChartZoomRange(null);
    fetchTrajectory(trajectory?.currentLap, slot);
  };

  const handleSelectLap = (lapNum: number) => {
    setIsPlaying(false); setCurrentIndex(0); setChartZoomRange(null);
    onLapChange?.(lapNum); fetchTrajectory(lapNum, selectedDriverSlot);
  };

  const handleChangeResolution = (res: number) => {
    setTelemetryResolution(res); fetchTrajectory(trajectory?.currentLap, selectedDriverSlot, res);
  };

  const handleSelectCompareLap = (lap: ComparableLap) => {
    if (!lap.matchingReplayFile) return;
    setIsCompareMode(true);
    setBaselineReplayName(lap.matchingReplayFile);
    setBaselineLapNumber(lap.lapNum ?? 1);
    setBaselineDriverName(lap.driverName || null);
    setIsComparePickerOpen(false);
  };

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || !trajectory || trajectory.points.length === 0) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    lastTimeRef.current = performance.now();
    const loop = (now: number) => {
      const delta = now - lastTimeRef.current;
      const framesToAdvance = Math.max(1, Math.round((delta / 25) * playbackSpeed));
      if (delta >= 20 / playbackSpeed) {
        lastTimeRef.current = now;
        setCurrentIndex(prev => (prev + framesToAdvance >= trajectory.points.length ? (setIsPlaying(false), 0) : prev + framesToAdvance));
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, trajectory, playbackSpeed]);

  const maxSpeed = useMemo(() => {
    if (!trajectory || trajectory.points.length === 0) return 0;
    return Math.max(...trajectory.points.map(p => p.speedKmh || 0));
  }, [trajectory]);

  const selectedDriver = metadata?.drivers?.find(d => d.slot === selectedDriverSlot) || metadata?.drivers?.find(d => d.name === trajectory?.driverName);
  const playerDriver = useMemo(() => metadata?.drivers?.find(d => d.isPlayer), [metadata?.drivers]);
  const currentPoint = trajectory?.points[currentIndex];
  const currentLapSummary = trajectory?.laps?.find(l => l.lapNumber === trajectory.currentLap) || trajectory?.laps?.[0];

  const baselineLapSummary = useMemo(() => {
    if (!baselineTrajectory) return null;
    const laps = baselineTrajectory.laps || baselineMetadata?.laps || [];
    const cur = baselineTrajectory.currentLap ?? baselineLapNumber ?? 1;
    return laps.find(l => l.lapNumber === cur) || laps[0] || null;
  }, [baselineTrajectory, baselineMetadata, baselineLapNumber]);

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
    isLoading, isTrajLoading, error, isCompareMode, handleToggleCompare,
    handleSwapBaseline, handleToggleCompare, handleRemoveCompare, handleCloseComparePicker, isComparePickerOpen, baselineReplayName, setBaselineReplayName,
    baselineLapNumber, setBaselineLapNumber, baselineDriverName, setBaselineDriverName,
    baselineTrajectory, baselineMetadata, availableCompareLaps, compareLapFilter,
    isCompareLapsLoading, setCompareLapFilter, handleSelectCompareLap,
    isBaselineLoading, currentIndex, setCurrentIndex, isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed, chartZoomRange, setChartZoomRange,
    handleSelectDriver, handleSelectLap, telemetryResolution, handleChangeResolution,
    maxSpeed, currentPoint, currentLapSummary, lapDeltas, activeReplayName,
  };
}
