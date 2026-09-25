import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface TelemetryRegenRateChannelProps {
  regenRatePath: string;
  regenRateArea?: string;
  baselineRegenRatePath?: string;
  maxRegen: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryRegenRateChannel: React.FC<TelemetryRegenRateChannelProps> = React.memo(({
  regenRatePath,
  regenRateArea,
  baselineRegenRatePath,
  maxRegen,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="regenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.rpm} stopOpacity="0.4" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.rpm} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {regenRateArea && <path d={regenRateArea} fill="url(#regenGrad)" opacity="0.3" />}
      {baselineRegenRatePath && (
        <path
          d={baselineRegenRatePath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {regenRatePath && (
        <path
          d={regenRatePath}
          fill="none"
          stroke={TELEMETRY_COLORS.rpm}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [regenRateArea, baselineRegenRatePath, regenRatePath]);

  const currentRegen = currentPoint?.regenRate;
  const hasRegenData = currentRegen !== undefined || Boolean(regenRatePath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-purple-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-purple-500/20 text-purple-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3" />
          REGEN RATE
        </span>
        {hasRegenData ? (
          <span className="text-xs font-mono font-bold text-purple-300">
            {currentRegen !== undefined ? currentRegen.toFixed(1) : '--'} <span className="text-[10px] font-normal text-purple-400/70">kW</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No MGU-K regen telemetry recorded
          </span>
        )}
        {currentComparison?.baseline.regenRate !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.regenRate.toFixed(1)} kW
          </span>
        )}
      </div>

      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">{maxRegen} kW</div>
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">{Math.round(maxRegen / 2)} kW</div>
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">0 kW</div>
      </div>

      {chartSvg}

      {isCursorInView && hasRegenData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-lmu-badge text-purple-300 border border-purple-500/40 shadow-sm">
            {currentRegen !== undefined ? `${currentRegen.toFixed(1)}kW` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetryRegenRateChannel.displayName = 'TelemetryRegenRateChannel';
