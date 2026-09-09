import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Timer, Activity } from 'lucide-react';
import { TelemetryStripCharts } from './TelemetryStripCharts.js';
import { ReplayInspectorHeader } from './ReplayInspectorHeader.js';
import { ReplayPerformanceHeader } from './ReplayPerformanceHeader.js';
import { ReplayMapContainer } from './ReplayMapContainer.js';
import { CornerSpeedTable } from './CornerSpeedTable.js';
import { ConsistencyPanel } from './ConsistencyPanel.js';
import { useReplayInspectorData } from './useReplayInspectorData.js';
import { useCornerConsistency } from './useCornerConsistency.js';
import { MapColorMode } from './replayMapUtils.js';
import { computeCumulativeDistances, findIndexAtDistance } from '../../utils/replayComparison.js';
import { computeLapSegmentComparisons, filterCornerConsistencyStats } from '../../utils/cornerAnalysis.js';
import { computeLapConsistencyStats } from '../../utils/lapConsistency.js';

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

  const [activeTab, setActiveTab] = useState<'map' | 'corners'>('map');
  const [cornerSubView, setCornerSubView] = useState<'compare' | 'consistency'>('compare');
  const [colorBy, setColorBy] = useState<MapColorMode>('speed');
  const [mapViewMode, setMapViewMode] = useState<'dual' | 'overview' | 'zoom'>('dual');
  const [selectedCornerNumber, setSelectedCornerNumber] = useState<number | null>(null);
  // Laps toggled off by the driver (outliers - spins, traffic, etc.) via the Consistency tab's
  // lap selector, excluded from both the sector-level and per-corner consistency stats.
  const [excludedConsistencyLaps, setExcludedConsistencyLaps] = useState<Set<number>>(new Set());
  const toggleConsistencyLap = (lapNumber: number) => {
    setExcludedConsistencyLaps(prev => {
      const next = new Set(prev);
      if (next.has(lapNumber)) next.delete(lapNumber);
      else next.add(lapNumber);
      return next;
    });
  };

  // Delta heatmap requires a baseline lap; fall back to speed if compare mode is turned off.
  useEffect(() => {
    if (colorBy === 'delta' && (!isCompareMode || !baselineTrajectory)) {
      setColorBy('speed');
    }
  }, [colorBy, isCompareMode, baselineTrajectory]);

  const lapSegments = useMemo(() => {
    if (!trajectory) return [];
    // With no baseline lap loaded, self-compare the lap against itself so corner speeds,
    // braking/throttle points, and segment lengths are still available (deltas read as zero).
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

  // Recomputed from the already-sampled per-lap values, so excluding an outlier lap doesn't
  // require re-fetching or re-timing any telemetry.
  const cornerConsistencyStats = useMemo(
    () => filterCornerConsistencyStats(rawCornerConsistencyStats, excludedConsistencyLaps),
    [rawCornerConsistencyStats, excludedConsistencyLaps]
  );

  // Every lap this replay/driver has (valid or not), offered in the lap selector so the driver
  // can see and override which laps feed the consistency stats - invalid/outlap laps are
  // pre-excluded by default (see the initialization effect below) but stay toggleable.
  // Sourced from trajectory.laps first, same as computeLapConsistencyStats above, so the
  // selector and the sector-consistency stats always agree on what "valid" means for a lap.
  const availableConsistencyLaps = useMemo(() => {
    const laps = (trajectory?.laps || metadata?.laps || []).filter(l => l.lapTimeSec > 0);
    return laps
      .map(l => ({ lapNumber: l.lapNumber, lapTimeSec: l.lapTimeSec, isValid: l.isValid !== false && !l.isOutlap }))
      .sort((a, b) => a.lapNumber - b.lapNumber);
  }, [metadata, trajectory]);

  // Pre-excludes invalid/outlap laps the first time this replay/driver's lap list becomes
  // available, without clobbering the driver's own toggles on subsequent renders (e.g. just
  // switching which lap is currently displayed).
  const initializedExclusionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeReplayName || availableConsistencyLaps.length === 0) return;
    const key = `${activeReplayName}|${selectedDriverSlot ?? 'x'}`;
    if (initializedExclusionKeyRef.current === key) return;
    initializedExclusionKeyRef.current = key;
    const invalidLapNumbers = availableConsistencyLaps.filter(l => !l.isValid).map(l => l.lapNumber);
    setExcludedConsistencyLaps(new Set(invalidLapNumbers));
  }, [activeReplayName, selectedDriverSlot, availableConsistencyLaps]);

  // Best sector times across this replay's own laps, used to highlight the current lap's
  // best sectors the same way the rest of the site marks S1/S2/S3 personal bests.
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

  // Clear the selected corner whenever a different lap/replay is loaded so a stale selection
  // never points at a corner that no longer exists in the new lap's segment list.
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

  // Clicking the already-selected corner (in the table or on the map) deselects it.
  const handleSelectCorner = (cornerNumber: number | null) => {
    setSelectedCornerNumber(prev => (cornerNumber !== null && prev === cornerNumber ? null : cornerNumber));
  };

  const formatLapTime = (sec?: number | null): string => {
    if (!sec || isNaN(sec) || sec <= 0) return '--:--.---';
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(3);
    return `${mins}:${parseFloat(rem) < 10 ? `0${rem}` : rem}`;
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-[#07090e] text-white w-screen h-screen overflow-hidden select-none overscroll-none animate-fadeIn"
    >
      <ReplayInspectorHeader
        onClose={onClose}
        replayName={activeReplayName || replayName}
        metadata={metadata}
        trajectory={trajectory}
        onSelectLap={handleSelectLap}
        drivers={metadata?.drivers || []}
        selectedDriverSlot={selectedDriverSlot}
        onSelectDriver={handleSelectDriver}
        isCompareMode={isCompareMode}
        onToggleCompare={handleToggleCompare}
        onSwapBaseline={handleSwapBaseline}
        onRemoveCompare={handleRemoveCompare}
        baselineReplayName={baselineReplayName}
        baselineLapNumber={baselineLapNumber}
        baselineDriverName={baselineDriverName}
        baselineTrajectory={baselineTrajectory}
        isComparePickerOpen={isComparePickerOpen}
        onCloseComparePicker={handleCloseComparePicker}
        availableCompareLaps={availableCompareLaps}
        compareLapFilter={compareLapFilter}
        isCompareLapsLoading={isCompareLapsLoading}
        onChangeCompareLapFilter={setCompareLapFilter}
        onSelectCompareLap={handleSelectCompareLap}
        isBaselineLoading={isBaselineLoading}
        isStationary={maxSpeed <= 1}
        isTrajLoading={isTrajLoading}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onRewind={() => { setIsPlaying(false); setCurrentIndex(0); }}
        playbackSpeed={playbackSpeed}
        onSelectPlaybackSpeed={setPlaybackSpeed}
        formatLapTime={formatLapTime}
      />

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <div className="inline-block w-8 h-8 border-4 border-lmu-accent/20 border-t-lmu-accent rounded-full animate-spin" />
            <div className="text-sm font-semibold text-lmu-muted">Decoding binary replay stream & vehicle telemetry...</div>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm max-w-md">{error}</div>
          </div>
        )}

        {!isLoading && !error && trajectory && (
          <>
            {/* LEFT COLUMN: Stacked Telemetry Traces */}
            <div className="flex-1 min-w-0 flex flex-col bg-[#06080d] p-3 sm:p-4 gap-2.5 min-h-0 overflow-hidden border-r border-lmu-border">
              <div className="flex-1 min-h-0 w-full">
                <TelemetryStripCharts
                  points={trajectory.points}
                  currentIndex={currentIndex}
                  onSelectIndex={setCurrentIndex}
                  sectors={trajectory.sectors}
                  className="w-full h-full"
                  headerContent={
                    <ReplayPerformanceHeader
                      currentLap={trajectory.currentLap ?? 1}
                      currentLapSummary={currentLapSummary}
                      bestS1Sec={bestSectors.s1}
                      bestS2Sec={bestSectors.s2}
                      bestS3Sec={bestSectors.s3}
                      isCompareMode={isCompareMode}
                      baselineTrajectory={baselineTrajectory}
                      baselineReplayName={baselineReplayName}
                      replayName={replayName}
                      baselineLapNumber={baselineLapNumber}
                      lapDeltas={lapDeltas}
                      formatLapTime={formatLapTime}
                    />
                  }
                  baselinePoints={isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined}
                  baselineLabel={
                    isCompareMode && baselineTrajectory
                      ? baselineReplayName === replayName
                        ? `Lap ${baselineTrajectory.currentLap ?? baselineLapNumber ?? 1}`
                        : `${baselineReplayName} (L${baselineTrajectory.currentLap ?? baselineLapNumber ?? 1})`
                      : undefined
                  }
                  baselineLapNumber={baselineTrajectory?.currentLap ?? baselineLapNumber ?? undefined}
                  zoomRange={chartZoomRange}
                  onZoomRangeChange={setChartZoomRange}
                  telemetryResolution={telemetryResolution}
                  onChangeResolution={handleChangeResolution}
                  rawPointsCount={trajectory.rawPointsCount}
                  rawSampleRateHz={trajectory.rawSampleRateHz}
                  isFullResolution={trajectory.isFullResolution}
                  selectedCornerMarkers={selectedCornerMarkers}
                />
              </div>

            </div>

            {/* RIGHT COLUMN: Track Map & Corner Analysis */}
            <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 bg-[#0a0e17] flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-lmu-dark border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      activeTab === 'map' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    GPS Map
                  </button>
                  <button
                    onClick={() => setActiveTab('corners')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      activeTab === 'corners' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
                    }`}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    Corners ({cornerCount})
                  </button>
                </div>

                {activeTab === 'map' && (
                  <div className="flex items-center gap-1 text-xs">
                    {(['speed', 'pedal', ...(isCompareMode && baselineTrajectory ? (['delta'] as const) : [])] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setColorBy(mode)}
                        title={`Heatmap: ${mode}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                          colorBy === mode ? 'bg-lmu-card border border-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
                        }`}
                      >
                        {mode.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}

                {activeTab === 'corners' && (
                  <div className="flex items-center gap-1 bg-lmu-dark p-1 rounded-lg border border-lmu-border/60">
                    <button
                      onClick={() => setCornerSubView('compare')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        cornerSubView === 'compare' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
                      }`}
                    >
                      <Timer className="w-3 h-3" />
                      vs Baseline
                    </button>
                    <button
                      onClick={() => setCornerSubView('consistency')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        cornerSubView === 'consistency' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
                      }`}
                    >
                      <Activity className="w-3 h-3" />
                      Consistency
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'map' ? (
                <div className="flex-1 flex flex-col min-h-0 h-full p-3 gap-2.5 overflow-hidden">
                  <ReplayMapContainer
                    trajectory={trajectory}
                    currentIndex={currentIndex}
                    onSelectIndex={setCurrentIndex}
                    colorBy={colorBy}
                    mapViewMode={mapViewMode}
                    onChangeMapViewMode={setMapViewMode}
                    isCompareMode={isCompareMode}
                    baselineTrajectory={baselineTrajectory}
                    currentPoint={currentPoint}
                    corners={cornerSegments}
                    selectedCornerNumber={selectedCornerNumber}
                    onSelectCornerNumber={handleSelectCorner}
                  />
                </div>
              ) : activeTab === 'corners' && cornerSubView === 'compare' ? (
                <CornerSpeedTable
                  segments={lapSegments}
                  selfAnalysis={isSelfAnalysis}
                  primaryLabel={
                    isSelfAnalysis
                      ? `Lap ${trajectory.currentLap ?? 1}`
                      : `Lap ${trajectory.currentLap ?? 1}`
                  }
                  baselineLabel={
                    `Lap ${baselineTrajectory?.currentLap ?? baselineLapNumber ?? 1}`
                  }
                  onSelectDistance={distM => setCurrentIndex(findIndexAtDistance(primaryDists, distM))}
                  selectedCornerNumber={selectedCornerNumber}
                  onSelectCorner={handleSelectCorner}
                  className="flex-1 min-h-0"
                />
              ) : (
                <ConsistencyPanel
                  stats={consistencyStats}
                  cornerStats={cornerConsistencyStats}
                  isLoadingCornerStats={isCornerConsistencyLoading}
                  onSelectCorner={handleSelectCorner}
                  onSelectBaselineLap={handleSelectBaselineLap}
                  formatLapTime={formatLapTime}
                  trackPoints={trajectory.points}
                  trackBounds={trajectory.bounds}
                  availableLaps={availableConsistencyLaps}
                  excludedLaps={excludedConsistencyLaps}
                  onToggleLapExclusion={toggleConsistencyLap}
                  currentLapNumber={trajectory.currentLap}
                  className="flex-1 min-h-0"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
