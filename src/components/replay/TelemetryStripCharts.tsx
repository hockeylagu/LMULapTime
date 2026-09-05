import React, { useMemo, useRef, useCallback } from 'react';
import { Gauge, Activity, Zap, Compass, Layers } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';

export interface TelemetryStripChartsProps {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  sectors?: {
    s1Frame: number;
    s2Frame: number;
  };
  className?: string;
}

export const TelemetryStripCharts: React.FC<TelemetryStripChartsProps> = ({
  points,
  currentIndex,
  onSelectIndex,
  sectors,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const safeIndex = Math.max(0, Math.min(currentIndex, points.length - 1));
  const currentPoint = points[safeIndex];

  // Mouse scrubbing handler
  const handlePointerSeek = useCallback(
    (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || points.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const ratio = x / rect.width;
      const newIdx = Math.round(ratio * (points.length - 1));
      onSelectIndex(newIdx);
    },
    [points.length, onSelectIndex]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointerSeek(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      handlePointerSeek(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Pre-calculate SVG paths normalized to [0, 1000] width and [0, 100] height per chart
  const { speedPath, throttlePath, throttleArea, brakePath, brakeArea, steerPath, gearPath } = useMemo(() => {
    if (points.length === 0) {
      return {
        speedPath: '',
        throttlePath: '',
        throttleArea: '',
        brakePath: '',
        brakeArea: '',
        steerPath: '',
        gearPath: '',
      };
    }

    const n = points.length;
    const maxSpd = Math.max(260, ...points.map(p => p.speedKmh || 0));

    let spd = '';
    let thr = '';
    let brk = '';
    let str = '';
    let gr = '';

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const x = (i / (n - 1)) * 1000;

      // Speed (0 to maxSpd km/h -> 95 to 10 in SVG Y)
      const spdNorm = Math.min(1, Math.max(0, (p.speedKmh || 0) / maxSpd));
      const sy = 95 - spdNorm * 85;
      spd += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${sy.toFixed(1)} `;

      // Throttle (0 to 100% -> 95 to 10 in SVG Y)
      const thrNorm = Math.min(1, Math.max(0, (p.throttle || 0) / 100));
      const ty = 95 - thrNorm * 85;
      thr += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ty.toFixed(1)} `;

      // Brake (0 to 100% -> 95 to 10 in SVG Y)
      const brkNorm = Math.min(1, Math.max(0, (p.brake || 0) / 100));
      const by = 95 - brkNorm * 85;
      brk += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${by.toFixed(1)} `;

      // Steering (-180 to +180 deg -> 10 to 90, center at 50)
      const st = Math.min(180, Math.max(-180, p.steerYaw || 0));
      // Left turn (negative) goes UP (toward 10), right turn (positive) goes DOWN (toward 90)
      const sty = 50 + (st / 180) * 40;
      str += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${sty.toFixed(1)} `;

      // Gear (1 to 7 -> 90 to 15 in SVG Y)
      const gear = Math.min(7, Math.max(1, p.speedKmh && p.speedKmh > 5 ? Math.min(7, Math.floor(p.speedKmh / 38) + 1) : 1));
      const gy = 95 - (gear / 7) * 80;
      if (i === 0) {
        gr += `M ${x.toFixed(1)} ${gy.toFixed(1)} `;
      } else {
        const prevP = points[i - 1];
        const prevGear = Math.min(7, Math.max(1, prevP.speedKmh && prevP.speedKmh > 5 ? Math.min(7, Math.floor(prevP.speedKmh / 38) + 1) : 1));
        const prevGy = 95 - (prevGear / 7) * 80;
        gr += `L ${x.toFixed(1)} ${prevGy.toFixed(1)} L ${x.toFixed(1)} ${gy.toFixed(1)} `;
      }
    }

    const thrArea = `${thr} L 1000 95 L 0 95 Z`;
    const brkArea = `${brk} L 1000 95 L 0 95 Z`;

    return {
      speedPath: spd,
      throttlePath: thr,
      throttleArea: thrArea,
      brakePath: brk,
      brakeArea: brkArea,
      steerPath: str,
      gearPath: gr,
    };
  }, [points]);

  // Cursor position percentage [0, 100]
  const cursorPct = points.length > 1 ? (safeIndex / (points.length - 1)) * 100 : 0;

  // Sector split boundaries [0, 100]
  const s1Pct =
    sectors && points.length > 1 && sectors.s1Frame > 0 && sectors.s1Frame < points.length
      ? (sectors.s1Frame / (points.length - 1)) * 100
      : null;
  const s2Pct =
    sectors && points.length > 1 && sectors.s2Frame > 0 && sectors.s2Frame < points.length
      ? (sectors.s2Frame / (points.length - 1)) * 100
      : null;

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
      className={`relative select-none flex flex-col justify-between h-full bg-[#0a0e17] rounded-2xl border border-lmu-border/70 overflow-hidden cursor-crosshair ${className}`}
    >
      {/* SECTOR INDICATOR ZONES BANNER */}
      {s1Pct !== null && s2Pct !== null && (
        <div className="absolute top-0 left-0 right-0 h-4 z-20 pointer-events-none flex text-[8px] sm:text-[9px] font-mono font-bold tracking-wider">
          <div
            style={{ width: `${s1Pct}%` }}
            className="h-full border-r border-lmu-gold/40 bg-lmu-gold/10 text-lmu-gold flex items-center justify-center truncate px-1"
          >
            SECTOR 1
          </div>
          <div
            style={{ width: `${s2Pct - s1Pct}%` }}
            className="h-full border-r border-lmu-blue/40 bg-lmu-blue/10 text-lmu-blue flex items-center justify-center truncate px-1"
          >
            SECTOR 2
          </div>
          <div
            style={{ width: `${100 - s2Pct}%` }}
            className="h-full bg-lmu-green/10 text-lmu-green flex items-center justify-center truncate px-1"
          >
            SECTOR 3
          </div>
        </div>
      )}
      {/* 1. SPEED CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[90px] group bg-[#0b101d]/60">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-sky-500/20 text-sky-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            SPEED
          </span>
          <span className="text-xs font-mono font-bold text-white">
            {currentPoint?.speedKmh ?? 0} <span className="text-[10px] font-normal text-lmu-muted">km/h</span>
          </span>
        </div>

        {/* Speed horizontal grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">250 km/h</div>
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">125 km/h</div>
          <div className="border-b border-sky-400/40 w-full text-[9px] text-sky-400">0 km/h</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
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
        <div
          className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-sky-300 border border-sky-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {currentPoint?.speedKmh ?? 0} <span className="text-[9px] font-normal text-sky-400/70">km/h</span>
          </span>
        </div>
      </div>

      {/* 2. THROTTLE CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#091512]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-emerald-500/20 text-emerald-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3" />
            THROTTLE
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {(currentPoint?.throttle ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">100%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">50%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">0%</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <path d={throttleArea} fill="url(#throttleGrad)" opacity="0.35" />
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
        <div
          className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
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
        </div>
      </div>

      {/* 3. BRAKE CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#190d11]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-rose-500/20 text-rose-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            BRAKE
          </span>
          <span className="text-xs font-mono font-bold text-rose-400">
            {(currentPoint?.brake ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">100%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">50%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">0%</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <path d={brakeArea} fill="url(#brakeGrad)" opacity="0.35" />
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
        <div
          className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
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
        </div>
      </div>

      {/* 4. STEERING CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#0f0e1d]/50">
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
        </div>

        {/* Center line & labels */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-indigo-400/30 w-full text-[9px] text-indigo-400">100% LEFT</div>
          <div className="border-b border-indigo-400/60 w-full text-[9px] text-indigo-400">STRAIGHT</div>
          <div className="border-b border-indigo-400/30 w-full text-[9px] text-indigo-400">100% RIGHT</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#6366f1" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
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
        <div
          className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
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
        </div>
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
          <span className="text-[11px] font-mono text-lmu-muted">
            {currentPoint?.rpm ? `${currentPoint.rpm.toLocaleString()} RPM` : ''}
          </span>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
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
        <div
          className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-cyan-300 border border-cyan-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            GEAR {currentPoint?.speedKmh && currentPoint.speedKmh > 5 ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1) : 1}
          </span>
        </div>
      </div>

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
      <div
        className="absolute top-0 bottom-0 pointer-events-none z-40 transition-all duration-75"
        style={{ left: `${cursorPct}%` }}
      >
        <div className="w-[1px] h-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] relative">
          <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-white rounded-full shadow-[0_0_8px_#38bdf8]" />
          <div className="absolute -bottom-1 -left-[5px] w-[11px] h-[11px] bg-white rounded-full shadow-[0_0_8px_#38bdf8]" />
        </div>
      </div>
    </div>
  );
};
