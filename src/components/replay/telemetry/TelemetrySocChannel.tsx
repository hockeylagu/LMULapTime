import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from './TelemetryStaticTrace.js';
import { BatteryCharging } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface TelemetrySocChannelProps {
  socPath: string;
  socArea?: string;
  baselineSocPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySocChannel: React.FC<TelemetrySocChannelProps> = React.memo(({
  socPath,
  socArea,
  baselineSocPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.baseline} stopOpacity="0.4" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.baseline} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {socArea && <path d={socArea} fill="url(#socGrad)" opacity="0.3" />}
      {baselineSocPath && (
        <path
          d={baselineSocPath}
          fill="none"
          stroke={TELEMETRY_COLORS.primary}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {socPath && (
        <path
          d={socPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [socArea, baselineSocPath, socPath]);

  const currentSoc = currentPoint?.soc;
  const hasSocData = currentSoc !== undefined || Boolean(socPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-amber-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-amber-500/20 text-amber-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <BatteryCharging className="w-3 h-3" />
          BATTERY SOC
        </span>
        {hasSocData ? (
          <span className="text-xs font-mono font-bold text-amber-300">
            {currentSoc !== undefined ? currentSoc.toFixed(1) : '--'} <span className="text-[10px] font-normal text-amber-400/70">%</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No hybrid battery SoC stream recorded
          </span>
        )}
        {currentComparison?.baseline.soc !== undefined && (
          <span className="text-[11px] font-mono text-sky-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.soc.toFixed(1)}%
          </span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20" gridLines={[
        { label: '100%', borderClassName: 'border-b border-amber-400/30', labelClassName: 'text-[9px] text-amber-300 font-mono' },
        { label: '50%', borderClassName: 'border-b border-amber-400/30', labelClassName: 'text-[9px] text-amber-300 font-mono' },
        { label: '0%', borderClassName: 'border-b border-amber-400/30', labelClassName: 'text-[9px] text-amber-300 font-mono' },
      ]} />

      {isCursorInView && hasSocData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/90 text-amber-300 border border-amber-500/40 shadow-sm">
            {currentSoc !== undefined ? `${currentSoc.toFixed(1)}%` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetrySocChannel.displayName = 'TelemetrySocChannel';
