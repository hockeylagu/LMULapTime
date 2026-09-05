import React from 'react';
import { Compass, Layers } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../server/types.js';
import { PointComparison } from '../../utils/replayComparison.js';

export interface TelemetrySteerGearChannelProps {
  steerPath: string;
  baselineSteerPath?: string;
  gearPath: string;
  baselineGearPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySteerGearChannel: React.FC<TelemetrySteerGearChannelProps> = ({
  steerPath,
  baselineSteerPath,
  gearPath,
  baselineGearPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const currentGear = currentPoint?.speedKmh && currentPoint.speedKmh > 5
    ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1)
    : 1;

  return (
    <>
      {/* STEERING ANGLE CHANNEL */}
      <div className="relative flex-1 border-b border-lmu-border/40 min-h-[75px] group bg-[#0e0f1e]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Compass className="w-3 h-3" />
            STEERING
          </span>
          <span className="text-xs font-mono font-bold text-indigo-300">
            {Math.abs(currentPoint?.steerYaw ?? 0)}° {(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
              Base: {Math.abs(currentComparison.baseline.steerYaw)}° {currentComparison.baseline.steerYaw < -5 ? 'L' : currentComparison.baseline.steerYaw > 5 ? 'R' : 'C'}
            </span>
          )}
        </div>

        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-indigo-400/40 w-full text-[9px] text-indigo-400">+180° (Right)</div>
          <div className="border-b border-indigo-400/40 w-full text-[9px] text-indigo-400">0° (Center)</div>
          <div className="border-b border-indigo-400/40 w-full text-[9px] text-indigo-400">-180° (Left)</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#818cf8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.3" />
          {baselineSteerPath && (
            <path d={baselineSteerPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
          )}
          <path d={steerPath} fill="none" stroke="#818cf8" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-indigo-300 border border-indigo-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              {Math.abs(currentPoint?.steerYaw ?? 0)}° {(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}
            </span>
          </div>
        )}
      </div>

      {/* GEAR CHANNEL */}
      <div className="relative flex-1 min-h-[70px] group bg-[#110e1a]/50">
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
          <span className="p-1 rounded bg-amber-500/20 text-amber-400 font-black text-[10px] tracking-wider flex items-center gap-1">
            <Layers className="w-3 h-3" />
            GEAR
          </span>
          <span className="text-xs font-mono font-bold text-amber-400">
            {currentGear}
          </span>
          {currentComparison && (
            <span className="text-[11px] font-mono text-amber-300/80 ml-1 pl-2 border-l border-white/10">
              Base: {currentComparison.baseline.gear}
            </span>
          )}
        </div>

        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-amber-400/40 w-full text-[9px] text-amber-400">7</div>
          <div className="border-b border-amber-400/40 w-full text-[9px] text-amber-400">4</div>
          <div className="border-b border-amber-400/40 w-full text-[9px] text-amber-400">1</div>
        </div>

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          {baselineGearPath && (
            <path d={baselineGearPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
          )}
          <path d={gearPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 transition-all duration-75 flex items-center gap-1 ${
              cursorPct < 15 ? 'bottom-2' : 'top-2'
            } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className="px-2 py-0.5 rounded-md bg-[#070c18] text-amber-300 border border-amber-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              Gear {currentGear}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
