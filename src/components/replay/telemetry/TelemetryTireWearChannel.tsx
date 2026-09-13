import React, { useMemo } from 'react';
import { CircleDot } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';

export interface TelemetryTireWearChannelProps {
  tireWearPaths: CornerPaths;
  baselineTireWearPaths?: CornerPaths;
  minTireWearPct: number;
  maxTireWearPct: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

function toWearPct(raw?: number): number {
  if (raw === undefined || raw === null) return 100;
  return Math.min(100, Math.max(0, (raw / 255) * 100));
}

export const TelemetryTireWearChannel: React.FC<TelemetryTireWearChannelProps> = React.memo(({
  tireWearPaths,
  baselineTireWearPaths,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineTireWearPaths?.fl && (
        <path d={baselineTireWearPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.fr && (
        <path d={baselineTireWearPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.rl && (
        <path d={baselineTireWearPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.rr && (
        <path d={baselineTireWearPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {tireWearPaths.fl && <path d={tireWearPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.fr && <path d={tireWearPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.rl && <path d={tireWearPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.rr && <path d={tireWearPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [tireWearPaths, baselineTireWearPaths]);

  const rawWear = currentPoint?.tireWear;
  const hasWear = rawWear !== undefined || Boolean(tireWearPaths.fl);
  const flPct = toWearPct(rawWear?.[0]);
  const frPct = toWearPct(rawWear?.[1]);
  const rlPct = toWearPct(rawWear?.[2]);
  const rrPct = toWearPct(rawWear?.[3]);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#061411]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-emerald-500/20 text-emerald-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <CircleDot className="w-3 h-3" />
          TIRE WEAR (REMAINING)
        </span>
        {hasWear && rawWear ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {flPct.toFixed(1)}%</span>
            <span className="text-blue-400">FR: {frPct.toFixed(1)}%</span>
            <span className="text-amber-400">RL: {rlPct.toFixed(1)}%</span>
            <span className="text-rose-400">RR: {rrPct.toFixed(1)}%</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No tire wear counters recorded
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">100% Remaining</div>
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">50%</div>
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">0% (Worn)</div>
      </div>

      {chartSvg}

      {isCursorInView && hasWear && rawWear && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-emerald-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{flPct.toFixed(1)}%</span>
            <span className="text-blue-300">FR:{frPct.toFixed(1)}%</span>
            <span className="text-amber-300">RL:{rlPct.toFixed(1)}%</span>
            <span className="text-rose-300">RR:{rrPct.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
});
