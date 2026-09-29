import React from 'react';
import { ReplayDriverEntry, ReplayLapSummary, ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint, ComparableLap } from '../../../../shared/types/index.js';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import type { LapConsistencyOption } from '../analysis/LapSelectorDropdown.js';
import { CompareLapFilter } from './ReplayCompareLapPicker.js';
import { ReplayInspectorHeader } from './ReplayInspectorHeader.js';
import { ReplayInspectorTelemetryColumn } from './ReplayInspectorTelemetryColumn.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayInspectorSidebar } from './ReplayInspectorSidebar.js';
import { TelemetryResolution } from '../telemetry/telemetryResolution.js';

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
  compareLapFilter: CompareLapFilter;
  isCompareLapsLoading: boolean;
  setCompareLapFilter: (filter: CompareLapFilter) => void;
  handleSelectCompareLap: (lap: ComparableLap) => void;
  isBaselineLoading: boolean;
  baselineError?: string | null;
  setCurrentIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  chartZoomRange: { start: number; end: number } | null;
  setChartZoomRange: (range: { start: number; end: number } | null) => void;
  telemetryResolution: TelemetryResolution;
  handleChangeResolution: (res: TelemetryResolution) => void;
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
  availableConsistencyLaps: LapConsistencyOption[];
  excludedConsistencyLaps: Set<number>;
  toggleConsistencyLap: (lapNumber: number) => void;
  selectedCornerNumber: number | null;
  handleSelectCorner: (cornerNumber: number | null) => void;
  selectedCornerMarkers: { cornerNumber: number; entryFrame: number; minFrame: number; exitFrame: number } | null;
  primaryDists: number[];
  activeTab: 'map' | 'corners' | 'ai-report';
  setActiveTab: (tab: 'map' | 'corners' | 'ai-report') => void;
  cornerSubView: 'compare' | 'consistency';
  setCornerSubView: (view: 'compare' | 'consistency') => void;
  colorBy: MapColorMode;
  setColorBy: (mode: MapColorMode) => void;
  drivers: ReplayDriverEntry[];
  hasDuckDbTelemetry?: boolean;
  duckdbUnavailableReason?: string;
  selectedSource?: 'duckdb' | 'vcr';
  onSelectSource?: (source: 'duckdb' | 'vcr') => void;
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
  isBaselineLoading,
  baselineError,
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
  drivers,
  hasDuckDbTelemetry,
  duckdbUnavailableReason,
  onSelectSource,
}) => {
  return (
    <main className="h-dvh min-h-0 flex flex-col bg-lmu-dark text-white w-full overflow-hidden select-none overscroll-none animate-fadeIn">
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
        baselineError={baselineError}
        isStationary={maxSpeed <= 1}
        isTrajLoading={isTrajLoading}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onRewind={() => { setIsPlaying(false); setCurrentIndex(0); }}
        playbackSpeed={playbackSpeed}
        onSelectPlaybackSpeed={setPlaybackSpeed}
        formatLapTime={formatLapTime}
      />

      {error && (
        <div role="alert" className="px-4 py-1.5 text-xs text-rose-300 bg-rose-950/40 border-b border-rose-900/60">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        <ReplayInspectorTelemetryColumn
          trajectory={trajectory}
          baselineTrajectory={baselineTrajectory}
          isCompareMode={isCompareMode}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          isLoading={isLoading || isTrajLoading}
          currentLapSummary={currentLapSummary}
          bestSectors={bestSectors}
          lapDeltas={lapDeltas}
          formatLapTime={formatLapTime}
          chartZoomRange={chartZoomRange}
          setChartZoomRange={setChartZoomRange}
          telemetryResolution={telemetryResolution}
          handleChangeResolution={handleChangeResolution}
          selectedCornerMarkers={selectedCornerMarkers}
          cornerSegments={cornerSegments}
          lapSegments={lapSegments}
          selectedCornerNumber={selectedCornerNumber}
          handleSelectCorner={handleSelectCorner}
          hasDuckDbTelemetry={hasDuckDbTelemetry}
          duckdbUnavailableReason={duckdbUnavailableReason}
          onSelectSource={onSelectSource}
        />

        <ReplayInspectorSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cornerCount={cornerCount}
          colorBy={colorBy}
          setColorBy={setColorBy}
          isCompareMode={isCompareMode}
          baselineTrajectory={baselineTrajectory}
          cornerSubView={cornerSubView}
          setCornerSubView={setCornerSubView}
          trajectory={trajectory}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          currentPoint={currentPoint}
          cornerSegments={cornerSegments}
          selectedCornerNumber={selectedCornerNumber}
          handleSelectCorner={handleSelectCorner}
          baselineLapNumber={baselineLapNumber}
          lapSegments={lapSegments}
          currentLapSummary={currentLapSummary}
          drivers={drivers}
          selectedDriverSlot={selectedDriverSlot}
          isSelfAnalysis={isSelfAnalysis}
          consistencyStats={consistencyStats}
          cornerConsistencyStats={cornerConsistencyStats}
          isCornerConsistencyLoading={isCornerConsistencyLoading}
          handleSelectBaselineLap={handleSelectBaselineLap}
          formatLapTime={formatLapTime}
          availableConsistencyLaps={availableConsistencyLaps}
          excludedConsistencyLaps={excludedConsistencyLaps}
          toggleConsistencyLap={toggleConsistencyLap}
          trackVenue={metadata?.trackVenue}
          trackCourse={metadata?.trackCourse}
        />
      </div>
    </main>
  );
};
