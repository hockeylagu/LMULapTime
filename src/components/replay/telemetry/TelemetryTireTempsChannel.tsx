import React, { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';

export interface TelemetryTireTempsChannelProps {
  tireTempsPaths: CornerPaths;
  baselineTireTempsPaths?: CornerPaths;
  minTireTemp: number;
  maxTireTemp: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryTireTempsChannel: React.FC<TelemetryTireTempsChannelProps> = React.memo(({
  tireTempsPaths,
  baselineTireTempsPaths,
  minTireTemp,
  maxTireTemp,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineTireTempsPaths?.fl && (
        <path d={baselineTireTempsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.fr && (
        <path d={baselineTireTempsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.rl && (
        <path d={baselineTireTempsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.rr && (
        <path d={baselineTireTempsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {tireTempsPaths.fl && <path d={tireTempsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.fr && <path d={tireTempsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.rl && <path d={tireTempsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.rr && <path d={tireTempsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [tireTempsPaths, baselineTireTempsPaths]);

  const tt = currentPoint?.tireTemps;
  const hasData = tt !== undefined || Boolean(tireTempsPaths.fl);
  const midTemp = Math.round((minTireTemp + maxTireTemp) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#160a0d]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-rose-500/20 text-rose-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Flame className="w-3 h-3" />
          TIRE CARCASS TEMPS
        </span>
        {hasData && tt ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {tt[0]}°C</span>
            <span className="text-blue-400">FR: {tt[1]}°C</span>
            <span className="text-amber-400">RL: {tt[2]}°C</span>
            <span className="text-rose-400">RR: {tt[3]}°C</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No tire thermal stream recorded
          </span>
        )}
        {currentComparison?.baseline.tireTemps && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.tireTemps[0]}° / {currentComparison.baseline.tireTemps[1]}° / {currentComparison.baseline.tireTemps[2]}° / {currentComparison.baseline.tireTemps[3]}°C
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">{maxTireTemp}°C</div>
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">{midTemp}°C</div>
        <div className="border-b border-rose-400/40 w-full text-[9px] text-rose-400 font-mono">{minTireTemp}°C</div>
      </div>

      {chartSvg}

      {isCursorInView && hasData && tt && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-rose-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{tt[0]}°</span>
            <span className="text-blue-300">FR:{tt[1]}°</span>
            <span className="text-amber-300">RL:{tt[2]}°</span>
            <span className="text-rose-300">RR:{tt[3]}°</span>
          </div>
        </div>
      )}
    </div>
  );
});
