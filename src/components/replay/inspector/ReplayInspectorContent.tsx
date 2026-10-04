import {hasCompatibleTrackStations} from '../../../../shared/domain/trackGeometry.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplayInspectorData } from './useReplayInspectorData.js';
import { ReplayPlaybackCursorContext } from './replayPlaybackCursor.js';
import { useCornerConsistency } from '../analysis/useCornerConsistency.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { getTrajectoryDistances, findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis/index.js';
import { filterCornerConsistencyStats } from '../../../utils/cornerConsistency.js';
import { computeLapConsistencyStats } from '../../../utils/lapConsistency.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { ReplayInspectorModalBody } from './ReplayInspectorModalBody.js';
import { useConsistencyLapSelection } from './useConsistencyLapSelection.js';

export interface ReplayInspectorContentProps {
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
  /** A corner to open on the Corners tab once the lap (and its comparison lap) are loaded. */
  initialCornerNumber?: number | null;
}

export const ReplayInspectorContent: React.FC<ReplayInspectorContentProps> = ({
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
  initialCornerNumber,
}) => {
  const {
    metadata,
    trajectory,
    selectedDriverSlot,
    isLoading,
    isTrajLoading,
    error,
    handleRetryLoad, compareLapsError, handleRetryCompareLaps, handleRetryBaseline,
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
    baselineError,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    playbackCursor,
    setPlaybackSpeed,
    chartZoomRange,
    setChartZoomRange,
    telemetryResolution,
    handleChangeResolution,
    handleSelectDriver,
    handleSelectLap,
    currentPoint,
    currentLapSummary,
    lapDeltas,
    handleSwapBaseline,
    handleRemoveCompare,
    activeReplayName,
    handleSelectBaselineLap,
    selectedSource,
    handleSelectSource,
    hasDuckDbTelemetry,
    duckdbUnavailableReason,
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
  const [colorBy, setColorBy] = useState<MapColorMode>('pedal');
  const [selectedCornerNumber, setSelectedCornerNumber] = useState<number | null>(null);
  const { availableConsistencyLaps, excludedConsistencyLaps, toggleConsistencyLap } =
    useConsistencyLapSelection(trajectory, metadata, activeReplayName, selectedDriverSlot);
  // A corner asked for in the URL (the session debrief links to one) opens once the laps it
  // belongs to are loaded; corner numbers come from the lap and its comparison.
  const pendingCornerRef = useRef<number | null>(initialCornerNumber ?? null);

  useEffect(() => {
    if (colorBy === 'delta' && (!isCompareMode || !baselineTrajectory)) {
      setColorBy('speed');
    }
  }, [colorBy, isCompareMode, baselineTrajectory]);

  const lapSegments = useMemo(() => {
    if (!trajectory || !hasCompatibleTrackStations(trajectory, isCompareMode && baselineTrajectory ? baselineTrajectory : trajectory)) return [];
    const baseline = isCompareMode && baselineTrajectory ? baselineTrajectory.points : trajectory.points;
    const spec = trajectory.layoutKey ? getCircuitSpecification(trajectory.layoutKey) : undefined;
    return computeLapSegmentComparisons(trajectory.points, baseline, 6, trajectory.trackLengthM, spec?.nominalWidthM);
  }, [isCompareMode, trajectory, baselineTrajectory]);

  const cornerSegments = useMemo(() => lapSegments.filter(s => s.type === 'corner'), [lapSegments]);
  const cornerCount = cornerSegments.length;
  const isSelfAnalysis = !isCompareMode || !baselineTrajectory;

  const consistencyStats = useMemo(
    () => computeLapConsistencyStats((trajectory?.laps || []).filter(l => !excludedConsistencyLaps.has(l.lapNumber))),
    [trajectory, excludedConsistencyLaps]
  );

  const { cornerStats: rawCornerConsistencyStats, isLoading: isCornerConsistencyLoading } =
    useCornerConsistency(
      (activeTab === 'corners' && cornerSubView === 'consistency') || (activeTab === 'ai-report' && isCompareMode),
      activeReplayName, metadata, selectedDriverSlot, trajectory
    );

  const cornerConsistencyStats = useMemo(
    () => filterCornerConsistencyStats(rawCornerConsistencyStats, excludedConsistencyLaps),
    [rawCornerConsistencyStats, excludedConsistencyLaps]
  );

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

  const primaryDists = useMemo(
    () => (trajectory?.points ? getTrajectoryDistances(trajectory.points, trajectory.trackLengthM) : []),
    [trajectory]
  );

  useEffect(() => {
    setSelectedCornerNumber(null);
  }, [trajectory, baselineTrajectory]);

  useEffect(() => {
    const pending = pendingCornerRef.current;
    if (pending === null || (initialCompareMode && !baselineTrajectory)) return;
    if (!cornerSegments.some(s => s.cornerNumber === pending)) return;
    pendingCornerRef.current = null;
    setActiveTab('corners');
    setSelectedCornerNumber(pending);
  }, [cornerSegments, baselineTrajectory, initialCompareMode]);

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

  const handleSelectCorner = useCallback((cornerNumber: number | null) => {
    setSelectedCornerNumber(prev => (cornerNumber !== null && prev === cornerNumber ? null : cornerNumber));
  }, []);

  const formatLapTime = (sec?: number | null): string => formatTime(sec);

  if (!isOpen) return null;

  return (
    <ReplayPlaybackCursorContext.Provider value={playbackCursor}>
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
      handleRetryLoad={handleRetryLoad}
      compareLapsError={compareLapsError}
      handleRetryCompareLaps={handleRetryCompareLaps}
      handleRetryBaseline={handleRetryBaseline}
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
      baselineError={baselineError}
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
      drivers={metadata?.drivers || []}
      hasDuckDbTelemetry={hasDuckDbTelemetry}
      duckdbUnavailableReason={duckdbUnavailableReason}
      selectedSource={selectedSource}
      onSelectSource={handleSelectSource}
    />
    </ReplayPlaybackCursorContext.Provider>
  );
};

/** @deprecated Use ReplayInspectorPage through the /telemetry route. */
export const ReplayInspectorModal: React.FC<ReplayInspectorContentProps> = (props) => (
  props.isOpen ? (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <ReplayInspectorContent {...props} />
    </div>
  ) : null
);
