import React, { useCallback, useMemo, useState } from 'react';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { computeBaselineChartSamples, computeLapComparisons } from '../../../utils/replayComparison.js';
import { computeStartFinishOffset } from '../../../utils/lapAlignment.js';
import { CornerSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { computeTelemetryChartPaths } from './telemetryChartPaths.js';
import { TelemetryStripView } from './TelemetryStripView.js';
import { TelemetryPreset, loadTelemetryPresets, saveTelemetryPresets, loadActivePresetId, saveActivePresetId, resetTelemetryPresetsToDefault } from './presets/telemetryPresets.js';
import { TelemetryPresetModal } from './presets/TelemetryPresetModal.js';
import { useTelemetryStripInteraction } from './useTelemetryStripInteraction.js';
import { TelemetryResolution } from './telemetryResolution.js';
import { LoadingState } from '../../common/index.js';
import { usePlaybackPosition } from '../inspector/replayPlaybackCursor.js';
import { TelemetryScrubCursor } from './TelemetryScrubCursor.js';

export interface SelectedCornerMarkers {
  cornerNumber: number;
  entryFrame: number;
  minFrame: number;
  exitFrame: number;
}

export interface TelemetryStripChartsProps {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  sectors?: { s1Frame: number; s2Frame: number };
  cornerSegments?: CornerSegmentComparison[];
  initialStraight?: StraightSegmentComparison | null;
  selectedCornerNumber?: number | null;
  onSelectCorner?: (cornerNumber: number | null) => void;
  className?: string;
  isLoading?: boolean;
  headerContent?: React.ReactNode;
  baselinePoints?: ReplayTrajectoryPoint[];
  zoomRange?: { start: number; end: number } | null;
  onZoomRangeChange?: (range: { start: number; end: number } | null) => void;
  telemetryResolution?: TelemetryResolution;
  onChangeResolution?: (res: TelemetryResolution) => void;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  isFullResolution?: boolean;
  selectedCornerMarkers?: SelectedCornerMarkers | null;
  source?: 'vcr' | 'duckdb';
  duckdbFilename?: string;
  hasDuckDb?: boolean;
  duckdbUnavailableReason?: string;
  onSelectSource?: (source: 'duckdb' | 'vcr') => void;
  trackLengthM?: number;
}

export const TelemetryStripCharts: React.FC<TelemetryStripChartsProps> = ({
  points, currentIndex, onSelectIndex, sectors, cornerSegments, initialStraight,
  selectedCornerNumber, onSelectCorner, className = '', isLoading = false, headerContent,
  baselinePoints, zoomRange, onZoomRangeChange, telemetryResolution, onChangeResolution,
  rawPointsCount, rawSampleRateHz, vcrRawPointsCount, vcrRawSampleRateHz, duckdbRawPointsCount, duckdbRawSampleRateHz, isFullResolution, selectedCornerMarkers, source, duckdbFilename,
  hasDuckDb, duckdbUnavailableReason, onSelectSource, trackLengthM,
}) => {
  const {
    containerRef,
    interactionMode,
    setInteractionMode,
    dragSelection,
    isZoomed,
    viewStart,
    viewEnd,
    cumDists,
    safeIndex,
    pctForIndex,
    onStepIndex,
    onJumpToDistance,
    handleResetZoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useTelemetryStripInteraction({ points, currentIndex, onSelectIndex, zoomRange, onZoomRangeChange, trackLengthM, enabled: !isLoading });

  const [presets, setPresets] = useState<TelemetryPreset[]>(() => loadTelemetryPresets());
  const [activePresetId, setActivePresetId] = useState<string>(() => loadActivePresetId(presets));
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  const handleSelectPreset = useCallback((id: string) => {
    setActivePresetId(id);
    saveActivePresetId(id);
  }, []);

  const handleSavePresets = useCallback((updated: TelemetryPreset[]) => {
    setPresets(updated);
    saveTelemetryPresets(updated);
  }, []);

  const handleResetDefaults = useCallback(() => {
    const defs = resetTelemetryPresetsToDefault();
    setPresets(defs);
    setActivePresetId(defs[0].id);
  }, []);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  const currentPoint = points[safeIndex];
  const playbackPosition = usePlaybackPosition(points, safeIndex);

  const pointComparisons = useMemo(
    () => (baselinePoints && baselinePoints.length > 0 && points.length > 0
      ? computeLapComparisons(points, baselinePoints, trackLengthM)
      : []),
    [points, baselinePoints, trackLengthM]
  );
  const baselineSamples = useMemo(
    () => (baselinePoints && baselinePoints.length > 0 ? computeBaselineChartSamples(points, baselinePoints, trackLengthM, cumDists) : undefined),
    [points, baselinePoints, trackLengthM, cumDists]
  );
  const currentComparison = pointComparisons[safeIndex] || null;
  const sfCrossing = useMemo(() => computeStartFinishOffset(points, trackLengthM), [points, trackLengthM]);
  const startTimeSec = sfCrossing?.timeSecOffset ?? (points[0]?.timeSec ?? 0);
  const currentTimeSec = currentPoint ? Math.max(0, (playbackPosition?.timeSec ?? currentPoint.timeSec ?? 0) - startTimeSec) : 0;
  const paths = useMemo(() => computeTelemetryChartPaths(points, pointComparisons, viewStart, viewEnd, cumDists, baselineSamples), [points, pointComparisons, viewStart, viewEnd, cumDists, baselineSamples]);
  const isCursorInView = safeIndex >= viewStart && safeIndex <= viewEnd;
  const cursorPct = pctForIndex(safeIndex) + (playbackPosition?.fraction ?? 0)
    * (pctForIndex(Math.min(safeIndex + 1, points.length - 1)) - pctForIndex(safeIndex));

  const s1Pct = sectors && sectors.s1Frame > viewStart && sectors.s1Frame < viewEnd ? pctForIndex(sectors.s1Frame) : null;
  const s2Pct = sectors && sectors.s2Frame > viewStart && sectors.s2Frame < viewEnd ? pctForIndex(sectors.s2Frame) : null;

  const metrics = {
    s1Pct,
    s2Pct,
    cornerEntryPct: selectedCornerMarkers && selectedCornerMarkers.entryFrame > viewStart && selectedCornerMarkers.entryFrame < viewEnd ? pctForIndex(selectedCornerMarkers.entryFrame) : null,
    cornerMinPct: selectedCornerMarkers && selectedCornerMarkers.minFrame > viewStart && selectedCornerMarkers.minFrame < viewEnd ? pctForIndex(selectedCornerMarkers.minFrame) : null,
    cornerExitPct: selectedCornerMarkers && selectedCornerMarkers.exitFrame > viewStart && selectedCornerMarkers.exitFrame < viewEnd ? pctForIndex(selectedCornerMarkers.exitFrame) : null,
  };

  if (isLoading) return (
    <LoadingState
      size="compact"
      title="Loading Telemetry"
      subtitle="Synchronizing high-frequency channels..."
      dataTestId="telemetry-strip-loading"
      className="h-full"
    />
  );
  if (points.length === 0) return <div className="flex items-center justify-center h-full text-lmu-muted text-sm">No telemetry frames recorded for this car.</div>;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-replay-surface="chart"
      aria-label="Telemetry charts"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDoubleClick={handleResetZoom}
      className={`relative select-none flex flex-col justify-between h-full bg-lmu-strip overflow-hidden cursor-crosshair ${className}`}
    >
      {sectors && sectors.s1Frame > 0 && sectors.s2Frame > 0 && (
        <div className="absolute top-0 left-0 right-0 h-3.5 z-20 pointer-events-none flex text-[10px] sm:text-[10px] font-mono font-bold tracking-wider overflow-hidden">
          {((sectors.s1Frame > 0 ? pctForIndex(sectors.s1Frame) : 0) > 0) && (
            <div style={{ width: `${Math.max(0, pctForIndex(sectors.s1Frame))}%` }} className="h-full border-r border-lmu-gold/40 bg-lmu-gold/15 text-lmu-gold flex items-center justify-center truncate px-1">SECTOR 1</div>
          )}
          {sectors.s2Frame > sectors.s1Frame && (
            <div style={{ width: `${Math.max(0, pctForIndex(sectors.s2Frame) - (sectors.s1Frame > 0 ? pctForIndex(sectors.s1Frame) : 0))}%` }} className="h-full border-r border-lmu-blue/40 bg-lmu-blue/15 text-lmu-blue flex items-center justify-center truncate px-1">SECTOR 2</div>
          )}
          {100 > (sectors.s2Frame > 0 ? pctForIndex(sectors.s2Frame) : 0) && (
            <div style={{ width: `${Math.max(0, 100 - (sectors.s2Frame > 0 ? pctForIndex(sectors.s2Frame) : 0))}%` }} className="h-full bg-lmu-green/15 text-lmu-green flex items-center justify-center truncate px-1">SECTOR 3</div>
          )}
          {isCursorInView && (
            <TelemetryScrubCursor cursorPct={cursorPct} />
          )}
        </div>
      )}

      <TelemetryStripView
        points={points}
        currentPoint={currentPoint}
        safeIndex={safeIndex}
        viewStart={viewStart}
        viewEnd={viewEnd}
        isCursorInView={isCursorInView}
        cursorPct={cursorPct}
        currentComparison={currentComparison}
        pointComparisons={pointComparisons}
        paths={paths}
        sectors={sectors}
        cornerSegments={cornerSegments}
        initialStraight={initialStraight}
        selectedCornerNumber={selectedCornerNumber}
        onSelectCorner={onSelectCorner}
        onJumpToDistance={onJumpToDistance}
        cumDists={cumDists}
        currentDistM={cumDists[safeIndex]}
        selectedCornerMarkers={selectedCornerMarkers}
        interactionMode={interactionMode}
        setInteractionMode={setInteractionMode}
        isZoomed={isZoomed}
        onResetZoom={handleResetZoom}
        onStepIndex={onStepIndex}
        hasBaseline={Boolean(baselinePoints && baselinePoints.length > 0)}
        telemetryResolution={telemetryResolution}
        onChangeResolution={onChangeResolution}
        rawPointsCount={rawPointsCount}
        rawSampleRateHz={rawSampleRateHz}
        vcrRawPointsCount={vcrRawPointsCount}
        vcrRawSampleRateHz={vcrRawSampleRateHz}
        duckdbRawPointsCount={duckdbRawPointsCount}
        duckdbRawSampleRateHz={duckdbRawSampleRateHz}
        isFullResolution={isFullResolution}
        currentTimeSec={currentTimeSec}
        totalFrames={points.length}
        headerContent={headerContent}
        dragSelection={dragSelection}
        markerPcts={metrics} activeChannels={activePreset?.channels}
        presets={presets} activePresetId={activePresetId} onSelectPreset={handleSelectPreset}
        onOpenManageModal={() => setIsPresetModalOpen(true)}
        source={source} duckdbFilename={duckdbFilename}
        hasDuckDb={hasDuckDb} duckdbUnavailableReason={duckdbUnavailableReason} onSelectSource={onSelectSource}
      />

      <TelemetryPresetModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        presets={presets}
        activePresetId={activePresetId}
        onSavePresets={handleSavePresets}
        onSelectActivePreset={handleSelectPreset}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  );
};
