import React, { useMemo } from 'react';
import { Activity, Zap } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../server/types.js';
import { PointComparison } from '../../utils/replayComparison.js';

export interface TelemetryPedalsChannelProps {
  throttlePath: string;
  throttleArea: string;
  baselineThrottlePath?: string;
  brakePath: string;
  brakeArea: string;
  baselineBrakePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryPedalsChannel: React.FC<TelemetryPedalsChannelProps> = React.memo(({
  throttlePath,
  throttleArea,
  baselineThrottlePath,
  brakePath,
  brakeArea,
  baselineBrakePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const throttleSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="throttleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={throttleArea} fill="url(#throttleGrad)" opacity="0.35" />
      {baselineThrottlePath && (
        <path d={baselineThrottlePath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      <path d={throttlePath} fill="none" stroke="#10b981" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ), [throttleArea, baselineThrottlePath, throttlePath]);

  const brakeSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="brakeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={brakeArea} fill="url(#brakeGrad)" opacity="0.35" />
      {baselineBrakePath && (
        <path d={baselineBrakePath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      <path d={brakePath} fill="none" stroke="#ef4444" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ), [brakeArea, baselineBrakePath, brakePath]);

  return (
    <>
      {/* THROTTLE CHANNEL */}
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

        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">100%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">50%</div>
          <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400">0%</div>
        </div>

        {throttleSvg}

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
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

      {/* BRAKE CHANNEL */}
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

        <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">100%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">50%</div>
          <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400">0%</div>
        </div>

        {brakeSvg}

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
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
    </>
  );
});
