import React, { useMemo } from 'react';
import { ReplayDriverEntry, ReplayLapSummary, ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../server/types.js';
import { ComparableLap } from '../../../utils/lapComparison.js';
import { CornerConsistencyStat, CornerSegmentComparison, LapSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import { ReplayInspectorHeader } from './ReplayInspectorHeader.js';
import { ReplayPerformanceHeader } from './ReplayPerformanceHeader.js';
import { TelemetryStripCharts } from '../telemetry/TelemetryStripCharts.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayInspectorSidebar } from './ReplayInspectorSidebar.js';

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
  activeTab: 'map' | 'corners' | 'ai-report';
  setActiveTab: (tab: 'map' | 'corners' | 'ai-report') => void;
  cornerSubView: 'compare' | 'consistency';
  setCornerSubView: (view: 'compare' | 'consistency') => void;
  colorBy: MapColorMode;
  setColorBy: (mode: MapColorMode) => void;
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
  isLoading,
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
  drivers,
}) => {
  const initialStraight = useMemo(() => {
    const first = lapSegments.find(s => s.type === 'straight' && s.entryDistM <= 50);
    return first && first.lengthM >= 30 ? (first as StraightSegmentComparison) : null;
  }, [lapSegments]);

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
              isLoading={isLoading || isTrajLoading}
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
                  lapDeltas={lapDeltas}
                  formatLapTime={formatLapTime}
                />
              }
              baselinePoints={isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined}
              zoomRange={chartZoomRange}
              onZoomRangeChange={setChartZoomRange}
              telemetryResolution={telemetryResolution}
              onChangeResolution={handleChangeResolution}
              rawPointsCount={trajectory?.rawPointsCount}
              rawSampleRateHz={trajectory?.rawSampleRateHz}
              isFullResolution={trajectory?.isFullResolution}
              selectedCornerMarkers={selectedCornerMarkers}
              cornerSegments={cornerSegments}
              initialStraight={initialStraight}
              selectedCornerNumber={selectedCornerNumber}
              onSelectCorner={handleSelectCorner}
            />
          </div>
        </div>

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
    </div>
  );
};
