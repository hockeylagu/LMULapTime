import { useState, useEffect, useRef, useMemo } from 'react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ReplaySummary } from '../../../server/types.js';
import { filterCompatibleReplays } from '../../utils/replayComparison.js';

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
  const [baselineReplayName, setBaselineReplayName] = useState<string | null>(initialBaselineReplayName ?? null);
  const [baselineLapNumber, setBaselineLapNumber] = useState<number | null>(initialBaselineLapNumber ?? null);
  const [baselineTrajectory, setBaselineTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [baselineMetadata, setBaselineMetadata] = useState<ReplayMetadata | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState<boolean>(false);
  const [compatibleReplays, setCompatibleReplays] = useState<ReplaySummary[]>([]);
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
      setIsPlaying(false); setIsCompareMode(false); setBaselineReplayName(null); setBaselineLapNumber(null);
      setBaselineTrajectory(null); setBaselineMetadata(null); setChartZoomRange(null);
      return;
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setIsCompareMode(initialCompareMode ?? false);
      setBaselineReplayName(initialBaselineReplayName ?? (initialCompareMode ? activeReplayName : null));
      setBaselineLapNumber(initialBaselineLapNumber ?? null);
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    const lapQuery = initialLapNumber && initialLapNumber > 0 ? `&lap=${initialLapNumber}` : '';

    Promise.all([
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/metadata`).then(r => (r.ok ? r.json() : null)),
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/trajectory?maxPoints=${telemetryResolution}${lapQuery}`).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([metaData, trajData]) => {
        if (!isMounted) return;
        if (!metaData) setError(`Could not load metadata for replay ${activeReplayName}`);
        else setMetadata(metaData);

        if (trajData) {
          setTrajectory(trajData);
          if (trajData.currentLap) onLapChange?.(trajData.currentLap);
          const defaultSlot = trajData.driverSlot ??
            metaData?.drivers?.find((d: ReplayDriverEntry) => d.isPlayer)?.slot ??
            metaData?.drivers?.[0]?.slot ?? null;
          setSelectedDriverSlot(defaultSlot);
        } else if (metaData?.drivers?.length) {
          const player = metaData.drivers.find((d: ReplayDriverEntry) => d.isPlayer) || metaData.drivers[0];
          if (player && typeof player.slot === 'number') setSelectedDriverSlot(player.slot);
        }
        setIsLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load replay data');
        setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, activeReplayName]);

  // Fetch compatible candidate replays
  useEffect(() => {
    if (!isOpen || !metadata?.trackName) { setCompatibleReplays([]); return; }
    const playerDriver = metadata.drivers?.find(d => d.slot === selectedDriverSlot) || metadata.drivers?.find(d => d.isPlayer) || metadata.drivers?.[0];
    const carClass = playerDriver?.carClass || metadata.eventTitle;

    fetch('http://localhost:3001/api/replays')
      .then(r => (r.ok ? r.json() : []))
      .then((allReplays: ReplaySummary[]) => {
        setCompatibleReplays(filterCompatibleReplays(allReplays, metadata.trackName, carClass, activeReplayName || undefined));
      })
      .catch(() => setCompatibleReplays([]));
  }, [isOpen, metadata?.trackName, activeReplayName, selectedDriverSlot]);

  // Toggle compare mode
  const handleToggleCompare = () => {
    setIsCompareMode(prev => {
      const next = !prev;
      if (next && !baselineReplayName) {
        setBaselineReplayName(activeReplayName);
        const bestLap = trajectory?.laps?.find(l => l.isBest)?.lapNumber;
        const currentLap = trajectory?.currentLap ?? 1;
        setBaselineLapNumber(bestLap && bestLap !== currentLap ? bestLap : trajectory?.laps?.find(l => l.lapNumber !== currentLap)?.lapNumber || currentLap);
      }
      return next;
    });
  };

  // Swap primary lap and baseline lap
  const handleSwapBaseline = () => {
    if (!isCompareMode) return;
    const curPrimaryLap = trajectory?.currentLap ?? initialLapNumber ?? 1;
    const curBaseLap = baselineLapNumber ?? 1;
    const curPrimaryReplay = activeReplayName;
    const curBaseReplay = baselineReplayName || activeReplayName;

    if (curBaseReplay === curPrimaryReplay) {
      handleSelectLap(curBaseLap);
      setBaselineLapNumber(curPrimaryLap);
    } else {
      setActiveReplayName(curBaseReplay);
      setBaselineReplayName(curPrimaryReplay);
      setBaselineLapNumber(curPrimaryLap);
      handleSelectLap(curBaseLap);
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

    fetchMeta.then(meta => {
      if (!isMounted) return;
      if (targetReplay !== activeReplayName) setBaselineMetadata(meta);
      let validLap = targetLap;
      if (meta?.laps && meta.laps.length > 0 && !meta.laps.some((l: any) => l.lapNumber === validLap)) {
        validLap = meta.laps.find((l: any) => l.isBest)?.lapNumber || meta.laps[0].lapNumber;
        setBaselineLapNumber(validLap);
      }
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(targetReplay)}/trajectory?maxPoints=${telemetryResolution}&lap=${validLap}`)
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
  }, [isCompareMode, baselineReplayName, baselineLapNumber, activeReplayName, metadata, telemetryResolution]);

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
    handleSwapBaseline, compatibleReplays, baselineReplayName, setBaselineReplayName,
    baselineLapNumber, setBaselineLapNumber, baselineTrajectory, baselineMetadata,
    isBaselineLoading, currentIndex, setCurrentIndex, isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed, chartZoomRange, setChartZoomRange,
    handleSelectDriver, handleSelectLap, telemetryResolution, handleChangeResolution,
    maxSpeed, currentPoint, currentLapSummary, lapDeltas, activeReplayName,
  };
}
