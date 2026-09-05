import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeCumulativeDistances } from '../../utils/replayComparison.js';
import {
  getHeatmapColor,
  MapColorMode,
  projectTrajectoryPoints,
  buildContinuousSvgPath,
  computeBaselinePath,
  computeGhostPosition,
} from './replayMapUtils.js';
import { MapControlsOverlay } from './MapControlsOverlay.js';
import { HeatmapLegendBar } from './HeatmapLegendBar.js';

export interface GpsTrackMapProps {
  points: ReplayTrajectoryPoint[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  currentIndex: number;
  onSelectIndex?: (index: number) => void;
  colorBy?: MapColorMode;
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
}

export const GpsTrackMap: React.FC<GpsTrackMapProps> = ({
  points,
  bounds,
  currentIndex,
  onSelectIndex,
  colorBy = 'speed',
  className = '',
  baselinePoints,
}) => {
  const VIEWBOX_SIZE = 800;
  const PADDING = 60;

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followCar, setFollowCar] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  const svgPoints = useMemo(
    () => projectTrajectoryPoints(points, bounds, VIEWBOX_SIZE, PADDING),
    [points, bounds]
  );
  const currentPos = svgPoints[Math.min(currentIndex, svgPoints.length - 1)] || svgPoints[0];

  const currentViewBox = useMemo(() => {
    if (zoomLevel <= 1 && !followCar && panOffset.x === 0 && panOffset.y === 0) {
      return `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`;
    }
    const visibleSize = VIEWBOX_SIZE / zoomLevel;
    let centerX = (followCar && currentPos ? currentPos.sx : VIEWBOX_SIZE / 2) + panOffset.x;
    let centerY = (followCar && currentPos ? currentPos.sy : VIEWBOX_SIZE / 2) + panOffset.y;
    const vx = Math.max(-500, Math.min(1300, centerX - visibleSize / 2));
    const vy = Math.max(-500, Math.min(1300, centerY - visibleSize / 2));
    return `${vx.toFixed(1)} ${vy.toFixed(1)} ${visibleSize.toFixed(1)} ${visibleSize.toFixed(1)}`;
  }, [zoomLevel, followCar, currentPos, panOffset]);

  const pathD = useMemo(() => buildContinuousSvgPath(svgPoints), [svgPoints]);

  const isStationary = useMemo(() => {
    return ((bounds?.spanX ?? 0) < 25 && (bounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1));
  }, [bounds, points]);

  const primaryDists = useMemo(() => computeCumulativeDistances(points), [points]);
  const baselineDists = useMemo(() => computeCumulativeDistances(baselinePoints || []), [baselinePoints]);

  const baselinePathD = useMemo(
    () => computeBaselinePath(baselinePoints || [], bounds, VIEWBOX_SIZE, PADDING),
    [baselinePoints, bounds]
  );

  const baselineGhostPos = useMemo(
    () => computeGhostPosition(primaryDists, baselineDists, baselinePoints || [], currentIndex, bounds, VIEWBOX_SIZE, PADDING),
    [primaryDists, baselineDists, baselinePoints, currentIndex, bounds]
  );

