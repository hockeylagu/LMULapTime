import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { computeLapComparisons, computeCumulativeDistances, findIndexAtDistance } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { computeTelemetryChartPaths } from './telemetryChartPaths.js';
import { TelemetryStripView } from './TelemetryStripView.js';

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
  telemetryResolution?: number;
  onChangeResolution?: (res: number) => void;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  isFullResolution?: boolean;
  selectedCornerMarkers?: SelectedCornerMarkers | null;
}

export const TelemetryStripCharts: React.FC<TelemetryStripChartsProps> = ({
  points,
  currentIndex,
  onSelectIndex,
  sectors,
  cornerSegments,
  initialStraight,
  selectedCornerNumber,
  onSelectCorner,
  className = '',
  isLoading = false,
  headerContent,
  baselinePoints,
  zoomRange,
  onZoomRangeChange,
  telemetryResolution,
  onChangeResolution,
  rawPointsCount,
  rawSampleRateHz,
  isFullResolution,
  selectedCornerMarkers,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const rectRef = useRef<{ left: number; width: number } | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const [internalZoomRange, setInternalZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<'scrub' | 'zoom'>('scrub');
  const [dragSelection, setDragSelection] = useState<{ startX: number; currentX: number; startPct: number; currentPct: number } | null>(null);

  const activeZoomRange = zoomRange !== undefined ? zoomRange : internalZoomRange;
  const updateZoomRange = useCallback((range: { start: number; end: number } | null) => {
    setInternalZoomRange(range);
    onZoomRangeChange?.(range);
  }, [onZoomRangeChange]);
  const handleResetZoom = useCallback(() => updateZoomRange(null), [updateZoomRange]);

  useEffect(() => {
    if (activeZoomRange && (points.length === 0 || activeZoomRange.end >= points.length)) updateZoomRange(null);
  }, [points.length, activeZoomRange, updateZoomRange]);

  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
  }, []);

  const totalPoints = points.length;
  const isZoomed = !!(activeZoomRange && totalPoints > 0 && activeZoomRange.end > activeZoomRange.start);
  const viewStart = isZoomed ? Math.max(0, Math.min(activeZoomRange.start, totalPoints - 2)) : 0;
  const viewEnd = isZoomed ? Math.min(totalPoints - 1, Math.max(activeZoomRange.end, viewStart + 1)) : Math.max(0, totalPoints - 1);
  const cumDists = useMemo(() => computeCumulativeDistances(points), [points]);
  const distStart = cumDists[viewStart] ?? 0;
  const distEnd = cumDists[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);
  const indexAtRatio = useCallback((ratio: number): number => {
    const targetDist = distStart + Math.max(0, Math.min(1, ratio)) * distSpan;
    return Math.max(0, Math.min(totalPoints - 1, findIndexAtDistance(cumDists, targetDist)));
  }, [cumDists, distStart, distSpan, totalPoints]);

  const safeIndex = Math.max(0, Math.min(currentIndex, totalPoints - 1));
  const currentPoint = points[safeIndex];
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    rectRef.current = { left: rect.left, width: rect.width };
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    if (interactionMode === 'zoom' || e.shiftKey) {
      setDragSelection({ startX: x, currentX: x, startPct: pct, currentPct: pct });
      isDraggingRef.current = false;
    } else {
      isDraggingRef.current = true;
      setDragSelection(null);
      onSelectIndex(indexAtRatio(rect.width > 0 ? x / rect.width : 0));
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = rectRef.current || containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    if (dragSelection) {
      setDragSelection(prev => (prev ? { ...prev, currentX: x, currentPct: pct } : null));
    } else if (isDraggingRef.current) {
      const nextIdx = indexAtRatio(rect.width > 0 ? x / rect.width : 0);
      pendingIndexRef.current = nextIdx;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingIndexRef.current !== null) onSelectIndex(pendingIndexRef.current);
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    if (pendingIndexRef.current !== null) { onSelectIndex(pendingIndexRef.current); pendingIndexRef.current = null; }
    rectRef.current = null;
    if (dragSelection && containerRef.current) {
      const dist = Math.abs(dragSelection.currentX - dragSelection.startX);
      if (dist >= 10) {
        const newStart = indexAtRatio(Math.min(dragSelection.startPct, dragSelection.currentPct) / 100);
        const newEnd = indexAtRatio(Math.max(dragSelection.startPct, dragSelection.currentPct) / 100);
        if (newEnd - newStart >= 3) {
          updateZoomRange({ start: newStart, end: newEnd });
          if (safeIndex < newStart || safeIndex > newEnd) onSelectIndex(newStart);
        }
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = rect.width > 0 ? dragSelection.startX / rect.width : 0;
        onSelectIndex(indexAtRatio(ratio));
      }
      setDragSelection(null);
    }
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const pointComparisons = useMemo(() => (baselinePoints && baselinePoints.length > 0 && points.length > 0 ? computeLapComparisons(points, baselinePoints) : []), [points, baselinePoints]);
  const currentComparison = pointComparisons[safeIndex] || null;
  const currentTimeSec = currentPoint && points[0] ? Math.max(0, (currentPoint.timeSec || 0) - (points[0].timeSec || 0)) : 0;
  const paths = useMemo(() => computeTelemetryChartPaths(points, pointComparisons, viewStart, viewEnd), [points, pointComparisons, viewStart, viewEnd]);
  const isCursorInView = safeIndex >= viewStart && safeIndex <= viewEnd;
  const pctForIndex = (i: number): number => Math.max(0, Math.min(100, ((cumDists[i] ?? distStart) - distStart) / distSpan * 100));
  const cursorPct = pctForIndex(safeIndex);

  const onJumpToDistance = useCallback(
    (distM: number) => {
      if (cumDists.length === 0) return;
      const targetFrame = findIndexAtDistance(cumDists, distM);
      onSelectIndex(targetFrame);
    },
    [cumDists, onSelectIndex]
  );

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
    <div className="flex flex-col items-center justify-center h-full gap-3 text-lmu-muted text-sm">
      <div className="w-6 h-6 border-2 border-lmu-accent border-t-transparent rounded-full animate-spin" />
      Loading telemetry...
    </div>
  );
  if (points.length === 0) return <div className="flex items-center justify-center h-full text-lmu-muted text-sm">No telemetry frames recorded for this car.</div>;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
        rectRef.current = null;
        setDragSelection(null);
        isDraggingRef.current = false;
      }}
      onDoubleClick={handleResetZoom}
      className={`relative select-none flex flex-col justify-between h-full bg-[#0a0e17] rounded-2xl border border-lmu-border/70 overflow-hidden cursor-crosshair ${className}`}
    >
      {sectors && sectors.s1Frame > 0 && sectors.s2Frame > 0 && (
        <div className="absolute top-0 left-0 right-0 h-3.5 z-20 pointer-events-none flex text-[8px] sm:text-[9px] font-mono font-bold tracking-wider overflow-hidden">
          {((sectors.s1Frame > 0 ? pctForIndex(sectors.s1Frame) : 0) > 0) && <div style={{ width: `${Math.max(0, pctForIndex(sectors.s1Frame))}%` }} className="h-full border-r border-lmu-gold/40 bg-lmu-gold/15 text-lmu-gold flex items-center justify-center truncate px-1">SECTOR 1</div>}
          {sectors.s2Frame > sectors.s1Frame && <div style={{ width: `${Math.max(0, pctForIndex(sectors.s2Frame) - (sectors.s1Frame > 0 ? pctForIndex(sectors.s1Frame) : 0))}%` }} className="h-full border-r border-lmu-blue/40 bg-lmu-blue/15 text-lmu-blue flex items-center justify-center truncate px-1">SECTOR 2</div>}
          {100 > (sectors.s2Frame > 0 ? pctForIndex(sectors.s2Frame) : 0) && <div style={{ width: `${Math.max(0, 100 - (sectors.s2Frame > 0 ? pctForIndex(sectors.s2Frame) : 0))}%` }} className="h-full bg-lmu-green/15 text-lmu-green flex items-center justify-center truncate px-1">SECTOR 3</div>}
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
        hasBaseline={Boolean(baselinePoints && baselinePoints.length > 0)}
        telemetryResolution={telemetryResolution}
        onChangeResolution={onChangeResolution}
        rawPointsCount={rawPointsCount}
        rawSampleRateHz={rawSampleRateHz}
        isFullResolution={isFullResolution}
        currentTimeSec={currentTimeSec}
        totalFrames={points.length}
        headerContent={headerContent}
        dragSelection={dragSelection}
        markerPcts={metrics}
      />
    </div>
  );
};
