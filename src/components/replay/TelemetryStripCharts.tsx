import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Gauge, Activity, Zap, Compass, Layers, Timer, ZoomIn, Play } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeLapComparisons, PointComparison } from '../../utils/replayComparison.js';

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

  // Zoom range state (supports controlled or uncontrolled)
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

  // Reset zoom if points array changes or active bounds exceed point count
  useEffect(() => {
    if (activeZoomRange) {
      if (points.length === 0 || activeZoomRange.end >= points.length) {
        updateZoomRange(null);
      }
    }
  }, [points.length, activeZoomRange, updateZoomRange]);

  const totalPoints = points.length;
  const isZoomed = !!(activeZoomRange && totalPoints > 0 && activeZoomRange.end > activeZoomRange.start);
  const viewStart = isZoomed ? Math.max(0, Math.min(activeZoomRange.start, totalPoints - 2)) : 0;
  const viewEnd = isZoomed ? Math.min(totalPoints - 1, Math.max(activeZoomRange.end, viewStart + 1)) : Math.max(0, totalPoints - 1);
  const viewSpan = Math.max(1, viewEnd - viewStart);

  const safeIndex = Math.max(0, Math.min(currentIndex, totalPoints - 1));
  const currentPoint = points[safeIndex];

  // Mouse scrubbing & drag-to-zoom handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) {
      return;
    }

    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;

    const isZoomAction = interactionMode === 'zoom' || e.shiftKey;

    if (isZoomAction) {
      setDragSelection({
        startX: x,
        currentX: x,
        startPct: pct,
        currentPct: pct,
      });
      isDraggingRef.current = false;
    } else {
      isDraggingRef.current = true;
      setDragSelection(null);
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const newIdx = Math.round(viewStart + ratio * viewSpan);
      onSelectIndex(Math.max(0, Math.min(totalPoints - 1, newIdx)));
    }

    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
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
      const newIdx = Math.round(viewStart + ratio * viewSpan);
      onSelectIndex(Math.max(0, Math.min(totalPoints - 1, newIdx)));
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
        // Single click seeks to index
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = rect.width > 0 ? dragSelection.startX / rect.width : 0;
        const newIdx = Math.round(viewStart + ratio * viewSpan);
        onSelectIndex(Math.max(0, Math.min(totalPoints - 1, newIdx)));
      }
      setDragSelection(null);
    }

    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragSelection(null);
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Calculate normalized distance-based comparisons when a baseline is provided
  const pointComparisons = useMemo<PointComparison[]>(() => {
    if (!baselinePoints || baselinePoints.length === 0 || points.length === 0) {
      return [];
    }
    return computeLapComparisons(points, baselinePoints);
  }, [points, baselinePoints]);

  const currentComparison = pointComparisons[safeIndex] || null;

  // Pre-calculate SVG paths normalized to [0, 1000] width and [0, 100] height per chart for visible window
  const {
    speedPath,
    throttlePath,
    throttleArea,
    brakePath,
    brakeArea,
    steerPath,
    gearPath,
    baselineSpeedPath,
    baselineThrottlePath,
    baselineBrakePath,
    baselineSteerPath,
    baselineGearPath,
    deltaTimePath,
    deltaTimeArea,
    maxDeltaSec,
  } = useMemo(() => {
    if (points.length === 0) {
      return {
        speedPath: '',
        throttlePath: '',
        throttleArea: '',
        brakePath: '',
        brakeArea: '',
        steerPath: '',
        gearPath: '',
        baselineSpeedPath: '',
        baselineThrottlePath: '',
        baselineBrakePath: '',
        baselineSteerPath: '',
        baselineGearPath: '',
        deltaTimePath: '',
        deltaTimeArea: '',
        maxDeltaSec: 1,
      };
    }

    // Keep vertical speed axis scale constant across whole lap so gridlines do not warp
    const maxSpd = Math.max(
      260,
      ...points.map(p => p.speedKmh || 0),
      ...(pointComparisons.map(c => c.baseline.speedKmh) || [])
    );

    let spd = '';
    let thr = '';
    let brk = '';
    let str = '';
    let gr = '';

    let bSpd = '';
    let bThr = '';
    let bBrk = '';
    let bStr = '';
    let bGr = '';

    // Calculate max delta for Δt scaling for the visible window
    let maxDelta = 1.0;
    if (pointComparisons.length > 0) {
      const visibleComps = pointComparisons.slice(viewStart, viewEnd + 1);
      const deltas = visibleComps
        .map(c => Math.abs(c.deltaTimeSec))
        .filter(d => !isNaN(d) && isFinite(d));
      const rawMax = Math.max(0.5, ...deltas);
      maxDelta = Math.min(8, Math.max(1.0, Math.ceil(rawMax * 2) / 2));
    }

    let dtPath = '';

    for (let i = viewStart; i <= viewEnd; i++) {
      const p = points[i];
      const x = ((i - viewStart) / viewSpan) * 1000;
      const isFirst = i === viewStart;

      // Primary Speed (0 to maxSpd km/h -> 95 to 10 in SVG Y)
      const spdNorm = Math.min(1, Math.max(0, (p.speedKmh || 0) / maxSpd));
      const sy = 95 - spdNorm * 85;
      spd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sy.toFixed(1)} `;

      // Primary Throttle (0 to 100% -> 95 to 10 in SVG Y)
      const thrNorm = Math.min(1, Math.max(0, (p.throttle || 0) / 100));
      const ty = 95 - thrNorm * 85;
      thr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${ty.toFixed(1)} `;

      // Primary Brake (0 to 100% -> 95 to 10 in SVG Y)
      const brkNorm = Math.min(1, Math.max(0, (p.brake || 0) / 100));
      const by = 95 - brkNorm * 85;
      brk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${by.toFixed(1)} `;

      // Primary Steering (-180 to +180 deg -> 10 to 90, center at 50)
      const st = Math.min(180, Math.max(-180, p.steerYaw || 0));
      const sty = 50 + (st / 180) * 40;
      str += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sty.toFixed(1)} `;

      // Primary Gear (1 to 7 -> 90 to 15 in SVG Y)
      const gear = Math.min(7, Math.max(1, p.speedKmh && p.speedKmh > 5 ? Math.min(7, Math.floor(p.speedKmh / 38) + 1) : 1));
      const gy = 95 - (gear / 7) * 80;
      if (isFirst) {
        gr += `M ${x.toFixed(1)} ${gy.toFixed(1)} `;
      } else {
        const prevP = points[i - 1];
        const prevGear = Math.min(7, Math.max(1, prevP.speedKmh && prevP.speedKmh > 5 ? Math.min(7, Math.floor(prevP.speedKmh / 38) + 1) : 1));
        const prevGy = 95 - (prevGear / 7) * 80;
        gr += `L ${x.toFixed(1)} ${prevGy.toFixed(1)} L ${x.toFixed(1)} ${gy.toFixed(1)} `;
      }

      // Baseline comparisons if active
      if (pointComparisons[i]) {
        const comp = pointComparisons[i];
        const bp = comp.baseline;

        // Baseline speed
        const bSpdNorm = Math.min(1, Math.max(0, (bp.speedKmh || 0) / maxSpd));
        const bsy = 95 - bSpdNorm * 85;
        bSpd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsy.toFixed(1)} `;

        // Baseline throttle
        const bThrNorm = Math.min(1, Math.max(0, (bp.throttle || 0) / 100));
        const bty = 95 - bThrNorm * 85;
        bThr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bty.toFixed(1)} `;

        // Baseline brake
        const bBrkNorm = Math.min(1, Math.max(0, (bp.brake || 0) / 100));
        const bby = 95 - bBrkNorm * 85;
        bBrk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bby.toFixed(1)} `;

        // Baseline steering
        const bst = Math.min(180, Math.max(-180, bp.steerYaw || 0));
        const bsty = 50 + (bst / 180) * 40;
        bStr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsty.toFixed(1)} `;

        // Baseline gear
        const bGy = 95 - (bp.gear / 7) * 80;
        if (isFirst) {
          bGr += `M ${x.toFixed(1)} ${bGy.toFixed(1)} `;
        } else {
          const prevBp = pointComparisons[i - 1]?.baseline || bp;
          const prevBgy = 95 - (prevBp.gear / 7) * 80;
          bGr += `L ${x.toFixed(1)} ${prevBgy.toFixed(1)} L ${x.toFixed(1)} ${bGy.toFixed(1)} `;
        }

        // Delta time: negative is faster (above zero line, Y < 50), positive is slower (below, Y > 50)
        const dtNorm = Math.max(-1, Math.min(1, comp.deltaTimeSec / maxDelta));
        const dty = 50 + dtNorm * 40;
        dtPath += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${dty.toFixed(1)} `;
      }
    }

    const thrArea = `${thr} L 1000 95 L 0 95 Z`;
    const brkArea = `${brk} L 1000 95 L 0 95 Z`;
    const dtArea = dtPath ? `${dtPath} L 1000 50 L 0 50 Z` : '';

    return {
      speedPath: spd,
      throttlePath: thr,
      throttleArea: thrArea,
      brakePath: brk,
      brakeArea: brkArea,
      steerPath: str,
      gearPath: gr,
      baselineSpeedPath: bSpd,
      baselineThrottlePath: bThr,
      baselineBrakePath: bBrk,
      baselineSteerPath: bStr,
      baselineGearPath: bGr,
      deltaTimePath: dtPath,
      deltaTimeArea: dtArea,
      maxDeltaSec: maxDelta,
    };
  }, [points, pointComparisons, viewStart, viewEnd, viewSpan]);

  // Cursor position percentage relative to view window [0, 100]
  const isCursorInView = safeIndex >= viewStart && safeIndex <= viewEnd;
  const cursorPct = viewSpan > 0 ? ((safeIndex - viewStart) / viewSpan) * 100 : 0;

  // Sector split boundaries relative to view window [0, 100]
  const s1Pct =
    sectors && sectors.s1Frame > viewStart && sectors.s1Frame < viewEnd
      ? ((sectors.s1Frame - viewStart) / viewSpan) * 100
      : null;
  const s2Pct =
    sectors && sectors.s2Frame > viewStart && sectors.s2Frame < viewEnd
      ? ((sectors.s2Frame - viewStart) / viewSpan) * 100
      : null;

  // Top banner sector spans clamped to view window
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
      onPointerCancel={handlePointerCancel}
      onDoubleClick={handleResetZoom}
      className={`relative select-none flex flex-col justify-between h-full bg-[#0a0e17] rounded-2xl border border-lmu-border/70 overflow-hidden cursor-crosshair ${className}`}
    >
      {/* SECTOR INDICATOR ZONES BANNER */}
      {sectors && sectors.s1Frame > 0 && sectors.s2Frame > 0 && (
        <div className="absolute top-0 left-0 right-0 h-3.5 z-20 pointer-events-none flex text-[8px] sm:text-[9px] font-mono font-bold tracking-wider overflow-hidden">
          {s1Clamped > 0 && (
            <div
              style={{ width: `${s1Clamped}%` }}
              className="h-full border-r border-lmu-gold/40 bg-lmu-gold/15 text-lmu-gold flex items-center justify-center truncate px-1"
            >
              SECTOR 1
            </div>
          )}
          {s2Clamped > s1Clamped && (
            <div
              style={{ width: `${s2Clamped - s1Clamped}%` }}
              className="h-full border-r border-lmu-blue/40 bg-lmu-blue/15 text-lmu-blue flex items-center justify-center truncate px-1"
            >
              SECTOR 2
            </div>
          )}
          {100 > s2Clamped && (
            <div
              style={{ width: `${100 - s2Clamped}%` }}
              className="h-full bg-lmu-green/15 text-lmu-green flex items-center justify-center truncate px-1"
            >
              SECTOR 3
            </div>
          )}
        </div>
      )}

      {/* CHART TOOLBAR: Mode switcher, zoom status & reset, comparison legend */}
      <div className="pt-3.5 px-3 py-1 flex items-center justify-between bg-[#080c14] border-b border-lmu-border/40 shrink-0 select-none z-20">
        <div className="flex items-center gap-2">
          {/* Mode Switch Pills */}
          <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInteractionMode('scrub');
              }}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                interactionMode === 'scrub'
                  ? 'bg-sky-500 text-white font-bold shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                  : 'text-lmu-muted hover:text-white'
              }`}
              title="Scrub timeline (Tip: hold Shift while dragging to zoom)"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              Scrub
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInteractionMode('zoom');
              }}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                interactionMode === 'zoom'
                  ? 'bg-sky-500 text-white font-bold shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                  : 'text-lmu-muted hover:text-white'
              }`}
              title="Click and drag to select a range to zoom into"
            >
              <ZoomIn className="w-2.5 h-2.5" />
              Zoom Range
            </button>
          </div>

          {/* Zoom status indicator & Reset Button */}
          {isZoomed ? (
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Zoomed: Frames {viewStart + 1}–{viewEnd + 1}
                {points[viewStart]?.timeSec !== undefined && points[viewEnd]?.timeSec !== undefined && (
                  <span className="text-lmu-muted">
                    ({((points[viewEnd].timeSec || 0) - (points[viewStart].timeSec || 0)).toFixed(2)}s)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetZoom();
                }}
                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-bold transition-all text-[10px] flex items-center gap-1"
                title="Reset zoom to full lap (or double-click chart)"
              >
                ✕ Reset Lap
              </button>
              <span className="hidden xl:inline text-[9px] text-lmu-muted/70 italic">
                (Double-click chart to reset)
              </span>
            </div>
          ) : (
            <span className="hidden sm:inline text-[9px] text-lmu-muted font-mono">
              {interactionMode === 'scrub' ? 'Drag to scrub • Hold Shift to zoom range' : 'Drag across chart to select zoom range'}
            </span>
          )}
        </div>

        {/* Comparison Legend Overlay (when comparing laps) */}
        {baselinePoints && baselinePoints.length > 0 && (
          <div className="flex items-center gap-2 bg-[#090d16] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-mono">
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-[#38bdf8] rounded" />
              <span className="text-sky-300 font-bold">Primary</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-[#f59e0b] rounded border-b border-dashed border-[#f59e0b]" />
              <span className="text-amber-400 font-bold truncate max-w-[140px]">
                {baselineLabel || (baselineLapNumber ? `Lap ${baselineLapNumber}` : 'Baseline')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 1. SPEED CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#0b101d]/60">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-sky-500/20 text-sky-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            SPEED
          </span>
          <span className="text-xs font-mono font-bold text-white">
            {currentPoint?.speedKmh ?? 0} <span className="text-[10px] font-normal text-lmu-muted">km/h</span>
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono flex items-center gap-1.5 ml-1 pl-2 border-l border-white/10">
              <span className="text-amber-400 font-semibold">Base: {currentComparison.baseline.speedKmh} km/h</span>
              <span className={`font-bold ${currentComparison.deltaSpeedKmh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                (Δ {currentComparison.deltaSpeedKmh >= 0 ? `+${currentComparison.deltaSpeedKmh}` : currentComparison.deltaSpeedKmh})
              </span>
            </span>
          )}
        </div>

        {/* Speed horizontal grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">250 km/h</div>
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">125 km/h</div>
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">0 km/h</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          {baselineSpeedPath && (
            <path
              d={baselineSpeedPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          )}
          <path
            d={speedPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Live Value Tag at Cursor */}
        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-sky-300 border border-sky-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              {currentPoint?.speedKmh ?? 0} <span className="text-[9px] font-normal text-sky-400/70">km/h</span>
            </span>
            {currentComparison && (
              <span className={`px-1.5 py-0.5 rounded-md bg-[#070c18] font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
                currentComparison.deltaSpeedKmh >= 0 ? 'border-emerald-500/80 text-emerald-300' : 'border-rose-500/80 text-rose-300'
              }`}>
                <span className="text-amber-400 font-semibold mr-1">B: {currentComparison.baseline.speedKmh}</span>
                <span>{currentComparison.deltaSpeedKmh >= 0 ? `+${currentComparison.deltaSpeedKmh}` : currentComparison.deltaSpeedKmh}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* DEDICATED TIME DELTA CHANNEL (when comparing laps) */}
      {pointComparisons.length > 0 && (
        <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#110d1c]/60">
          <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
            <span className="p-1 rounded bg-purple-500/20 text-purple-300 font-black text-[10px] tracking-wider flex items-center gap-1">
              <Timer className="w-3 h-3" />
              TIME DELTA (Δt)
            </span>
            {currentComparison ? (
              <div className="flex items-center gap-1.5 font-mono">
                <span className={`text-xs font-bold ${
                  currentComparison.deltaTimeSec <= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {currentComparison.deltaTimeSec <= 0 ? '' : '+'}
                  {currentComparison.deltaTimeSec.toFixed(3)}s
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  currentComparison.deltaTimeSec <= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {currentComparison.deltaTimeSec <= 0 ? 'Ahead (Faster)' : 'Behind (Slower)'}
                </span>
              </div>
            ) : null}
          </div>

          {/* Grid lines: -maxDelta (faster), 0.0s (equal), +maxDelta (slower) */}
          <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
            <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">-{maxDeltaSec.toFixed(1)}s (Faster)</div>
            <div className="border-b border-white/60 w-full text-[9px] text-white font-mono">0.00s (Equal)</div>
            <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">+{maxDeltaSec.toFixed(1)}s (Slower)</div>
          </div>

          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="deltaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#10b981" stopOpacity="0.05" />
                <stop offset="50%" stopColor="#ef4444" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.45" />
              </linearGradient>
            </defs>
            {deltaTimeArea && <path d={deltaTimeArea} fill="url(#deltaGrad)" />}
            <line x1="0" y1="50" x2="1000" y2="50" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
            <path
              d={deltaTimePath}
              fill="none"
              stroke="#c084fc"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Live Delta Tag at Cursor */}
          {isCursorInView && (
            <div
              className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
                cursorPct < 15 ? 'bottom-2' : 'top-2'
              } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
              style={{ left: `${cursorPct}%` }}
            >
              <span className={`px-2 py-0.5 rounded-md bg-[#070c18] font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
                (currentComparison?.deltaTimeSec ?? 0) <= 0 ? 'border-emerald-400/80 text-emerald-300' : 'border-rose-400/80 text-rose-300'
              }`}>
                Δt: {(currentComparison?.deltaTimeSec ?? 0) <= 0 ? '' : '+'}
                {(currentComparison?.deltaTimeSec ?? 0).toFixed(3)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2. THROTTLE CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[80px] group bg-[#091512]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-emerald-500/20 text-emerald-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3" />
            THROTTLE
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {(currentPoint?.throttle ?? 0).toFixed(1)}%
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
              Base: {currentComparison.baseline.throttle.toFixed(0)}%
            </span>
          )}
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">100%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">50%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">0%</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <path d={throttleArea} fill="url(#throttleGrad)" opacity="0.35" />
          {baselineThrottlePath && (
            <path
              d={baselineThrottlePath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          )}
          <path
            d={throttlePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="throttleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Live Value Tag at Cursor */}
        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className={`px-2 py-0.5 rounded-md bg-[#070c18] font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentPoint?.tcActive ? 'border-amber-400 text-amber-300' : 'border-emerald-400/80 text-emerald-300'
            }`}>
              {(currentPoint?.throttle ?? 0).toFixed(0)}%
              {currentPoint?.tcActive && (
                <span className="text-[9px] font-black px-1 rounded bg-amber-500 text-black ml-1">TC</span>
              )}
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-400/70 text-amber-300 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: {currentComparison.baseline.throttle.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. BRAKE CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[80px] group bg-[#190d11]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-rose-500/20 text-rose-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            BRAKE
          </span>
          <span className="text-xs font-mono font-bold text-rose-400">
            {(currentPoint?.brake ?? 0).toFixed(1)}%
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
              Base: {currentComparison.baseline.brake.toFixed(0)}%
            </span>
          )}
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">100%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">50%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">0%</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <path d={brakeArea} fill="url(#brakeGrad)" opacity="0.35" />
          {baselineBrakePath && (
            <path
              d={baselineBrakePath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          )}
          <path
            d={brakePath}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="brakeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Live Value Tag at Cursor */}
        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className={`px-2 py-0.5 rounded-md bg-[#070c18] font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentPoint?.absActive ? 'border-cyan-400 text-cyan-300' : 'border-rose-400/80 text-rose-300'
            }`}>
              {(currentPoint?.brake ?? 0).toFixed(0)}%
              {currentPoint?.absActive && (
                <span className="text-[9px] font-black px-1 rounded bg-cyan-400 text-black ml-1">ABS</span>
              )}
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-400/70 text-amber-300 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: {currentComparison.baseline.brake.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* 4. STEERING CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[80px] group bg-[#0f0e1d]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Compass className="w-3 h-3" />
            STEERING
          </span>
          <span className="text-xs font-mono font-bold text-indigo-400">
            {Math.abs(currentPoint?.steerYaw ?? 0)}°{' '}
            <span className="text-[10px] text-lmu-muted font-normal">
              {(currentPoint?.steerYaw ?? 0) < -5 ? 'LEFT' : (currentPoint?.steerYaw ?? 0) > 5 ? 'RIGHT' : 'CENTER'}
            </span>
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
              Base: {Math.abs(currentComparison.baseline.steerYaw)}°
            </span>
          )}
        </div>

        {/* Center line & labels */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-indigo-400/30 w-full text-[9px] text-indigo-400">100% LEFT</div>
          <div className="border-b border-indigo-400/60 w-full text-[9px] text-indigo-400">STRAIGHT</div>
          <div className="border-b border-indigo-400/30 w-full text-[9px] text-indigo-400">100% RIGHT</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#6366f1" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
          {baselineSteerPath && (
            <path
              d={baselineSteerPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          )}
          <path
            d={steerPath}
            fill="none"
            stroke="#818cf8"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Live Value Tag at Cursor */}
        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-indigo-300 border border-indigo-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              {Math.abs(currentPoint?.steerYaw ?? 0)}°{' '}
              <span className="text-[9px] font-semibold text-indigo-400/80">
                {(currentPoint?.steerYaw ?? 0) < -5 ? 'LEFT' : (currentPoint?.steerYaw ?? 0) > 5 ? 'RIGHT' : 'CTR'}
              </span>
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-400/70 text-amber-300 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: {Math.abs(currentComparison.baseline.steerYaw)}°
              </span>
            )}
          </div>
        )}
      </div>

      {/* 5. GEAR CHANNEL */}
      <div className="relative flex-1 min-h-[70px] group bg-[#091118]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-cyan-500/20 text-cyan-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Layers className="w-3 h-3" />
            GEAR
          </span>
          <span className="text-xs font-mono font-bold text-cyan-400">
            GEAR {currentPoint?.speedKmh && currentPoint.speedKmh > 5 ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1) : 1}
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
              Base: G{currentComparison.baseline.gear}
            </span>
          )}
          <span className="text-[11px] font-mono text-lmu-muted">
            {currentPoint?.rpm ? `${currentPoint.rpm.toLocaleString()} RPM` : ''}
          </span>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          {baselineGearPath && (
            <path
              d={baselineGearPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          )}
          <path
            d={gearPath}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>

        {/* Live Gear Tag at Cursor */}
        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-cyan-300 border border-cyan-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              GEAR {currentPoint?.speedKmh && currentPoint.speedKmh > 5 ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1) : 1}
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-400/70 text-amber-300 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: G{currentComparison.baseline.gear}
              </span>
            )}
          </div>
        )}
      </div>

      {/* DRAG SELECTION OVERLAY (WHEN DRAGGING TO ZOOM) */}
      {dragSelection && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-40 bg-sky-500/20 border-x-2 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)] backdrop-brightness-110"
          style={{
            left: `${Math.min(dragSelection.startPct, dragSelection.currentPct)}%`,
            width: `${Math.max(0.2, Math.abs(dragSelection.currentPct - dragSelection.startPct))}%`,
          }}
        >
          <div className="absolute top-2 left-1 px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-mono font-bold shadow">
            Zoom
          </div>
        </div>
      )}

      {/* VERTICAL SECTOR 1 DIVIDER (S1 | S2) */}
      {s1Pct !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-30 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${s1Pct}%` }}
        >
          <div className="px-1.5 py-0.5 rounded-b bg-lmu-gold text-black font-mono font-black text-[9px] tracking-wider shadow-[0_2px_8px_rgba(255,183,3,0.5)]">
            S1 | S2
          </div>
          <div className="w-[1.5px] h-full border-l-[1.5px] border-dashed border-lmu-gold/80 shadow-[0_0_8px_rgba(255,183,3,0.3)]" />
        </div>
      )}

      {/* VERTICAL SECTOR 2 DIVIDER (S2 | S3) */}
      {s2Pct !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-30 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${s2Pct}%` }}
        >
          <div className="px-1.5 py-0.5 rounded-b bg-lmu-blue text-white font-mono font-black text-[9px] tracking-wider shadow-[0_2px_8px_rgba(33,158,188,0.5)]">
            S2 | S3
          </div>
          <div className="w-[1.5px] h-full border-l-[1.5px] border-dashed border-lmu-blue/80 shadow-[0_0_8px_rgba(33,158,188,0.3)]" />
        </div>
      )}

      {/* SYNCHRONIZED VERTICAL SCRUBBER CURSOR LINE (ACROSS ALL CHANNELS) */}
      {isCursorInView && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-40 transition-all duration-75"
          style={{ left: `${cursorPct}%` }}
        >
          <div className="w-[1px] h-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] relative">
            <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-white rounded-full shadow-[0_0_8px_#38bdf8]" />
            <div className="absolute -bottom-1 -left-[5px] w-[11px] h-[11px] bg-white rounded-full shadow-[0_0_8px_#38bdf8]" />
          </div>
        </div>
      )}
    </div>
  );
};
