import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

const THROTTLE_GRID_LINES: readonly TelemetryGridLine[] = [
  { label: '100%', borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
  { label: '50%', borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
  { label: '0%', borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
];

export interface TelemetryThrottleChannelProps {
  throttlePath: string;
  throttleArea?: string;
  baselineThrottlePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryThrottleChannel: React.FC<TelemetryThrottleChannelProps> = React.memo(({
  throttlePath,
  throttleArea,
  baselineThrottlePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const throttleSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="throttleStandaloneGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.throttle} stopOpacity="0.75" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.throttle} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {throttleArea && <path d={throttleArea} fill="url(#throttleStandaloneGrad)" opacity="0.3" />}
      {baselineThrottlePath && (
        <path
          d={baselineThrottlePath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {throttlePath && (
        <path
          d={throttlePath}
          fill="none"
          stroke={TELEMETRY_COLORS.throttle}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [throttleArea, baselineThrottlePath, throttlePath]);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-lmu-gain-deep/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-lmu-gain-strong/20 text-lmu-gain font-black text-[10px] tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3" />
          THROTTLE
        </span>
        <span className="text-xs font-mono font-bold text-lmu-gain">
          {(currentPoint?.throttle ?? 0).toFixed(1)}%
        </span>
        {currentPoint?.tcActive && (
          <span className="px-1.5 py-0.2 rounded bg-lmu-warn-strong text-black font-black text-[10px] tracking-wider animate-pulse">
            TC CUT
          </span>
        )}
        {currentComparison && (
          <span className="text-[11px] font-mono text-lmu-warn/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.throttle.toFixed(0)}%
          </span>
        )}
      </div>

      <TelemetryStaticTrace
        chart={throttleSvg}
        gridLines={THROTTLE_GRID_LINES}
        gridClassName="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20"
      />

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className={`px-2 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
            currentPoint?.tcActive ? 'border-lmu-warn text-lmu-warn-soft' : 'border-lmu-gain/80 text-lmu-gain-soft'
          }`}>
            {(currentPoint?.throttle ?? 0).toFixed(0)}%
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {currentComparison.baseline.throttle.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
