import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Navigation, Plus, Minus, RotateCcw } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeCumulativeDistances, computeLapComparisons, findIndexAtDistance, interpolatePointAtDistance } from '../../utils/replayComparison.js';
import { getHeatmapColor, MapColorMode } from './replayMapUtils.js';

export interface GpsZoomMapProps {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex?: (index: number) => void;
  colorBy?: MapColorMode;
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
  primaryOpacity?: number;
  baselineOpacity?: number;
}

export const GpsZoomMap: React.FC<GpsZoomMapProps> = ({
  points,
  currentIndex,
  onSelectIndex,
  colorBy = 'speed',
  className = '',
  baselinePoints,
  primaryOpacity = 1,
  baselineOpacity = 1,
}) => {
  const VIEWBOX_SIZE = 600;
  const CENTER = VIEWBOX_SIZE / 2;

  const [zoomRadius, setZoomRadius] = useState<number>(80);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoomRadius(r => Math.max(15, Math.round(r * 0.85)));
      } else {
        setZoomRadius(r => Math.min(300, Math.round(r * 1.18)));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    setPanOffset({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const safeIndex = Math.max(0, Math.min(currentIndex, points.length - 1));
  const currentPoint = points[safeIndex];

  // Per-point time delta vs baseline, only computed when the delta heatmap mode is active.
  const deltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !baselinePoints || baselinePoints.length === 0) return null;
    return computeLapComparisons(points, baselinePoints).map(c => c.deltaTimeSec);
  }, [colorBy, points, baselinePoints]);

  const { visibleSegments, carHeadingDeg } = useMemo(() => {
    if (!points || points.length === 0 || !currentPoint) return { visibleSegments: [], carHeadingDeg: 0 };
    const scale = (CENTER - 40) / zoomRadius;
    const windowSize = Math.max(50, Math.min(160, Math.round(zoomRadius * 1.2)));
    const minFrame = Math.max(0, safeIndex - windowSize);
    const maxFrame = Math.min(points.length - 1, safeIndex + windowSize);
    const segments: Array<{ pathD: string; color: string; avgSpeed: number; idx: number }> = [];

    for (let i = minFrame; i < maxFrame; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const worldDist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if ((p2.isTeleport && worldDist > 30) || worldDist > 75) continue;
      const sx1 = CENTER + (p1.x - currentPoint.x) * scale;
      const sy1 = CENTER - (p1.z - currentPoint.z) * scale;
      const sx2 = CENTER + (p2.x - currentPoint.x) * scale;
      const sy2 = CENTER - (p2.z - currentPoint.z) * scale;
      segments.push({
        pathD: `M ${sx1.toFixed(1)} ${sy1.toFixed(1)} L ${sx2.toFixed(1)} ${sy2.toFixed(1)}`,
        color: getHeatmapColor(p2, colorBy, deltaByIdx ? deltaByIdx[i + 1] : undefined),
        avgSpeed: Math.round(((p1.speedKmh || 0) + (p2.speedKmh || 0)) / 2),
        idx: i + 1,
      });
    }

    let heading = 0;
    const prevIdx = Math.max(0, safeIndex - 2);
    const nextIdx = Math.min(points.length - 1, safeIndex + 2);
    if (nextIdx > prevIdx) {
      const dx = (points[nextIdx].x - points[prevIdx].x) * scale;
      const dy = -(points[nextIdx].z - points[prevIdx].z) * scale;
      if (Math.hypot(dx, dy) > 0.5) heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    }
    return { visibleSegments: segments, carHeadingDeg: heading };
  }, [points, currentPoint, safeIndex, zoomRadius, colorBy, deltaByIdx, CENTER]);

  const primaryDists = useMemo(() => computeCumulativeDistances(points), [points]);
  const baseDists = useMemo(() => computeCumulativeDistances(baselinePoints || []), [baselinePoints]);

  // Rescales each baseline point's own delta (matched by relative track position) so the
  // baseline line can share the exact same delta heatmap as the primary line.
  const baselineDeltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !deltaByIdx || !baselinePoints || baselinePoints.length === 0) return null;
    const totalPrimaryDist = primaryDists[primaryDists.length - 1] || 0;
    const totalBaselineDist = baseDists[baseDists.length - 1] || 0;
    const canRescale = totalPrimaryDist > 0 && totalBaselineDist > 0;
    return baseDists.map(d => {
      const targetDist = canRescale ? (d / totalBaselineDist) * totalPrimaryDist : d;
      const idx = findIndexAtDistance(primaryDists, targetDist);
      return deltaByIdx[Math.min(idx, deltaByIdx.length - 1)];
    });
  }, [colorBy, deltaByIdx, baselinePoints, baseDists, primaryDists]);

  const { baselineSegments, baselineGhostPos } = useMemo(() => {
    if (!baselinePoints || baselinePoints.length === 0 || !points || points.length === 0 || !currentPoint || baseDists.length === 0 || primaryDists.length === 0) {
      return { baselineSegments: [] as Array<{ pathD: string; color: string }>, baselineGhostPos: null };
    }
    const scale = (CENTER - 40) / zoomRadius;
    const maxVisibleDist = zoomRadius * 1.6;
    const totalPrimary = Math.max(1, primaryDists[primaryDists.length - 1]);
    const totalBase = Math.max(1, baseDists[baseDists.length - 1]);
    const fraction = primaryDists[safeIndex] / totalPrimary;
    const targetDist = fraction * totalBase;
    const ghostPt = interpolatePointAtDistance(baselinePoints, baseDists, targetDist);

    let low = 0, high = baseDists.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (baseDists[mid] < targetDist) low = mid + 1; else high = mid - 1;
    }
    const win = Math.max(60, Math.round(zoomRadius * 1.5));
    const startB = Math.max(0, low - win);
    const endB = Math.min(baselinePoints.length, low + win);

    const segments: Array<{ pathD: string; color: string }> = [];
    for (let i = Math.max(1, startB); i < endB; i++) {
      const bp1 = baselinePoints[i - 1];
      const bp2 = baselinePoints[i];
      const dist1 = Math.hypot(bp1.x - currentPoint.x, bp1.z - currentPoint.z);
      const dist2 = Math.hypot(bp2.x - currentPoint.x, bp2.z - currentPoint.z);
      if (dist1 > maxVisibleDist && dist2 > maxVisibleDist) continue;
      const stepDist = Math.hypot(bp2.x - bp1.x, bp2.z - bp1.z);
      if (bp2.isTeleport || stepDist > 25) continue;
      const sx1 = CENTER + (bp1.x - currentPoint.x) * scale;
      const sy1 = CENTER - (bp1.z - currentPoint.z) * scale;
      const sx2 = CENTER + (bp2.x - currentPoint.x) * scale;
      const sy2 = CENTER - (bp2.z - currentPoint.z) * scale;
      segments.push({
        pathD: `M ${sx1.toFixed(1)} ${sy1.toFixed(1)} L ${sx2.toFixed(1)} ${sy2.toFixed(1)}`,
        color: getHeatmapColor(bp2, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[i] : undefined),
      });
    }

    return {
      baselineSegments: segments,
      baselineGhostPos: {
        sx: CENTER + (ghostPt.x - currentPoint.x) * scale,
        sy: CENTER - (ghostPt.z - currentPoint.z) * scale,
        distMeters: Math.hypot(ghostPt.x - currentPoint.x, ghostPt.z - currentPoint.z),
        point: ghostPt,
      },
    };
  }, [points, baselinePoints, currentPoint, safeIndex, zoomRadius, CENTER, primaryDists, baseDists, colorBy, baselineDeltaByIdx]);

  if (!points || points.length === 0 || !currentPoint) {
    return (
      <div className={`flex items-center justify-center h-48 text-lmu-muted text-xs ${className}`}>
        No GPS telemetry points available.
      </div>
    );
  }

  const scale = (CENTER - 40) / zoomRadius;
  const ring1Dist = zoomRadius <= 30 ? 10 : zoomRadius <= 60 ? 15 : zoomRadius <= 120 ? 25 : 50;
  const ring2Dist = zoomRadius <= 30 ? 20 : zoomRadius <= 60 ? 30 : zoomRadius <= 120 ? 50 : 100;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative flex flex-col bg-[#060910] rounded-xl border border-lmu-border/70 overflow-hidden overscroll-contain touch-none select-none ${
        panOffset.x !== 0 || panOffset.y !== 0 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      } ${className}`}
    >
      <div className="absolute top-2 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#0a0e17]/90 px-2 py-1 rounded-lg border border-white/10 backdrop-blur-sm pointer-events-auto">
          <Navigation className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">
            Apex Detail ({zoomRadius}m)
          </span>
          {baselineGhostPos && (
            <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold">
              Ghost: {baselineGhostPos.distMeters.toFixed(1)}m
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-[#0a0e17]/90 p-0.5 rounded-lg border border-white/10 backdrop-blur-sm pointer-events-auto">
          <button onClick={() => setZoomRadius(r => Math.max(15, Math.round(r * 0.8)))} aria-label="Zoom in" title="Zoom in closer (+)" className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => setZoomRadius(r => Math.min(300, Math.round(r * 1.25)))} aria-label="Zoom out" title="Zoom out wider (-)" className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
          <div className="w-[1px] h-3 bg-white/10 mx-0.5" />
          {[40, 80, 150].map(r => (
            <button key={r} onClick={() => { setZoomRadius(r); setPanOffset({ x: 0, y: 0 }); }} className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${zoomRadius === r ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'}`}>{r}m</button>
          ))}
          {(panOffset.x !== 0 || panOffset.y !== 0) && (
            <button onClick={() => setPanOffset({ x: 0, y: 0 })} aria-label="Recenter" title="Recenter view on car" className="p-1 rounded text-cyan-400 hover:text-white hover:bg-white/10 transition-colors"><RotateCcw className="w-3 h-3" /></button>
          )}
        </div>
      </div>

      <div className="w-full h-full flex-1 min-h-0 flex items-center justify-center p-1">
        <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="w-full h-full drop-shadow-md" preserveAspectRatio="xMidYMid meet">
          <g transform={panOffset.x !== 0 || panOffset.y !== 0 ? `translate(${panOffset.x.toFixed(1)}, ${panOffset.y.toFixed(1)})` : undefined}>
            <circle cx={CENTER} cy={CENTER} r={ring1Dist * scale} fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.2" />
            <text x={CENTER + ring1Dist * scale + 4} y={CENTER + 3} fill="#38bdf8" fontSize="9" fontFamily="monospace" opacity="0.4">{ring1Dist}m</text>
            <circle cx={CENTER} cy={CENTER} r={ring2Dist * scale} fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.15" />
            <text x={CENTER + ring2Dist * scale + 4} y={CENTER + 3} fill="#38bdf8" fontSize="9" fontFamily="monospace" opacity="0.3">{ring2Dist}m</text>
            <line x1={CENTER - 15} y1={CENTER} x2={CENTER + 15} y2={CENTER} stroke="#ffffff" strokeWidth="0.8" opacity="0.25" />
            <line x1={CENTER} y1={CENTER - 15} x2={CENTER} y2={CENTER + 15} stroke="#ffffff" strokeWidth="0.8" opacity="0.25" />
            <g opacity={primaryOpacity}>
              {visibleSegments.map((seg, i) => (
                <path
                  key={`line-${i}`} d={seg.pathD} stroke={seg.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
                  className="cursor-pointer hover:stroke-white hover:stroke-[6]" onClick={() => onSelectIndex?.(seg.idx)}
                >
                  <title>Frame {seg.idx} • {seg.avgSpeed} km/h</title>
                </path>
              ))}
            </g>
            <g data-track-line="baseline" pointerEvents="none">
              {baselineSegments.map((seg, i) => (
                <path
                  key={`baseline-${i}`}
                  d={seg.pathD}
                  stroke={seg.color}
                  strokeWidth="5"
                  strokeDasharray="10 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={baselineOpacity}
                />
              ))}
            </g>
            {baselineGhostPos && (
              <line x1={CENTER} y1={CENTER} x2={baselineGhostPos.sx} y2={baselineGhostPos.sy} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" opacity={0.75 * baselineOpacity} />
            )}
            {baselineGhostPos && (
              <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)})`} opacity={baselineOpacity}>
                <circle r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" className="animate-pulse" />
                <circle r="6.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" opacity="0.95" />
                <text y="-10" textAnchor="middle" className="fill-amber-300 text-[10px] font-mono font-bold">GHOST ({baselineGhostPos.distMeters.toFixed(1)}m)</text>
              </g>
            )}
            <g transform={`translate(${CENTER}, ${CENTER})`}>
              <circle r="14" fill="#38bdf8" opacity="0.15" className="animate-ping" />
              <circle r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" className="shadow-[0_0_10px_#38bdf8]" />
              <g transform={`rotate(${carHeadingDeg})`}>
                <polygon points="0,-16 5,-6 -5,-6" fill="#facc15" stroke="#000000" strokeWidth="0.8" />
              </g>
            </g>
          </g>
        </svg>
      </div>

      <div className="absolute bottom-2 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none text-[10px] font-mono">
        <div className="flex items-center gap-2 bg-[#0a0e17]/90 px-2 py-0.5 rounded border border-white/10 text-white font-bold backdrop-blur-sm">
          <span>{currentPoint.speedKmh ?? 0} km/h</span>
        </div>
        <span className="bg-[#0a0e17]/90 px-2 py-0.5 rounded border border-white/10 text-indigo-400 font-bold backdrop-blur-sm">
          {Math.abs(currentPoint.steerYaw ?? 0)}° {(currentPoint.steerYaw ?? 0) < -5 ? 'LEFT' : (currentPoint.steerYaw ?? 0) > 5 ? 'RIGHT' : 'CTR'}
        </span>
      </div>
    </div>
  );
};
