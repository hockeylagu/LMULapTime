import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeLapComparisons, PointComparison } from '../../utils/replayComparison.js';
import { computeTelemetryChartPaths } from './telemetryChartPaths.js';
import { TelemetryStripToolbar } from './TelemetryStripToolbar.js';
import { TelemetrySpeedChannel } from './TelemetrySpeedChannel.js';
import { TelemetryDeltaChannel } from './TelemetryDeltaChannel.js';
import { TelemetryPedalsChannel } from './TelemetryPedalsChannel.js';
import { TelemetrySteerGearChannel } from './TelemetrySteerGearChannel.js';

export interface TelemetryStripChartsProps {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  sectors?: {
    s1Frame: number;
    s2Frame: number;
  };
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
  baselineLabel?: string;
  baselineLapNumber?: number;
  zoomRange?: { start: number; end: number } | null;
  onZoomRangeChange?: (range: { start: number; end: number } | null) => void;
}

export const TelemetryStripCharts: React.FC<TelemetryStripChartsProps> = ({
  points,
  currentIndex,
  onSelectIndex,
  sectors,
  className = '',
  baselinePoints,
  baselineLabel,
  baselineLapNumber,
  zoomRange,
  onZoomRangeChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const [internalZoomRange, setInternalZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<'scrub' | 'zoom'>('scrub');
  const [dragSelection, setDragSelection] = useState<{
    startX: number;
    currentX: number;
    startPct: number;
    currentPct: number;
  } | null>(null);

  const activeZoomRange = zoomRange !== undefined ? zoomRange : internalZoomRange;

  const updateZoomRange = useCallback(
    (range: { start: number; end: number } | null) => {
      setInternalZoomRange(range);
      onZoomRangeChange?.(range);
    },
    [onZoomRangeChange]
  );

  const handleResetZoom = useCallback(() => {
    updateZoomRange(null);
  }, [updateZoomRange]);

  useEffect(() => {
    if (activeZoomRange && (points.length === 0 || activeZoomRange.end >= points.length)) {
      updateZoomRange(null);
    }
  }, [points.length, activeZoomRange, updateZoomRange]);

  const totalPoints = points.length;
  const isZoomed = !!(activeZoomRange && totalPoints > 0 && activeZoomRange.end > activeZoomRange.start);
  const viewStart = isZoomed ? Math.max(0, Math.min(activeZoomRange.start, totalPoints - 2)) : 0;
  const viewEnd = isZoomed ? Math.min(totalPoints - 1, Math.max(activeZoomRange.end, viewStart + 1)) : Math.max(0, totalPoints - 1);
  const viewSpan = Math.max(1, viewEnd - viewStart);

  const safeIndex = Math.max(0, Math.min(currentIndex, totalPoints - 1));
  const currentPoint = points[safeIndex];

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;

    if (interactionMode === 'zoom' || e.shiftKey) {
      setDragSelection({ startX: x, currentX: x, startPct: pct, currentPct: pct });
      isDraggingRef.current = false;
    } else {
      isDraggingRef.current = true;
      setDragSelection(null);
      const ratio = rect.width > 0 ? x / rect.width : 0;
      onSelectIndex(Math.max(0, Math.min(totalPoints - 1, Math.round(viewStart + ratio * viewSpan))));
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;

    if (dragSelection) {
      setDragSelection(prev => (prev ? { ...prev, currentX: x, currentPct: pct } : null));
    } else if (isDraggingRef.current) {
      const ratio = rect.width > 0 ? x / rect.width : 0;
      onSelectIndex(Math.max(0, Math.min(totalPoints - 1, Math.round(viewStart + ratio * viewSpan))));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragSelection && containerRef.current) {
      const dist = Math.abs(dragSelection.currentX - dragSelection.startX);
      if (dist >= 10) {
        const minPct = Math.min(dragSelection.startPct, dragSelection.currentPct) / 100;
        const maxPct = Math.max(dragSelection.startPct, dragSelection.currentPct) / 100;
        const newStart = Math.round(viewStart + minPct * viewSpan);
        const newEnd = Math.round(viewStart + maxPct * viewSpan);
        if (newEnd - newStart >= 3) {
          updateZoomRange({ start: newStart, end: newEnd });
          if (safeIndex < newStart || safeIndex > newEnd) {
            onSelectIndex(newStart);
          }
        }
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = rect.width > 0 ? dragSelection.startX / rect.width : 0;
        onSelectIndex(Math.max(0, Math.min(totalPoints - 1, Math.round(viewStart + ratio * viewSpan))));
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

  const paths = useMemo(
    () => computeTelemetryChartPaths(points, pointComparisons, viewStart, viewEnd, viewSpan),
    [points, pointComparisons, viewStart, viewEnd, viewSpan]
  );

  const isCursorInView = safeIndex >= viewStart && safeIndex <= viewEnd;
  const cursorPct = viewSpan > 0 ? ((safeIndex - viewStart) / viewSpan) * 100 : 0;

  const s1Pct = sectors && sectors.s1Frame > viewStart && sectors.s1Frame < viewEnd ? ((sectors.s1Frame - viewStart) / viewSpan) * 100 : null;
  const s2Pct = sectors && sectors.s2Frame > viewStart && sectors.s2Frame < viewEnd ? ((sectors.s2Frame - viewStart) / viewSpan) * 100 : null;
  const s1Clamped = sectors && sectors.s1Frame > 0 ? Math.max(0, Math.min(100, ((sectors.s1Frame - viewStart) / viewSpan) * 100)) : 0;
  const s2Clamped = sectors && sectors.s2Frame > 0 ? Math.max(0, Math.min(100, ((sectors.s2Frame - viewStart) / viewSpan) * 100)) : 0;

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
      onPointerCancel={() => { setDragSelection(null); isDraggingRef.current = false; }}
      onDoubleClick={handleResetZoom}
      className={`relative select-none flex flex-col justify-between h-full bg-[#0a0e17] rounded-2xl border border-lmu-border/70 overflow-hidden cursor-crosshair ${className}`}
    >
      {/* SECTOR INDICATOR ZONES BANNER */}
      {sectors && sectors.s1Frame > 0 && sectors.s2Frame > 0 && (
        <div className="absolute top-0 left-0 right-0 h-3.5 z-20 pointer-events-none flex text-[8px] sm:text-[9px] font-mono font-bold tracking-wider overflow-hidden">
          {s1Clamped > 0 && (
            <div style={{ width: `${s1Clamped}%` }} className="h-full border-r border-lmu-gold/40 bg-lmu-gold/15 text-lmu-gold flex items-center justify-center truncate px-1">
              SECTOR 1
            </div>
          )}
          {s2Clamped > s1Clamped && (
            <div style={{ width: `${s2Clamped - s1Clamped}%` }} className="h-full border-r border-lmu-blue/40 bg-lmu-blue/15 text-lmu-blue flex items-center justify-center truncate px-1">
              SECTOR 2
            </div>
          )}
          {100 > s2Clamped && (
            <div style={{ width: `${100 - s2Clamped}%` }} className="h-full bg-lmu-green/15 text-lmu-green flex items-center justify-center truncate px-1">
              SECTOR 3
            </div>
          )}
        </div>
      )}

      <TelemetryStripToolbar
        interactionMode={interactionMode}
        onChangeInteractionMode={setInteractionMode}
        isZoomed={isZoomed}
        viewStart={viewStart}
        viewEnd={viewEnd}
        spanTimeSec={points[viewStart]?.timeSec !== undefined && points[viewEnd]?.timeSec !== undefined ? (points[viewEnd].timeSec || 0) - (points[viewStart].timeSec || 0) : undefined}
        onResetZoom={handleResetZoom}
        hasBaseline={Boolean(baselinePoints && baselinePoints.length > 0)}
        baselineLabel={baselineLabel || (baselineLapNumber ? `Lap ${baselineLapNumber}` : 'Baseline')}
      />

      {/* 1. SPEED */}
      <TelemetrySpeedChannel
        speedPath={paths.speedPath}
        baselineSpeedPath={paths.baselineSpeedPath}
        currentPoint={currentPoint}
        currentComparison={currentComparison}
        isCursorInView={isCursorInView}
        cursorPct={cursorPct}
      />

      {/* 2. TIME DELTA (when comparing laps) */}
      {pointComparisons.length > 0 && (
        <TelemetryDeltaChannel
          deltaTimePath={paths.deltaTimePath}
          deltaTimeArea={paths.deltaTimeArea}
          maxDeltaSec={paths.maxDeltaSec}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      )}

      {/* 3 & 4. THROTTLE & BRAKE */}
      <TelemetryPedalsChannel
        throttlePath={paths.throttlePath}
        throttleArea={paths.throttleArea}
        baselineThrottlePath={paths.baselineThrottlePath}
        brakePath={paths.brakePath}
        brakeArea={paths.brakeArea}
        baselineBrakePath={paths.baselineBrakePath}
        currentPoint={currentPoint}
        currentComparison={currentComparison}
        isCursorInView={isCursorInView}
        cursorPct={cursorPct}
      />

      {/* 5 & 6. STEERING & GEAR */}
      <TelemetrySteerGearChannel
        steerPath={paths.steerPath}
        baselineSteerPath={paths.baselineSteerPath}
        gearPath={paths.gearPath}
        baselineGearPath={paths.baselineGearPath}
        currentPoint={currentPoint}
        currentComparison={currentComparison}
        isCursorInView={isCursorInView}
        cursorPct={cursorPct}
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

      {/* SYNCHRONIZED VERTICAL CURSOR LINE */}
      {isCursorInView && (
        <div
          style={{ left: `${cursorPct}%` }}
          className="absolute top-3.5 bottom-0 w-[1.5px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(255,255,255,0.9)]"
        />
      )}

      {/* DRAG-TO-ZOOM SELECTION HIGHLIGHT */}
      {dragSelection && (
        <div
          style={{
            left: `${Math.min(dragSelection.startPct, dragSelection.currentPct)}%`,
            width: `${Math.abs(dragSelection.currentPct - dragSelection.startPct)}%`,
          }}
          className="absolute top-3.5 bottom-0 bg-sky-500/25 border-x-2 border-sky-400 pointer-events-none z-40 backdrop-blur-[1px]"
        />
      )}
    </div>
  );
};
