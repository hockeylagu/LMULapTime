import React from 'react';
import { Timer } from 'lucide-react';
import { PointComparison } from '../../utils/replayComparison.js';

export interface TelemetryDeltaChannelProps {
  deltaTimePath: string;
  deltaTimeArea: string;
  maxDeltaSec: number;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryDeltaChannel: React.FC<TelemetryDeltaChannelProps> = ({
  deltaTimePath,
  deltaTimeArea,
  maxDeltaSec,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  return (
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
  );
};
