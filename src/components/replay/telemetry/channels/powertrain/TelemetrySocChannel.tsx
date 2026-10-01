import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { BatteryCharging } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

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
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
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
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-lmu-warn-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-warn-soft font-black text-[10px] tracking-wider flex items-center gap-1">
          <BatteryCharging className="w-3 h-3" />
          BATTERY SOC
        </span>
        {!(hasSocData) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No hybrid battery SoC stream recorded
          </span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: '100%', borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn-soft font-mono' },
        { label: '50%', borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn-soft font-mono' },
        { label: '0%', borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn-soft font-mono' },
      ]} />

      {isCursorInView && hasSocData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/90 text-lmu-warn-soft border border-lmu-warn-strong/40">
            {currentSoc !== undefined ? `${currentSoc.toFixed(1)}%` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetrySocChannel.displayName = 'TelemetrySocChannel';
