import { useState, useEffect, useRef, useMemo } from 'react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ReplaySummary } from '../../../server/types.js';
import { filterCompatibleReplays } from '../../utils/replayComparison.js';

export interface UseReplayInspectorDataProps {
  isOpen: boolean;
  replayName: string | null;
  initialLapNumber?: number;
  onLapChange?: (lapNumber: number) => void;
}

export function useReplayInspectorData({
  isOpen,
  replayName,
  initialLapNumber,
  onLapChange,
}: UseReplayInspectorDataProps) {
  const [metadata, setMetadata] = useState<ReplayMetadata | null>(null);
  const [trajectory, setTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [selectedDriverSlot, setSelectedDriverSlot] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTrajLoading, setIsTrajLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Lap comparison states
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [baselineReplayName, setBaselineReplayName] = useState<string | null>(null);
  const [baselineLapNumber, setBaselineLapNumber] = useState<number | null>(null);
  const [baselineTrajectory, setBaselineTrajectory] = useState<ReplayTrajectoryData | null>(null);
  const [baselineMetadata, setBaselineMetadata] = useState<ReplayMetadata | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState<boolean>(false);
  const [compatibleReplays, setCompatibleReplays] = useState<ReplaySummary[]>([]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [chartZoomRange, setChartZoomRange] = useState<{ start: number; end: number } | null>(null);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Load replay metadata & initial trajectory
  useEffect(() => {
    if (!isOpen || !replayName) {
      setMetadata(null);
      setTrajectory(null);
      setSelectedDriverSlot(null);
      setCurrentIndex(0);
      setIsPlaying(false);
      setIsCompareMode(false);
      setBaselineReplayName(null);
      setBaselineLapNumber(null);
      setBaselineTrajectory(null);
      setBaselineMetadata(null);
      setChartZoomRange(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    const lapQuery = initialLapNumber && initialLapNumber > 0 ? `&lap=${initialLapNumber}` : '';

    Promise.all([
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/metadata`).then(r => (r.ok ? r.json() : null)),
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?maxPoints=1200${lapQuery}`).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([metaData, trajData]) => {
        if (!isMounted) return;
        if (!metaData) setError(`Could not load metadata for replay ${replayName}`);
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
  }, [isOpen, replayName, initialLapNumber]);

  // Fetch compatible candidate replays
  useEffect(() => {
    if (!isOpen || !metadata?.trackName) {
      setCompatibleReplays([]);
      return;
    }
    const playerDriver = metadata.drivers?.find(d => d.slot === selectedDriverSlot) ||
      metadata.drivers?.find(d => d.isPlayer) ||
      metadata.drivers?.[0];
    const carClass = playerDriver?.carClass || metadata.eventTitle;

    fetch('http://localhost:3001/api/replays')
      .then(r => (r.ok ? r.json() : []))
      .then((allReplays: ReplaySummary[]) => {
        setCompatibleReplays(filterCompatibleReplays(allReplays, metadata.trackName, carClass, replayName || undefined));
      })
      .catch(() => setCompatibleReplays([]));
  }, [isOpen, metadata?.trackName, replayName, selectedDriverSlot]);

  // Toggle compare mode
  const handleToggleCompare = () => {
    setIsCompareMode(prev => {
      const next = !prev;
      if (next && !baselineReplayName) {
        setBaselineReplayName(replayName);
        const bestLap = trajectory?.laps?.find(l => l.isBest)?.lapNumber;
        const currentLap = trajectory?.currentLap ?? 1;
        const candidateLap = bestLap && bestLap !== currentLap
          ? bestLap
          : trajectory?.laps?.find(l => l.lapNumber !== currentLap)?.lapNumber || currentLap;
        setBaselineLapNumber(candidateLap);
      }
      return next;
    });
  };

  // Load baseline trajectory
  useEffect(() => {
    if (!isCompareMode || !baselineReplayName) {
      setBaselineTrajectory(null);
      setBaselineMetadata(null);
      return;
    }
    let isMounted = true;
    setIsBaselineLoading(true);
    const targetReplay = baselineReplayName;
    const targetLap = baselineLapNumber ?? 1;

    const fetchMeta = targetReplay === replayName && metadata
      ? Promise.resolve(metadata)
      : fetch(`http://localhost:3001/api/replays/${encodeURIComponent(targetReplay)}/metadata`).then(r => (r.ok ? r.json() : null));

    fetchMeta.then(meta => {
      if (!isMounted) return;
      if (targetReplay !== replayName) setBaselineMetadata(meta);
      let validLap = targetLap;
      if (meta?.laps && meta.laps.length > 0 && !meta.laps.some((l: any) => l.lapNumber === validLap)) {
        validLap = meta.laps.find((l: any) => l.isBest)?.lapNumber || meta.laps[0].lapNumber;
        setBaselineLapNumber(validLap);
      }
      fetch(`http://localhost:3001/api/replays/${encodeURIComponent(targetReplay)}/trajectory?maxPoints=1200&lap=${validLap}`)
        .then(r => (r.ok ? r.json() : null))
        .then((traj: ReplayTrajectoryData | null) => {
          if (!isMounted) return;
          setBaselineTrajectory(traj);
          setIsBaselineLoading(false);
        })
        .catch(() => { if (isMounted) setIsBaselineLoading(false); });
    }).catch(() => { if (isMounted) setIsBaselineLoading(false); });

    return () => { isMounted = false; };
  }, [isCompareMode, baselineReplayName, baselineLapNumber, replayName, metadata]);

  // Handle external lap changes
  useEffect(() => {
    if (isOpen && initialLapNumber && trajectory && trajectory.currentLap !== initialLapNumber) {
      handleSelectLap(initialLapNumber);
    }
  }, [isOpen, initialLapNumber]);

  const handleSelectDriver = (slot: number) => {
    if (!replayName) return;
    setSelectedDriverSlot(slot);
    setIsTrajLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);
    setChartZoomRange(null);

    fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?driverSlot=${slot}&maxPoints=1200`)
      .then(r => (r.ok ? r.json() : null))
      .then((trajData: ReplayTrajectoryData | null) => {
        if (trajData) setTrajectory(trajData);
        setIsTrajLoading(false);
      })
      .catch(() => setIsTrajLoading(false));
  };

  const handleSelectLap = (lapNum: number) => {
    if (!replayName) return;
    setIsTrajLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);
    setChartZoomRange(null);
    onLapChange?.(lapNum);

    const slotParam = typeof selectedDriverSlot === 'number' ? `&driverSlot=${selectedDriverSlot}` : '';
    fetch(`http://localhost:3001/api/replays/${encodeURIComponent(replayName)}/trajectory?maxPoints=1200&lap=${lapNum}${slotParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then((trajData: ReplayTrajectoryData | null) => {
        if (trajData) setTrajectory(trajData);
        setIsTrajLoading(false);
      })
      .catch(() => setIsTrajLoading(false));
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
        setCurrentIndex(prev => {
          if (prev + framesToAdvance >= trajectory.points.length) {
            setIsPlaying(false);
            return 0;
          }
          return prev + framesToAdvance;
        });
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

  const selectedDriver = metadata?.drivers?.find(d => d.slot === selectedDriverSlot) ||
    metadata?.drivers?.find(d => d.name === trajectory?.driverName);
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
    const lapDelta = typeof currentLapSummary.lapTimeSec === 'number' && typeof baselineLapSummary.lapTimeSec === 'number'
      ? currentLapSummary.lapTimeSec - baselineLapSummary.lapTimeSec : null;
    const s1Delta = typeof currentLapSummary.s1Sec === 'number' && typeof baselineLapSummary.s1Sec === 'number'
      ? currentLapSummary.s1Sec - baselineLapSummary.s1Sec : null;
    const s2Delta = typeof currentLapSummary.s2Sec === 'number' && typeof baselineLapSummary.s2Sec === 'number'
      ? currentLapSummary.s2Sec - baselineLapSummary.s2Sec : null;
    const s3Delta = typeof currentLapSummary.s3Sec === 'number' && typeof baselineLapSummary.s3Sec === 'number'
      ? currentLapSummary.s3Sec - baselineLapSummary.s3Sec : null;
    return { lapDelta, s1Delta, s2Delta, s3Delta };
  }, [currentLapSummary, baselineLapSummary]);

  return {
    metadata,
    trajectory,
    selectedDriverSlot,
    selectedDriver,
    playerDriver,
    isLoading,
    isTrajLoading,
    error,
    isCompareMode,
    handleToggleCompare,
    compatibleReplays,
    baselineReplayName,
    setBaselineReplayName,
    baselineLapNumber,
    setBaselineLapNumber,
    baselineTrajectory,
    baselineMetadata,
    isBaselineLoading,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    chartZoomRange,
    setChartZoomRange,
    handleSelectDriver,
    handleSelectLap,
    maxSpeed,
    currentPoint,
    currentLapSummary,
    lapDeltas,
  };
}
