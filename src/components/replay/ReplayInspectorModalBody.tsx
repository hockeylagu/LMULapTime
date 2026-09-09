import React from 'react';
import { Activity, Gauge, Timer } from 'lucide-react';
import { ReplayDriverEntry, ReplayLapSummary, ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../server/types.js';
import { ComparableLap } from '../../utils/lapComparison.js';
import { CornerConsistencyStat, CornerSegmentComparison, LapSegmentComparison } from '../../utils/cornerAnalysis.js';
import { LapConsistencyStats } from '../../utils/lapConsistency.js';
import { ReplayInspectorHeader } from './ReplayInspectorHeader.js';
import { ReplayPerformanceHeader } from './ReplayPerformanceHeader.js';
import { ReplayMapContainer } from './ReplayMapContainer.js';
import { CornerSpeedTable } from './CornerSpeedTable.js';
import { ConsistencyPanel } from './ConsistencyPanel.js';
import { TelemetryStripCharts } from './TelemetryStripCharts.js';
import { MapColorMode } from './replayMapUtils.js';

export interface ReplayInspectorModalBodyProps {
  onClose: () => void;
  activeReplayName: string | null;
  replayName: string | null;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
  currentIndex: number;
  baselineTrajectory: ReplayTrajectoryData | null | undefined;
  selectedDriverSlot: number | null;
  isLoading: boolean;
  isTrajLoading: boolean;
  error: string | null;
  isCompareMode: boolean;
  handleToggleCompare: () => void;
  baselineReplayName: string | null;
  baselineLapNumber: number | null;
  baselineDriverName: string | null;
  isComparePickerOpen: boolean;
  handleCloseComparePicker: () => void;
  availableCompareLaps: ComparableLap[];
  compareLapFilter: 'player' | 'all';
  isCompareLapsLoading: boolean;
  setCompareLapFilter: (filter: 'player' | 'all') => void;
  handleSelectCompareLap: (lap: ComparableLap) => void;
  isBaselineLoading: boolean;
  setCurrentIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  chartZoomRange: { start: number; end: number } | null;
  setChartZoomRange: (range: { start: number; end: number } | null) => void;
  telemetryResolution: number;
  handleChangeResolution: (res: number) => void;
  handleSelectDriver: (slot: number) => void;
  handleSelectLap: (lapNum: number) => void;
  maxSpeed: number;
  currentPoint: ReplayTrajectoryPoint | undefined;
  currentLapSummary: ReplayLapSummary | null | undefined;
  lapDeltas: { lapDelta: number | null; s1Delta: number | null; s2Delta: number | null; s3Delta: number | null } | null;
  handleSwapBaseline: () => void;
  handleRemoveCompare: () => void;
  handleSelectBaselineLap: (lapNumber: number) => void;
  formatLapTime: (sec?: number | null) => string;
  bestSectors: { s1: number | null; s2: number | null; s3: number | null };
  lapSegments: LapSegmentComparison[];
  cornerSegments: CornerSegmentComparison[];
  cornerCount: number;
  isSelfAnalysis: boolean;
  consistencyStats: LapConsistencyStats;
  cornerConsistencyStats: CornerConsistencyStat[];
  isCornerConsistencyLoading: boolean;
  availableConsistencyLaps: { lapNumber: number; lapTimeSec: number; isValid: boolean }[];
  excludedConsistencyLaps: Set<number>;
  toggleConsistencyLap: (lapNumber: number) => void;
  selectedCornerNumber: number | null;
  handleSelectCorner: (cornerNumber: number | null) => void;
  selectedCornerMarkers: { cornerNumber: number; entryFrame: number; minFrame: number; exitFrame: number } | null;
  primaryDists: number[];
  activeTab: 'map' | 'corners';
  setActiveTab: (tab: 'map' | 'corners') => void;
  cornerSubView: 'compare' | 'consistency';
  setCornerSubView: (view: 'compare' | 'consistency') => void;
  colorBy: MapColorMode;
  setColorBy: (mode: MapColorMode) => void;
  mapViewMode: 'dual' | 'overview' | 'zoom';
  setMapViewMode: (mode: 'dual' | 'overview' | 'zoom') => void;
  drivers: ReplayDriverEntry[];
}

export const ReplayInspectorModalBody: React.FC<ReplayInspectorModalBodyProps> = ({
  onClose,
  activeReplayName,
  replayName,
  metadata,
  trajectory,
  currentIndex,
  baselineTrajectory,
  selectedDriverSlot,
  isTrajLoading,
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
  isBaselineLoading,
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
  handleSelectBaselineLap,
  formatLapTime,
  bestSectors,
  lapSegments,
  cornerSegments,
  cornerCount,
  isSelfAnalysis,
  consistencyStats,
  cornerConsistencyStats,
  isCornerConsistencyLoading,
  availableConsistencyLaps,
  excludedConsistencyLaps,
  toggleConsistencyLap,
  selectedCornerNumber,
  handleSelectCorner,
  selectedCornerMarkers,
  activeTab,
  setActiveTab,
  cornerSubView,
  setCornerSubView,
  colorBy,
  setColorBy,
  mapViewMode,
  setMapViewMode,
  drivers,
}) => {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-[#07090e] text-white w-screen h-screen overflow-hidden select-none overscroll-none animate-fadeIn">
      <ReplayInspectorHeader
        onClose={onClose}
        replayName={activeReplayName || replayName}
        metadata={metadata}
        trajectory={trajectory}
        onSelectLap={handleSelectLap}
        drivers={drivers}
        selectedDriverSlot={selectedDriverSlot}
        onSelectDriver={handleSelectDriver}
        isCompareMode={isCompareMode}
        onToggleCompare={handleToggleCompare}
        onSwapBaseline={handleSwapBaseline}
        onRemoveCompare={handleRemoveCompare}
        baselineReplayName={baselineReplayName}
        baselineLapNumber={baselineLapNumber}
        baselineDriverName={baselineDriverName}
        baselineTrajectory={baselineTrajectory ?? null}
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
        <div className="flex-1 min-w-0 flex flex-col bg-[#06080d] p-3 sm:p-4 gap-2.5 min-h-0 overflow-hidden border-r border-lmu-border">
          <div className="flex-1 min-h-0 w-full">
            <TelemetryStripCharts
              points={trajectory?.points || []}
              currentIndex={currentIndex}
              onSelectIndex={setCurrentIndex}
              sectors={trajectory?.sectors}
              className="w-full h-full"
              headerContent={
                <ReplayPerformanceHeader
                  currentLap={trajectory?.currentLap ?? 1}
                  currentLapSummary={currentLapSummary}
                  bestS1Sec={bestSectors.s1}
                  bestS2Sec={bestSectors.s2}
                  bestS3Sec={bestSectors.s3}
                  isCompareMode={isCompareMode}
                  baselineTrajectory={baselineTrajectory ?? null}
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
              rawPointsCount={trajectory?.rawPointsCount}
              rawSampleRateHz={trajectory?.rawSampleRateHz}
              isFullResolution={trajectory?.isFullResolution}
              selectedCornerMarkers={selectedCornerMarkers}
            />
          </div>
        </div>

        <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 bg-[#0a0e17] flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 bg-lmu-dark border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setActiveTab('map')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${activeTab === 'map' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'}`}>
                <Gauge className="w-3.5 h-3.5" /> GPS Map
              </button>
              <button onClick={() => setActiveTab('corners')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${activeTab === 'corners' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'}`}>
                <Timer className="w-3.5 h-3.5" /> Corners ({cornerCount})
              </button>
            </div>

            {activeTab === 'map' && (
              <div className="flex items-center gap-1 text-xs">
                {(['speed', 'pedal', ...(isCompareMode && baselineTrajectory ? (['delta'] as const) : [])] as const).map(mode => (
                  <button key={mode} onClick={() => setColorBy(mode)} title={`Heatmap: ${mode}`} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${colorBy === mode ? 'bg-lmu-card border border-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'}`}>
                    {mode.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'corners' && (
              <div className="flex items-center gap-1 bg-lmu-dark p-1 rounded-lg border border-lmu-border/60">
                <button onClick={() => setCornerSubView('compare')} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${cornerSubView === 'compare' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'}`}>
                  <Timer className="w-3 h-3" /> vs Baseline
                </button>
                <button onClick={() => setCornerSubView('consistency')} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${cornerSubView === 'consistency' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'}`}>
                  <Activity className="w-3 h-3" /> Consistency
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
              primaryLabel={isSelfAnalysis ? `Lap ${trajectory?.currentLap ?? 1}` : `Lap ${trajectory?.currentLap ?? 1}`}
              baselineLabel={`Lap ${baselineTrajectory?.currentLap ?? baselineLapNumber ?? 1}`}
              onSelectDistance={distM => setCurrentIndex(Math.max(0, distM))}
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
              trackPoints={trajectory?.points}
              trackBounds={trajectory?.bounds}
              availableLaps={availableConsistencyLaps}
              excludedLaps={excludedConsistencyLaps}
              onToggleLapExclusion={toggleConsistencyLap}
              currentLapNumber={trajectory?.currentLap}
              className="flex-1 min-h-0"
            />
          )}
        </div>
      </div>
    </div>
  );
};
