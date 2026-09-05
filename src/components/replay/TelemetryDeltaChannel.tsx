import React, { useMemo } from 'react';
import { Timer } from 'lucide-react';
import { PointComparison } from '../../utils/replayComparison.js';
import { DeltaGradientStop } from './telemetryChartPaths.js';

export interface TelemetryDeltaChannelProps {
  deltaTimePath: string;
  deltaTimeArea?: string;
  deltaGainArea?: string;
  deltaLossArea?: string;
  deltaGradientStops?: DeltaGradientStop[];
  maxDeltaSec: number;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryDeltaChannel: React.FC<TelemetryDeltaChannelProps> = React.memo(({
  deltaTimePath,
  deltaTimeArea,
  deltaGainArea,
  deltaLossArea,
  deltaGradientStops,
  maxDeltaSec,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        {deltaGradientStops && deltaGradientStops.length > 0 && (
          <linearGradient id="dynamicDeltaGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            {deltaGradientStops.map((s, idx) => (
              <stop
                key={idx}
                offset={s.offset}
                stopColor={s.color}
                stopOpacity={s.opacity}
              />
            ))}
          </linearGradient>
        )}
        <linearGradient id="gainDeltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="lossDeltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#ef4444" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="deltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.05" />
          <stop offset="50%" stopColor="#ef4444" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {deltaGradientStops && deltaGradientStops.length > 0 && deltaTimeArea ? (
        <path d={deltaTimeArea} fill="url(#dynamicDeltaGrad)" />
      ) : (
        <>
          {deltaGainArea && <path d={deltaGainArea} fill="url(#gainDeltaGrad)" />}
          {deltaLossArea && <path d={deltaLossArea} fill="url(#lossDeltaGrad)" />}
          {!deltaGainArea && !deltaLossArea && deltaTimeArea && (
            <path d={deltaTimeArea} fill="url(#deltaGrad)" />
          )}
        </>
      )}
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
  ), [deltaTimePath, deltaTimeArea, deltaGainArea, deltaLossArea, deltaGradientStops]);

  return (
    <div className="relative flex-1 border-b border-lmu-border/40 min-h-[85px] group bg-[#110d1c]/60">
      <div className="absolute top-2 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2">
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
                {currentComparison.deltaTimeSec <= 0 ? 'Ahead' : 'Behind'}
              </span>
            </div>
          ) : null}
        </div>

        {/* Dynamic Gain/Loss legend */}
        <div className="hidden sm:flex items-center gap-3 text-[9px] font-mono">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-2.5 h-2 rounded-sm bg-emerald-500/70 border border-emerald-400/60 inline-block" />
            Vibrant Green = Gaining Time
          </span>
          <span className="flex items-center gap-1 text-rose-400 font-semibold">
            <span className="w-2.5 h-2 rounded-sm bg-rose-500/70 border border-rose-400/60 inline-block" />
            Vibrant Red = Slower (Time Lost)
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2.5 h-2 rounded-sm bg-transparent border border-dashed border-slate-500 inline-block" />
            Faded = Steady Pace
          </span>
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">-{maxDeltaSec.toFixed(1)}s (Faster)</div>
        <div className="border-b border-white/60 w-full text-[9px] text-white font-mono">0.00s (Equal)</div>
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">+{maxDeltaSec.toFixed(1)}s (Slower)</div>
      </div>

      {chartSvg}

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center ${
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
});
