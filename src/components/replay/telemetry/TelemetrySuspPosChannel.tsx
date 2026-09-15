import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';

export interface TelemetrySuspPosChannelProps {
  suspPosPaths: CornerPaths;
  baselineSuspPosPaths?: CornerPaths;
  minSuspPos: number;
  maxSuspPos: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySuspPosChannel: React.FC<TelemetrySuspPosChannelProps> = React.memo(({
  suspPosPaths,
  baselineSuspPosPaths,
  minSuspPos,
  maxSuspPos,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineSuspPosPaths?.fl && (
        <path d={baselineSuspPosPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.fr && (
        <path d={baselineSuspPosPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.rl && (
        <path d={baselineSuspPosPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.rr && (
        <path d={baselineSuspPosPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {suspPosPaths.fl && <path d={suspPosPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.fr && <path d={suspPosPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.rl && <path d={suspPosPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.rr && <path d={suspPosPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [suspPosPaths, baselineSuspPosPaths]);

  const susp = currentPoint?.rideHeight;
  const hasData = susp !== undefined || Boolean(suspPosPaths.fl);
  const midSusp = Math.round((minSuspPos + maxSuspPos) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#091512]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-emerald-500/20 text-emerald-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3" />
          RIDE HEIGHT
        </span>
        {hasData && susp ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {susp[0].toFixed(1)}mm</span>
            <span className="text-blue-400">FR: {susp[1].toFixed(1)}mm</span>
            <span className="text-amber-400">RL: {susp[2].toFixed(1)}mm</span>
            <span className="text-rose-400">RR: {susp[3].toFixed(1)}mm</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No ride-height stream recorded
          </span>
        )}
        {currentComparison?.baseline.rideHeight && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.rideHeight[0].toFixed(0)} / {currentComparison.baseline.rideHeight[1].toFixed(0)} / {currentComparison.baseline.rideHeight[2].toFixed(0)} / {currentComparison.baseline.rideHeight[3].toFixed(0)}mm
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">{maxSuspPos} mm</div>
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">{midSusp} mm</div>
        <div className="border-b border-emerald-400/40 w-full text-[9px] text-emerald-400 font-mono">{minSuspPos} mm</div>
      </div>

      {chartSvg}

      {isCursorInView && hasData && susp && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-emerald-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{susp[0].toFixed(1)}</span>
            <span className="text-blue-300">FR:{susp[1].toFixed(1)}</span>
            <span className="text-amber-300">RL:{susp[2].toFixed(1)}</span>
            <span className="text-rose-300">RR:{susp[3].toFixed(1)}</span>
            <span className="text-emerald-400 text-[9px]">mm</span>
          </div>
        </div>
      )}
    </div>
  );
});
