import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryBrakeChannelProps {
  brakePath: string;
  brakeArea?: string;
  baselineBrakePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryBrakeChannel: React.FC<TelemetryBrakeChannelProps> = React.memo(({
  brakePath,
  brakeArea,
  baselineBrakePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const brakeSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="brakeStandaloneGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {brakeArea && <path d={brakeArea} fill="url(#brakeStandaloneGrad)" opacity="0.3" />}
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
      {brakePath && (
        <path
          d={brakePath}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [brakeArea, baselineBrakePath, brakePath]);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-[#150a0e]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-rose-500/20 text-rose-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Zap className="w-3 h-3" />
          BRAKE
        </span>
        <span className="text-xs font-mono font-bold text-rose-400">
          {(currentPoint?.brake ?? 0).toFixed(1)}%
        </span>
        {currentPoint?.absActive && (
          <span className="px-1.5 py-0.2 rounded bg-cyan-400 text-black font-black text-[8px] tracking-wider animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]">
            ABS ACTIVE
          </span>
        )}
        {currentPoint?.wheelLockActive && !currentPoint?.absActive && (
          <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white font-black text-[8px] tracking-wider animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
            LOCKUP
          </span>
        )}
        {currentComparison && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.brake.toFixed(0)}%
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">100%</div>
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">50%</div>
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">0%</div>
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
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {currentComparison.baseline.brake.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
