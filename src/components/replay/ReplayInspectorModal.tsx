import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReplayInspectorData } from './useReplayInspectorData.js';
import { useCornerConsistency } from './useCornerConsistency.js';
import { MapColorMode } from './replayMapUtils.js';
import { computeCumulativeDistances, findIndexAtDistance } from '../../utils/replayComparison.js';
import { computeLapSegmentComparisons, filterCornerConsistencyStats } from '../../utils/cornerAnalysis.js';
import { computeLapConsistencyStats } from '../../utils/lapConsistency.js';
import { formatTime } from '../../utils/formatters.js';
import { ReplayInspectorModalBody } from './ReplayInspectorModalBody.js';

export interface ReplayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  replayName: string | null;
  initialLapNumber?: number;
  initialDriverName?: string | null;
  onLapChange?: (lapNumber: number) => void;
  initialCompareMode?: boolean;
  initialBaselineReplayName?: string | null;
  initialBaselineLapNumber?: number | null;
  initialBaselineDriverName?: string | null;
}

export const ReplayInspectorModal: React.FC<ReplayInspectorModalProps> = ({
  isOpen,
  onClose,
  replayName,
  initialLapNumber,
  initialDriverName,
  onLapChange,
  initialCompareMode,
  initialBaselineReplayName,
  initialBaselineLapNumber,
  initialBaselineDriverName,
}) => {
  const {
    metadata,
    trajectory,
    selectedDriverSlot,
    isLoading,
    isTrajLoading,
    error,
    isCompareMode,
    handleToggleCompare,
    baselineReplayName,
    baselineLapNumber,
    baselineDriverName,
    isComparePickerOpen,
    handleCloseComparePicker,
    availableCompareLaps,
    compareLapFilter,
    isCompareLapsLoading,
    setCompareLapFilter,
    handleSelectCompareLap,
    baselineTrajectory,
    isBaselineLoading,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    chartZoomRange,
    setChartZoomRange,
    telemetryResolution,
    handleChangeResolution,
    handleSelectDriver,
    handleSelectLap,
    maxSpeed,
    currentPoint,
    currentLapSummary,
    lapDeltas,
    handleSwapBaseline,
    handleRemoveCompare,
    activeReplayName,
    handleSelectBaselineLap,
  } = useReplayInspectorData({
    isOpen,
    replayName,
    initialLapNumber,
    initialDriverName,
    onLapChange,
    initialCompareMode,
    initialBaselineReplayName,
    initialBaselineLapNumber,
    initialBaselineDriverName,
  });

  const [activeTab, setActiveTab] = useState<'map' | 'corners' | 'ai-report'>('map');
  const [cornerSubView, setCornerSubView] = useState<'compare' | 'consistency'>('compare');
  const [colorBy, setColorBy] = useState<MapColorMode>('speed');
  const [mapViewMode, setMapViewMode] = useState<'dual' | 'overview' | 'zoom'>('dual');
  const [selectedCornerNumber, setSelectedCornerNumber] = useState<number | null>(null);
  const [excludedConsistencyLaps, setExcludedConsistencyLaps] = useState<Set<number>>(new Set());

  const toggleConsistencyLap = (lapNumber: number) => {
    setExcludedConsistencyLaps(prev => {
      const next = new Set(prev);
      if (next.has(lapNumber)) next.delete(lapNumber);
      else next.add(lapNumber);
      return next;
    });
  };

  useEffect(() => {
    if (colorBy === 'delta' && (!isCompareMode || !baselineTrajectory)) {
      setColorBy('speed');
    }
  }, [colorBy, isCompareMode, baselineTrajectory]);

  const lapSegments = useMemo(() => {
    if (!trajectory) return [];
    const baseline = isCompareMode && baselineTrajectory ? baselineTrajectory.points : trajectory.points;
    return computeLapSegmentComparisons(trajectory.points, baseline);
  }, [isCompareMode, trajectory, baselineTrajectory]);

  const cornerSegments = useMemo(() => lapSegments.filter(s => s.type === 'corner'), [lapSegments]);
  const cornerCount = cornerSegments.length;
  const isSelfAnalysis = !isCompareMode || !baselineTrajectory;

  const consistencyStats = useMemo(
    () => computeLapConsistencyStats((trajectory?.laps || []).filter(l => !excludedConsistencyLaps.has(l.lapNumber))),
    [trajectory, excludedConsistencyLaps]
  );

  const { cornerStats: rawCornerConsistencyStats, isLoading: isCornerConsistencyLoading } =
    useCornerConsistency(activeTab === 'corners' && cornerSubView === 'consistency', activeReplayName, metadata, selectedDriverSlot, trajectory);

  const cornerConsistencyStats = useMemo(
    () => filterCornerConsistencyStats(rawCornerConsistencyStats, excludedConsistencyLaps),
    [rawCornerConsistencyStats, excludedConsistencyLaps]
  );

  const availableConsistencyLaps = useMemo(() => {
    const laps = (trajectory?.laps || metadata?.laps || []).filter(l => l.lapTimeSec > 0);
    return laps
      .map(l => ({ lapNumber: l.lapNumber, lapTimeSec: l.lapTimeSec, isValid: l.isValid !== false && !l.isOutlap }))
      .sort((a, b) => a.lapNumber - b.lapNumber);
  }, [metadata, trajectory]);

  const initializedExclusionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeReplayName || availableConsistencyLaps.length === 0) return;
    const key = `${activeReplayName}|${selectedDriverSlot ?? 'x'}`;
    if (initializedExclusionKeyRef.current === key) return;
    initializedExclusionKeyRef.current = key;
    const invalidLapNumbers = availableConsistencyLaps.filter(l => !l.isValid).map(l => l.lapNumber);
    setExcludedConsistencyLaps(new Set(invalidLapNumbers));
  }, [activeReplayName, selectedDriverSlot, availableConsistencyLaps]);

  const bestSectors = useMemo(() => {
    let s1: number | null = null;
    let s2: number | null = null;
    let s3: number | null = null;
    (trajectory?.laps || []).forEach(l => {
      if (l.isValid === false) return;
      if (l.s1Sec && (s1 === null || l.s1Sec < s1)) s1 = l.s1Sec;
      if (l.s2Sec && (s2 === null || l.s2Sec < s2)) s2 = l.s2Sec;
      if (l.s3Sec && (s3 === null || l.s3Sec < s3)) s3 = l.s3Sec;
    });
    return { s1, s2, s3 };
  }, [trajectory]);

  const primaryDists = useMemo(() => computeCumulativeDistances(trajectory?.points || []), [trajectory]);

  useEffect(() => {
    setSelectedCornerNumber(null);
  }, [trajectory, baselineTrajectory]);

  const selectedCorner = useMemo(
    () => cornerSegments.find(s => s.cornerNumber === selectedCornerNumber) || null,
    [cornerSegments, selectedCornerNumber]
  );

  const selectedCornerMarkers = useMemo(() => {
    if (!selectedCorner || primaryDists.length === 0) return null;
    return {
      cornerNumber: selectedCorner.cornerNumber,
      entryFrame: findIndexAtDistance(primaryDists, selectedCorner.entryDistM),
      minFrame: findIndexAtDistance(primaryDists, selectedCorner.minDistM),
      exitFrame: findIndexAtDistance(primaryDists, selectedCorner.exitDistM),
    };
  }, [selectedCorner, primaryDists]);

  const handleSelectCorner = (cornerNumber: number | null) => {
    setSelectedCornerNumber(prev => (cornerNumber !== null && prev === cornerNumber ? null : cornerNumber));
  };

  const formatLapTime = (sec?: number | null): string => formatTime(sec);

  if (!isOpen) return null;

  return (
    <ReplayInspectorModalBody
      onClose={onClose}
      activeReplayName={activeReplayName}
      replayName={replayName}
      metadata={metadata}
      trajectory={trajectory}
      currentIndex={currentIndex}
      baselineTrajectory={baselineTrajectory}
      selectedDriverSlot={selectedDriverSlot}
      isLoading={isLoading}
      isTrajLoading={isTrajLoading}
      error={error}
      isCompareMode={isCompareMode}
      handleToggleCompare={handleToggleCompare}
      baselineReplayName={baselineReplayName}
      baselineLapNumber={baselineLapNumber}
      baselineDriverName={baselineDriverName}
      isComparePickerOpen={isComparePickerOpen}
      handleCloseComparePicker={handleCloseComparePicker}
      availableCompareLaps={availableCompareLaps}
      compareLapFilter={compareLapFilter}
      isCompareLapsLoading={isCompareLapsLoading}
      setCompareLapFilter={setCompareLapFilter}
      handleSelectCompareLap={handleSelectCompareLap}
      isBaselineLoading={isBaselineLoading}
      setCurrentIndex={setCurrentIndex}
      isPlaying={isPlaying}
      setIsPlaying={setIsPlaying}
      playbackSpeed={playbackSpeed}
      setPlaybackSpeed={setPlaybackSpeed}
      chartZoomRange={chartZoomRange}
      setChartZoomRange={setChartZoomRange}
      telemetryResolution={telemetryResolution}
      handleChangeResolution={handleChangeResolution}
      handleSelectDriver={handleSelectDriver}
      handleSelectLap={handleSelectLap}
      maxSpeed={maxSpeed}
      currentPoint={currentPoint}
      currentLapSummary={currentLapSummary}
      lapDeltas={lapDeltas}
      handleSwapBaseline={handleSwapBaseline}
      handleRemoveCompare={handleRemoveCompare}
      handleSelectBaselineLap={handleSelectBaselineLap}
      formatLapTime={formatLapTime}
      bestSectors={bestSectors}
      lapSegments={lapSegments}
      cornerSegments={cornerSegments}
      cornerCount={cornerCount}
      isSelfAnalysis={isSelfAnalysis}
      consistencyStats={consistencyStats}
      cornerConsistencyStats={cornerConsistencyStats}
      isCornerConsistencyLoading={isCornerConsistencyLoading}
      availableConsistencyLaps={availableConsistencyLaps}
      excludedConsistencyLaps={excludedConsistencyLaps}
      toggleConsistencyLap={toggleConsistencyLap}
      selectedCornerNumber={selectedCornerNumber}
      handleSelectCorner={handleSelectCorner}
      selectedCornerMarkers={selectedCornerMarkers}
      primaryDists={primaryDists}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      cornerSubView={cornerSubView}
      setCornerSubView={setCornerSubView}
      colorBy={colorBy}
      setColorBy={setColorBy}
      mapViewMode={mapViewMode}
      setMapViewMode={setMapViewMode}
      drivers={metadata?.drivers || []}
    />
  );
};