  const carHeadingDeg = useMemo(() => {
    if (!svgPoints || svgPoints.length < 2 || currentIndex === undefined) return 0;
    const idx = Math.min(currentIndex, svgPoints.length - 1);
    const p1 = svgPoints[Math.max(0, idx - 2)];
    const p2 = svgPoints[Math.min(idx + 2, svgPoints.length - 1)];
    const dx = p2.sx - p1.sx;
    const dy = p2.sy - p1.sy;
    return Math.hypot(dx, dy) > 0.4 ? (Math.atan2(dy, dx) * 180) / Math.PI + 90 : 0;
  }, [svgPoints, currentIndex]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))));
      } else {
        setZoomLevel(z => {
          const next = Math.max(1, Number((z - 0.5).toFixed(1)));
          if (next === 1) setPanOffset({ x: 0, y: 0 });
          return next;
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1 && !followCar) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const factor = (VIEWBOX_SIZE / 800) / zoomLevel;
    setPanOffset({
      x: dragStartRef.current.panX - (e.clientX - dragStartRef.current.x) * factor,
      y: dragStartRef.current.panY - (e.clientY - dragStartRef.current.y) * factor,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-lmu-muted text-sm ${className}`}>
        No GPS trajectory data available for this replay recording.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none ${
        zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      } ${className}`}
    >
      <MapControlsOverlay
        onZoomIn={() => setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))))}
        onZoomOut={() => setZoomLevel(z => {
          const next = Math.max(1, Number((z - 0.5).toFixed(1)));
          if (next === 1) setPanOffset({ x: 0, y: 0 });
          return next;
        })}
        onReset={() => {
          setZoomLevel(1);
          setPanOffset({ x: 0, y: 0 });
          setFollowCar(false);
        }}
        zoomDisplay={`${zoomLevel}x`}
        followCar={followCar}
        onToggleFollowCar={() => setFollowCar(f => !f)}
        className="top-2 right-2 bottom-auto"
      />

      <svg viewBox={currentViewBox} className="w-full h-full drop-shadow-md">
        <defs>
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.9" />
          </filter>
          <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#f59e0b" floodOpacity="0.9" />
          </filter>
        </defs>

        <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#334155" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

        {baselinePathD && (
          <path d={baselinePathD} fill="none" stroke="#f59e0b" strokeWidth="3.5" strokeDasharray="8 6" strokeOpacity="0.85" strokeLinecap="round" />
        )}

        {svgPoints.map((p, i) => {
          if (i === 0) return null;
          const prev = svgPoints[i - 1];
          if (p.isTeleport || Math.hypot(p.x - prev.x, p.z - prev.z) > 20 || Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 30) return null;
          return (
            <line
              key={i}
              x1={prev.sx}
              y1={prev.sy}
              x2={p.sx}
              y2={p.sy}
              stroke={getHeatmapColor(p, colorBy)}
              strokeWidth="4"
              strokeLinecap="round"
              className="hover:stroke-white transition-colors cursor-pointer"
              onClick={() => onSelectIndex?.(p.idx)}
            />
          );
        })}

        {svgPoints.length > 0 && (
          <g transform={`translate(${svgPoints[0].sx}, ${svgPoints[0].sy})`}>
            <circle r="6" fill="#facc15" stroke="#000" strokeWidth="2" />
            <text y="-10" textAnchor="middle" className="fill-amber-300 text-[11px] font-bold">START</text>
          </g>
        )}

        {currentPos && baselineGhostPos && (
          <line
            x1={currentPos.sx}
            y1={currentPos.sy}
            x2={baselineGhostPos.sx}
            y2={baselineGhostPos.sy}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.75"
          />
        )}

        {baselineGhostPos && (
          <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)})`}>
            <circle r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" className="animate-pulse" />
            <circle r="6.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" filter="url(#ghostGlow)" />
            <text y="-10" textAnchor="middle" className="fill-amber-300 text-[10px] font-mono font-bold">GHOST</text>
          </g>
        )}

        {currentPos && (
          <g transform={`translate(${currentPos.sx}, ${currentPos.sy})`}>
            <circle r="14" fill="none" stroke="#38bdf8" strokeWidth="2" className="animate-ping opacity-50" />
            <circle r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2.5" filter="url(#carGlow)" />
            {!isStationary && (
              <g transform={`rotate(${carHeadingDeg.toFixed(1)})`}>
                <line x1="0" y1="0" x2="0" y2="-18" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                <polygon points="0,-26 -6,-16 6,-16" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
              </g>
            )}
          </g>
        )}
      </svg>

      {baselineGhostPos && !isStationary && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono shadow-lg pointer-events-none">
          <div className="flex items-center gap-1 text-sky-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]" />
            <span className="font-bold">Primary</span>
          </div>
          <span className="text-white/30">|</span>
          <div className="flex items-center gap-1 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" />
            <span className="font-bold">Ghost Lap</span>
          </div>
        </div>
      )}

      {isStationary && (
        <div className="absolute top-2 left-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
          <span>🅿️ Car Parked in Pit / Garage</span>
        </div>
      )}

      {currentPos && (
        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-3 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-3 py-1 rounded-lg text-xs font-mono shadow-lg pointer-events-none">
          <div><span className="text-lmu-muted text-[10px]">SPEED: </span><span className="font-bold text-sky-400">{Math.round(currentPos.speedKmh || 0)} km/h</span></div>
          <div><span className="text-lmu-muted text-[10px]">THR: </span><span className="font-bold text-emerald-400">{Math.round(currentPos.throttle || 0)}%</span></div>
          <div><span className="text-lmu-muted text-[10px]">BRK: </span><span className="font-bold text-rose-400">{Math.round(currentPos.brake || 0)}%</span></div>
        </div>
      )}

      <HeatmapLegendBar colorBy={colorBy} />
    </div>
  );
};
