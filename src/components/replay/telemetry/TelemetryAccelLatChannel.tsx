import React, { useMemo } from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryAccelLatChannelProps {
  accelLatPath: string;
  baselineAccelLatPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
  source?: 'vcr' | 'duckdb';
}

export const TelemetryAccelLatChannel: React.FC<TelemetryAccelLatChannelProps> = React.memo(({
  accelLatPath,
  baselineAccelLatPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
  source,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineAccelLatPath && (
        <path
          d={baselineAccelLatPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {accelLatPath && (
        <path
          d={accelLatPath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [accelLatPath, baselineAccelLatPath]);

  const latG = currentPoint?.accelLatG;
  const hasLatG = latG !== undefined || Boolean(accelLatPath);
  const baseLatG = currentComparison?.baseline.accelLatG;

  const formatG = (g: number | undefined): string => {
    if (g === undefined) return '0.00 G';
    const sign = g > 0 ? '+' : '';
    const dir = Math.abs(g) < 0.1 ? '' : g > 0 ? ' R' : ' L';
    return `${sign}${g.toFixed(2)} G${dir}`;
  };

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#081220]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-sky-500/20 text-sky-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Compass className="w-3 h-3" />
          LATERAL G
        </span>
        {source !== 'duckdb' && <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>}
        {hasLatG ? (
          <span className="text-xs font-mono font-bold text-sky-300">
            {formatG(latG)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseLatG !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {formatG(baseLatG)}
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-sky-400/30 w-full text-[8px] text-sky-400 font-mono">+3.0G Right</div>
        <div className="border-b border-sky-400/50 w-full text-[8px] text-sky-300 font-mono">0.0G Center</div>
        <div className="border-b border-sky-400/30 w-full text-[8px] text-sky-400 font-mono">-3.0G Left</div>
      </div>

      {chartSvg}

      {isCursorInView && hasLatG && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-sky-400/80 font-mono font-bold text-[11px] text-sky-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {formatG(latG)}
          </span>
          {baseLatG !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {formatG(baseLatG)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
