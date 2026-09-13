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

  const temps = currentPoint?.tireTemps;
  const hasTemps = temps !== undefined || Boolean(tireTempsPaths.fl);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#071318]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-cyan-500/20 text-cyan-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Flame className="w-3 h-3" />
          TIRE TEMPS
        </span>
        {hasTemps && temps ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {temps[0]}°C</span>
            <span className="text-blue-400">FR: {temps[1]}°C</span>
            <span className="text-amber-400">RL: {temps[2]}°C</span>
            <span className="text-rose-400">RR: {temps[3]}°C</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No tire temp stream recorded
          </span>
        )}
        {currentComparison?.baseline.tireTemps && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.tireTemps[0]}° / {currentComparison.baseline.tireTemps[1]}° / {currentComparison.baseline.tireTemps[2]}° / {currentComparison.baseline.tireTemps[3]}°
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">{maxTireTemp}°C</div>
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">{Math.round((maxTireTemp + minTireTemp) / 2)}°C</div>
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">{minTireTemp}°C</div>
      </div>

      {chartSvg}

      {isCursorInView && hasTemps && temps && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-cyan-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{temps[0]}°</span>
            <span className="text-blue-300">FR:{temps[1]}°</span>
            <span className="text-amber-300">RL:{temps[2]}°</span>
            <span className="text-rose-300">RR:{temps[3]}°</span>
          </div>
        </div>
      )}
    </div>
  );
});
