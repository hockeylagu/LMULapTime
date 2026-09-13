import React, { useMemo } from 'react';
import { RotateCw, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryYawRateChannelProps {
  yawRatePath: string;
  baselineYawRatePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryYawRateChannel: React.FC<TelemetryYawRateChannelProps> = React.memo(({
  yawRatePath,
  baselineYawRatePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineYawRatePath && (
        <path
          d={baselineYawRatePath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {yawRatePath && (
        <path
          d={yawRatePath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [yawRatePath, baselineYawRatePath]);

  const yawRate = currentPoint?.yawRateDeg;
  const hasYawRate = yawRate !== undefined || Boolean(yawRatePath);
  const baseYawRate = currentComparison?.baseline.yawRateDeg;

  const formatYawRate = (yr: number | undefined): string => {
    if (yr === undefined) return '0.0°/s';
    const sign = yr > 0 ? '+' : '';
    const dir = Math.abs(yr) < 0.5 ? '' : yr > 0 ? ' R' : ' L';
    return `${sign}${yr.toFixed(1)}°/s${dir}`;
  };

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#08141b]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-cyan-500/20 text-cyan-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <RotateCw className="w-3 h-3" />
          YAW RATE
        </span>
        <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>
        {hasYawRate ? (
          <span className="text-xs font-mono font-bold text-cyan-300">
            {formatYawRate(yawRate)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseYawRate !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {formatYawRate(baseYawRate)}
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-cyan-400/30 w-full text-[8px] text-cyan-400 font-mono">+90°/s Rotation Right</div>
        <div className="border-b border-cyan-400/50 w-full text-[8px] text-cyan-300 font-mono">0°/s In-Line</div>
        <div className="border-b border-cyan-400/30 w-full text-[8px] text-cyan-400 font-mono">-90°/s Rotation Left</div>
      </div>

      {chartSvg}

      {isCursorInView && hasYawRate && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-cyan-400/80 font-mono font-bold text-[11px] text-cyan-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {formatYawRate(yawRate)}
          </span>
          {baseYawRate !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {formatYawRate(baseYawRate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
