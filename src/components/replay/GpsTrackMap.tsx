import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, Minus, RotateCcw, Crosshair } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { computeCumulativeDistances, interpolatePointAtDistance } from '../../utils/replayComparison.js';

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
  colorBy?: 'speed' | 'throttle' | 'brake' | 'steering' | 'default';
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

  // Interactive zoom & pan states
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followCar, setFollowCar] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  // Project simulation (X, Z) into 800x800 SVG canvas with uniform aspect ratio
  const { svgPoints, currentPos } = useMemo(() => {
    if (!points || points.length === 0) {
      return { svgPoints: [], currentPos: null };
    }

    const { minX, minZ, spanX, spanZ } = bounds;
    const maxSpan = Math.max(spanX, spanZ, 1);
    const scale = (VIEWBOX_SIZE - 2 * PADDING) / maxSpan;

    // Center the track inside the square viewBox
    const offsetX = PADDING + ((VIEWBOX_SIZE - 2 * PADDING) - spanX * scale) / 2;
    const offsetZ = PADDING + ((VIEWBOX_SIZE - 2 * PADDING) - spanZ * scale) / 2;

    const projected = points.map((p, idx) => {
      const sx = offsetX + (p.x - minX) * scale;
      // Invert Z so up corresponds to forward in track perspective
      const sy = VIEWBOX_SIZE - (offsetZ + (p.z - minZ) * scale);
      return {
        ...p,
        sx,
        sy,
        idx,
      };
    });

    const active = projected[Math.min(currentIndex, projected.length - 1)] || projected[0];

    return {
      svgPoints: projected,
      currentPos: active,
    };
  }, [points, bounds, currentIndex]);

  // Dynamic viewBox based on zoomLevel, panOffset, and followCar mode
  const currentViewBox = useMemo(() => {
    if (zoomLevel <= 1 && !followCar && panOffset.x === 0 && panOffset.y === 0) {
      return `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`;
    }
    const visibleSize = VIEWBOX_SIZE / zoomLevel;
    let centerX = VIEWBOX_SIZE / 2;
    let centerY = VIEWBOX_SIZE / 2;

    if (followCar && currentPos) {
      centerX = currentPos.sx;
      centerY = currentPos.sy;
    }
    centerX += panOffset.x;
    centerY += panOffset.y;

    const vx = Math.max(-500, Math.min(1300, centerX - visibleSize / 2));
    const vy = Math.max(-500, Math.min(1300, centerY - visibleSize / 2));
    return `${vx.toFixed(1)} ${vy.toFixed(1)} ${visibleSize.toFixed(1)} ${visibleSize.toFixed(1)}`;
  }, [zoomLevel, followCar, currentPos, panOffset, VIEWBOX_SIZE]);

  // Construct full SVG path data with teleport breaks
  const pathD = useMemo(() => {
    if (svgPoints.length === 0) return '';
    let d = '';
    for (let i = 0; i < svgPoints.length; i++) {
      const p = svgPoints[i];
      if (i === 0) {
        d += `M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
      } else {
        const prev = svgPoints[i - 1];
        const dist = Math.hypot(p.sx - prev.sx, p.sy - prev.sy);
        const worldDist = Math.hypot(p.x - prev.x, p.z - prev.z);
        // Break path across unnatural jumps, teleports, and returns to garage/pits
        if (p.isTeleport || worldDist > 20 || dist > 30) {
          d += ` M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
        } else {
          d += ` L ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
        }
      }
    }
    return d;
  }, [svgPoints]);

  const isStationary = useMemo(() => {
    return ((bounds?.spanX ?? 0) < 25 && (bounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1));
  }, [bounds, points]);

  // Construct baseline SVG path and distance-aligned ghost car position
  const { baselinePathD, baselineGhostPos } = useMemo(() => {
    if (!baselinePoints || baselinePoints.length === 0 || !points || points.length === 0) {
      return { baselinePathD: '', baselineGhostPos: null };
    }

    const { minX, minZ, spanX, spanZ } = bounds;
    const maxSpan = Math.max(spanX, spanZ, 1);
    const scale = (VIEWBOX_SIZE - 2 * PADDING) / maxSpan;
    const offsetX = PADDING + ((VIEWBOX_SIZE - 2 * PADDING) - spanX * scale) / 2;
    const offsetZ = PADDING + ((VIEWBOX_SIZE - 2 * PADDING) - spanZ * scale) / 2;

    let d = '';
    for (let i = 0; i < baselinePoints.length; i++) {
      const p = baselinePoints[i];
      const sx = offsetX + (p.x - minX) * scale;
      const sy = VIEWBOX_SIZE - (offsetZ + (p.z - minZ) * scale);
      if (i === 0) {
        d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      } else {
        const prev = baselinePoints[i - 1];
        const worldDist = Math.hypot(p.x - prev.x, p.z - prev.z);
        if (p.isTeleport || worldDist > 25) {
          d += ` M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        } else {
          d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
      }
    }

    const primaryDists = computeCumulativeDistances(points);
    const baseDists = computeCumulativeDistances(baselinePoints);
    const totalPrimary = Math.max(1, primaryDists[primaryDists.length - 1]);
    const totalBase = Math.max(1, baseDists[baseDists.length - 1]);

    const safeIdx = Math.min(currentIndex, points.length - 1);
    const fraction = primaryDists[safeIdx] / totalPrimary;
    const targetDist = fraction * totalBase;
    const ghostPt = interpolatePointAtDistance(baselinePoints, baseDists, targetDist);

    const ghostSx = offsetX + (ghostPt.x - minX) * scale;
    const ghostSy = VIEWBOX_SIZE - (offsetZ + (ghostPt.z - minZ) * scale);

    return {
      baselinePathD: d,
      baselineGhostPos: {
        sx: ghostSx,
        sy: ghostSy,
        point: ghostPt,
      },
    };
  }, [points, baselinePoints, bounds, currentIndex, VIEWBOX_SIZE, PADDING]);

  // Calculate forward travel heading in SVG degrees (0 deg = straight up along -Y)
  const carHeadingDeg = useMemo(() => {
    if (!svgPoints || svgPoints.length < 2 || currentIndex === undefined) return 0;

    const idx = Math.min(currentIndex, svgPoints.length - 1);
    // Use a 2-frame forward/backward window for smooth curvature along the circuit
    const nextIdx = Math.min(idx + 2, svgPoints.length - 1);
    const prevIdx = Math.max(0, idx - 2);

    const p1 = svgPoints[prevIdx];
    const p2 = svgPoints[nextIdx];

    const dx = p2.sx - p1.sx;
    const dy = p2.sy - p1.sy;

    if (Math.hypot(dx, dy) > 0.4) {
      // In SVG coordinates, atan2(dy, dx) returns angle from +X axis.
      // Rotating from reference vector (0, -1) [straight up] requires +90 degrees.
      return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    }

    return 0;
  }, [svgPoints, currentIndex]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Interactive mouse wheel zooming with non-passive listener to prevent scrolling behind
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        // Zoom in
        setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))));
      } else {
        // Zoom out
        setZoomLevel(z => {
          const next = Math.max(1, Number((z - 0.5).toFixed(1)));
          if (next === 1) {
            setPanOffset({ x: 0, y: 0 });
          }
          return next;
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Click & Drag to pan map
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1 && !followCar) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const factor = (VIEWBOX_SIZE / 800) / zoomLevel;
    const dx = (e.clientX - dragStartRef.current.x) * factor;
    const dy = (e.clientY - dragStartRef.current.y) * factor;
    setPanOffset({
      x: dragStartRef.current.panX - dx,
      y: dragStartRef.current.panY - dy,
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

  // Unified thermal / telemetry color grading
  const getPointColor = (p: ReplayTrajectoryPoint) => {
    if (colorBy === 'throttle') {
      const th = p.throttle || 0;
      if (th > 75) return '#10b981'; // green
      if (th > 20) return '#f59e0b'; // amber
      return '#64748b'; // gray/neutral
    }
    if (colorBy === 'brake') {
      const brk = p.brake || 0;
      if (brk > 50) return '#ef4444'; // red
      if (brk > 10) return '#f97316'; // orange
      return '#64748b';
    }
    if (colorBy === 'speed') {
      const spd = p.speedKmh || 0;
      if (spd > 230) return '#c026d3'; // purple (top speed)
      if (spd > 160) return '#f59e0b'; // amber/orange (high speed)
      if (spd > 90) return '#10b981'; // emerald green (mid speed)
      return '#0284c7'; // blue (apex / low speed)
    }
    if (colorBy === 'steering') {
      const st = p.steerYaw || 0;
      if (st < -25) return '#818cf8'; // indigo (left turn)
      if (st > 25) return '#f97316'; // orange (right turn)
      return '#64748b'; // straight
    }
    return '#3b82f6';
  };

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
      {/* Zoom & Camera Controls Toolbar (Top Right) */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-[#0a0e17]/90 p-1 rounded-lg border border-white/10 backdrop-blur-sm pointer-events-auto">
        <button
          onClick={() => setZoomLevel(z => Math.min(6, Number((z + 0.5).toFixed(1))))}
          aria-label="Zoom in"
          title="Zoom In (+)"
          className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] font-mono font-bold text-white px-1">
          {zoomLevel}x
        </span>

        <button
          onClick={() => {
            setZoomLevel(z => {
              const next = Math.max(1, Number((z - 0.5).toFixed(1)));
              if (next === 1) setPanOffset({ x: 0, y: 0 });
              return next;
            });
          }}
          aria-label="Zoom out"
          title="Zoom Out (-)"
          className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-3 bg-white/10 mx-0.5" />

        <button
          onClick={() => setFollowCar(!followCar)}
          aria-label="Follow car"
          title={followCar ? 'Follow Car: ON' : 'Follow Car: OFF'}
          className={`p-1 rounded transition-colors ${
            followCar ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white hover:bg-white/10'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        {(zoomLevel > 1 || followCar || panOffset.x !== 0 || panOffset.y !== 0) && (
          <button
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
              setFollowCar(false);
            }}
            aria-label="Reset zoom"
            title="Reset to Full Circuit"
            className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <svg
        viewBox={currentViewBox}
        className="w-full h-full drop-shadow-md"
      >
        <defs>
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.9" />
          </filter>
          <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#f59e0b" floodOpacity="0.9" />
          </filter>
          <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base circuit outer track line */}
        <path
          d={pathD}
          fill="none"
          stroke="#1e293b"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inner track surface */}
        <path
          d={pathD}
          fill="none"
          stroke="#334155"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Baseline circuit trajectory overlay (dashed amber line) */}
        {baselinePathD && (
          <path
            d={baselinePathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3.5"
            strokeDasharray="8 6"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
        )}

        {/* Color-coded segments */}
        {svgPoints.map((p, i) => {
          if (i === 0) return null;
          const prev = svgPoints[i - 1];
          const dist = Math.hypot(p.sx - prev.sx, p.sy - prev.sy);
          const worldDist = Math.hypot(p.x - prev.x, p.z - prev.z);
          // Do not draw lines across teleports, returns to garage, or jumps between garage and pits
          if (p.isTeleport || worldDist > 20 || dist > 30) return null;
          return (
            <line
              key={i}
              x1={prev.sx}
              y1={prev.sy}
              x2={p.sx}
              y2={p.sy}
              stroke={getPointColor(p)}
              strokeWidth="4"
              strokeLinecap="round"
              className="hover:stroke-white transition-colors cursor-pointer"
              onClick={() => onSelectIndex?.(p.idx)}
            />
          );
        })}

        {/* Start / Origin Indicator */}
        {svgPoints.length > 0 && (
          <g transform={`translate(${svgPoints[0].sx}, ${svgPoints[0].sy})`}>
            <circle r="6" fill="#facc15" stroke="#000" strokeWidth="2" />
            <text
              y="-10"
              textAnchor="middle"
              className="fill-amber-300 text-[11px] font-bold"
            >
              START
            </text>
          </g>
        )}

        {/* Tether connecting line between primary car and baseline ghost car */}
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

        {/* Baseline Ghost Car Marker */}
        {baselineGhostPos && (
          <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)})`}>
            <circle
              r="12"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
              opacity="0.5"
              className="animate-pulse"
            />
            <circle
              r="6.5"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="2"
              filter="url(#ghostGlow)"
            />
            <text
              y="-10"
              textAnchor="middle"
              className="fill-amber-300 text-[10px] font-mono font-bold"
            >
              GHOST
            </text>
          </g>
        )}

        {/* Current Car Marker */}
        {currentPos && (
          <g transform={`translate(${currentPos.sx}, ${currentPos.sy})`}>
            {/* Pulsing ring */}
            <circle
              r="14"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              className="animate-ping opacity-50"
            />
            {/* Core car dot */}
            <circle
              r="7"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="2.5"
              filter="url(#carGlow)"
            />
            {/* Direction Arrow pointing forward along trajectory */}
            {!isStationary && (
              <g transform={`rotate(${carHeadingDeg.toFixed(1)})`}>
                <line x1="0" y1="0" x2="0" y2="-18" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                <polygon points="0,-26 -6,-16 6,-16" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
              </g>
            )}
          </g>
        )}
      </svg>

      {/* Comparison Ghost Map Legend (Top Left) */}
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

      {/* Real-time telemetry overlay badge */}
      {isStationary && (
        <div className="absolute top-2 left-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
          <span>🅿️ Car Parked in Pit / Garage</span>
        </div>
      )}

      {/* Live Telemetry Badge (Bottom Right) */}
      {currentPos && (
        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-3 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-3 py-1 rounded-lg text-xs font-mono shadow-lg pointer-events-none">
          <div>
            <span className="text-lmu-muted text-[10px]">SPEED: </span>
            <span className="font-bold text-sky-400">{Math.round(currentPos.speedKmh || 0)} km/h</span>
          </div>
          <div>
            <span className="text-lmu-muted text-[10px]">THR: </span>
            <span className="font-bold text-emerald-400">{Math.round(currentPos.throttle || 0)}%</span>
          </div>
          <div>
            <span className="text-lmu-muted text-[10px]">BRK: </span>
            <span className="font-bold text-rose-400">{Math.round(currentPos.brake || 0)}%</span>
          </div>
        </div>
      )}

      {/* Heatmap Legend Bar (Explains speed and inputs) */}
      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] shadow-lg pointer-events-none font-mono">
        {colorBy === 'speed' && (
          <div className="flex items-center gap-1.5 text-lmu-muted">
            <span className="font-bold text-white uppercase">Speed:</span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-[#0284c7]" /> Apex
            </span>
            <span>→</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Mid
            </span>
            <span>→</span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> High
            </span>
            <span>→</span>
            <span className="flex items-center gap-1 text-fuchsia-400">
              <span className="w-2 h-2 rounded-full bg-[#c026d3]" /> Max
            </span>
          </div>
        )}
        {colorBy === 'throttle' && (
          <div className="flex items-center gap-1.5 text-lmu-muted">
            <span className="font-bold text-white uppercase">Throttle:</span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-[#64748b]" /> 0%
            </span>
            <span>→</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" /> 100%
            </span>
          </div>
        )}
        {colorBy === 'brake' && (
          <div className="flex items-center gap-1.5 text-lmu-muted">
            <span className="font-bold text-white uppercase">Brake:</span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-[#64748b]" /> 0%
            </span>
            <span>→</span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> 100%
            </span>
          </div>
        )}
        {colorBy === 'steering' && (
          <div className="flex items-center gap-1.5 text-lmu-muted">
            <span className="font-bold text-white uppercase">Steering:</span>
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-[#818cf8]" /> Left
            </span>
            <span>|</span>
            <span className="text-slate-400">Center</span>
            <span>|</span>
            <span className="flex items-center gap-1 text-orange-400">
              <span className="w-2 h-2 rounded-full bg-[#f97316]" /> Right
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
