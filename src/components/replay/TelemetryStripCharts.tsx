import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeLapComparisons, computeCumulativeDistances, findIndexAtDistance, PointComparison } from '../../utils/replayComparison.js';
import { computeTelemetryChartPaths } from './telemetryChartPaths.js';
import { TelemetryStripToolbar } from './TelemetryStripToolbar.js';
import { TelemetrySpeedChannel } from './TelemetrySpeedChannel.js';
import { TelemetryDeltaChannel } from './TelemetryDeltaChannel.js';
import { TelemetryPedalsChannel } from './TelemetryPedalsChannel.js';
import { TelemetrySteerGearChannel } from './TelemetrySteerGearChannel.js';

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
  sectors?: {
    s1Frame: number;
    s2Frame: number;
  };
  className?: string;
  headerContent?: React.ReactNode;
  baselinePoints?: ReplayTrajectoryPoint[];
  baselineLabel?: string;
  baselineLapNumber?: number;
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
  className = '',
  headerContent,
  baselinePoints,
  baselineLabel,
  baselineLapNumber,
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

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const totalPoints = points.length;
  const isZoomed = !!(activeZoomRange && totalPoints > 0 && activeZoomRange.end > activeZoomRange.start);
  const viewStart = isZoomed ? Math.max(0, Math.min(activeZoomRange.start, totalPoints - 2)) : 0;
  const viewEnd = isZoomed ? Math.min(totalPoints - 1, Math.max(activeZoomRange.end, viewStart + 1)) : Math.max(0, totalPoints - 1);

  // The chart's x axis represents cumulative lap distance (meters), not frame index or time,
  // so pointer interactions must map pixel position -> distance -> nearest frame index.
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
      const ratio = rect.width > 0 ? x / rect.width : 0;
      onSelectIndex(indexAtRatio(ratio));
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
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const nextIdx = indexAtRatio(ratio);
      pendingIndexRef.current = nextIdx;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingIndexRef.current !== null) {
            onSelectIndex(pendingIndexRef.current);
          }
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingIndexRef.current !== null) {
      onSelectIndex(pendingIndexRef.current);
      pendingIndexRef.current = null;
    }
    rectRef.current = null;

    if (dragSelection && containerRef.current) {
      const dist = Math.abs(dragSelection.currentX - dragSelection.startX);
      if (dist >= 10) {
        const minPct = Math.min(dragSelection.startPct, dragSelection.currentPct) / 100;
        const maxPct = Math.max(dragSelection.startPct, dragSelection.currentPct) / 100;
        const newStart = indexAtRatio(minPct);
        const newEnd = indexAtRatio(maxPct);
        if (newEnd - newStart >= 3) {
          updateZoomRange({ start: newStart, end: newEnd });
          if (safeIndex < newStart || safeIndex > newEnd) {
            onSelectIndex(newStart);
          }
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

  const pointComparisons = useMemo<PointComparison[]>(() => {
    if (!baselinePoints || baselinePoints.length === 0 || points.length === 0) return [];
    return computeLapComparisons(points, baselinePoints);
  }, [points, baselinePoints]);

  const currentComparison = pointComparisons[safeIndex] || null;
  const currentTimeSec = currentPoint && points[0] ? Math.max(0, (currentPoint.timeSec || 0) - (points[0].timeSec || 0)) : 0;

  const paths = useMemo(
    () => computeTelemetryChartPaths(points, pointComparisons, viewStart, viewEnd),
    [points, pointComparisons, viewStart, viewEnd]
  );

  const isCursorInView = safeIndex >= viewStart && safeIndex <= viewEnd;
  const pctForIndex = (i: number): number => Math.max(0, Math.min(100, ((cumDists[i] ?? distStart) - distStart) / distSpan * 100));
  const cursorPct = pctForIndex(safeIndex);

  const s1Pct = sectors && sectors.s1Frame > viewStart && sectors.s1Frame < viewEnd ? pctForIndex(sectors.s1Frame) : null;
  const s2Pct = sectors && sectors.s2Frame > viewStart && sectors.s2Frame < viewEnd ? pctForIndex(sectors.s2Frame) : null;
  const s1Clamped = sectors && sectors.s1Frame > 0 ? pctForIndex(sectors.s1Frame) : 0;
  const s2Clamped = sectors && sectors.s2Frame > 0 ? pctForIndex(sectors.s2Frame) : 0;

  const cornerEntryPct = selectedCornerMarkers && selectedCornerMarkers.entryFrame > viewStart && selectedCornerMarkers.entryFrame < viewEnd
    ? pctForIndex(selectedCornerMarkers.entryFrame) : null;
  const cornerMinPct = selectedCornerMarkers && selectedCornerMarkers.minFrame > viewStart && selectedCornerMarkers.minFrame < viewEnd
    ? pctForIndex(selectedCornerMarkers.minFrame) : null;
  const cornerExitPct = selectedCornerMarkers && selectedCornerMarkers.exitFrame > viewStart && selectedCornerMarkers.exitFrame < viewEnd
    ? pctForIndex(selectedCornerMarkers.exitFrame) : null;

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-lmu-muted text-sm">
        No telemetry frames recorded for this car.
      </div>
    );
  }

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
      {/* SECTOR INDICATOR ZONES BANNER */}
      {sectors && sectors.s1Frame > 0 && sectors.s2Frame > 0 && (
        <div className="absolute top-0 left-0 right-0 h-3.5 z-20 pointer-events-none flex text-[8px] sm:text-[9px] font-mono font-bold tracking-wider overflow-hidden">
          {s1Clamped > 0 && <div style={{ width: `${s1Clamped}%` }} className="h-full border-r border-lmu-gold/40 bg-lmu-gold/15 text-lmu-gold flex items-center justify-center truncate px-1">SECTOR 1</div>}
          {s2Clamped > s1Clamped && <div style={{ width: `${s2Clamped - s1Clamped}%` }} className="h-full border-r border-lmu-blue/40 bg-lmu-blue/15 text-lmu-blue flex items-center justify-center truncate px-1">SECTOR 2</div>}
          {100 > s2Clamped && <div style={{ width: `${100 - s2Clamped}%` }} className="h-full bg-lmu-green/15 text-lmu-green flex items-center justify-center truncate px-1">SECTOR 3</div>}
        </div>
      )}

      <TelemetryStripToolbar
        interactionMode={interactionMode} onChangeInteractionMode={setInteractionMode}
        isZoomed={isZoomed} viewStart={viewStart} viewEnd={viewEnd}
        spanTimeSec={points[viewStart]?.timeSec !== undefined && points[viewEnd]?.timeSec !== undefined ? (points[viewEnd].timeSec || 0) - (points[viewStart].timeSec || 0) : undefined}
        onResetZoom={handleResetZoom} hasBaseline={Boolean(baselinePoints && baselinePoints.length > 0)}
        baselineLabel={baselineLabel || (baselineLapNumber ? `Lap ${baselineLapNumber}` : 'Baseline')}
        telemetryResolution={telemetryResolution} onChangeResolution={onChangeResolution}
        pointsCount={points.length} rawPointsCount={rawPointsCount} rawSampleRateHz={rawSampleRateHz} isFullResolution={isFullResolution}
        currentTimeSec={currentTimeSec}
        currentFrame={safeIndex + 1}
        totalFrames={points.length}
        headerContent={headerContent}
      />

      {/* 1. SPEED */}
      <TelemetrySpeedChannel
        speedPath={paths.speedPath} baselineSpeedPath={paths.baselineSpeedPath}
        currentPoint={currentPoint} currentComparison={currentComparison}
        isCursorInView={isCursorInView} cursorPct={cursorPct}
      />

      {/* 2. TIME DELTA (when comparing laps) */}
      {pointComparisons.length > 0 && (
        <TelemetryDeltaChannel
          deltaTimePath={paths.deltaTimePath} deltaTimeArea={paths.deltaTimeArea}
          deltaGainArea={paths.deltaGainArea} deltaLossArea={paths.deltaLossArea}
          deltaGradientStops={paths.deltaGradientStops}
          maxDeltaSec={paths.maxDeltaSec} currentComparison={currentComparison}
          isCursorInView={isCursorInView} cursorPct={cursorPct}
        />
      )}

      {/* 3 & 4. THROTTLE & BRAKE */}
      <TelemetryPedalsChannel
        throttlePath={paths.throttlePath} throttleArea={paths.throttleArea}
        baselineThrottlePath={paths.baselineThrottlePath} brakePath={paths.brakePath}
        brakeArea={paths.brakeArea} baselineBrakePath={paths.baselineBrakePath}
        currentPoint={currentPoint} currentComparison={currentComparison}
        isCursorInView={isCursorInView} cursorPct={cursorPct}
      />

      {/* 5 & 6. STEERING & GEAR */}
      <TelemetrySteerGearChannel
        steerPath={paths.steerPath} baselineSteerPath={paths.baselineSteerPath}
        gearPath={paths.gearPath} baselineGearPath={paths.baselineGearPath}
        currentPoint={currentPoint} currentComparison={currentComparison}
        isCursorInView={isCursorInView} cursorPct={cursorPct}
      />

      {/* SECTOR SPLIT VERTICAL DIVIDERS */}
      {s1Pct !== null && (
        <div style={{ left: `${s1Pct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-lmu-gold/50 pointer-events-none z-10">
          <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-lmu-gold/20 text-lmu-gold text-[8px] font-mono font-bold">S1</span>
        </div>
      )}
      {s2Pct !== null && (
        <div style={{ left: `${s2Pct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-lmu-blue/50 pointer-events-none z-10">
          <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-lmu-blue/20 text-lmu-blue text-[8px] font-mono font-bold">S2</span>
        </div>
      )}

      {/* SELECTED CORNER ENTRY / MIN-SPEED / EXIT MARKERS */}
      {cornerEntryPct !== null && (
        <div style={{ left: `${cornerEntryPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-cyan-400/60 pointer-events-none z-10 border-l border-dashed border-cyan-400/60">
          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[8px] font-mono font-bold whitespace-nowrap">
            T{selectedCornerMarkers?.cornerNumber} IN
          </span>
        </div>
      )}
      {cornerMinPct !== null && (
        <div style={{ left: `${cornerMinPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-rose-400/70 pointer-events-none z-10 border-l border-dashed border-rose-400/70">
          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px] font-mono font-bold whitespace-nowrap">
            T{selectedCornerMarkers?.cornerNumber} APEX
          </span>
        </div>
      )}
      {cornerExitPct !== null && (
        <div style={{ left: `${cornerExitPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-emerald-400/60 pointer-events-none z-10 border-l border-dashed border-emerald-400/60">
          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-mono font-bold whitespace-nowrap">
            T{selectedCornerMarkers?.cornerNumber} OUT
          </span>
        </div>
      )}

      {/* SYNCHRONIZED VERTICAL CURSOR LINE */}
      {isCursorInView && (
        <div style={{ left: `${cursorPct}%` }} className="absolute top-3.5 bottom-0 w-[1.5px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
      )}

      {/* DRAG-TO-ZOOM SELECTION HIGHLIGHT */}
      {dragSelection && (
        <div
          style={{ left: `${Math.min(dragSelection.startPct, dragSelection.currentPct)}%`, width: `${Math.abs(dragSelection.currentPct - dragSelection.startPct)}%` }}
          className="absolute top-3.5 bottom-0 bg-sky-500/25 border-x-2 border-sky-400 pointer-events-none z-40 backdrop-blur-[1px]"
        />
      )}
    </div>
  );
};
