import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Activity, Zap } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryPedalsChannelProps {
  throttlePath: string;
  throttleArea: string;
  baselineThrottlePath?: string;
  brakePath: string;
  brakeArea: string;
  baselineBrakePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryPedalsChannel: React.FC<TelemetryPedalsChannelProps> = React.memo(({
  throttlePath,
  throttleArea,
  baselineThrottlePath,
  brakePath,
  brakeArea,
  baselineBrakePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const throttleSvg = useMemo(() => (
    <svg viewBox="0 8 1000 89" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="throttleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.throttle} stopOpacity="0.8" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.throttle} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={throttleArea} fill="url(#throttleGrad)" opacity="0.35" />
      {baselineThrottlePath && (
        <path d={baselineThrottlePath} fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      <path d={throttlePath} fill="none" stroke={TELEMETRY_COLORS.throttle} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ), [throttleArea, baselineThrottlePath, throttlePath]);

  const brakeSvg = useMemo(() => (
    <svg viewBox="0 8 1000 89" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="brakeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.brake} stopOpacity="0.8" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.brake} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={brakeArea} fill="url(#brakeGrad)" opacity="0.35" />
      {baselineBrakePath && (
        <path d={baselineBrakePath} fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      <path d={brakePath} fill="none" stroke={TELEMETRY_COLORS.brake} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ), [brakeArea, baselineBrakePath, brakePath]);

  return (
    <>
      {/* THROTTLE CHANNEL */}
      <div className="relative flex-1 basis-0 min-h-0 border-b border-lmu-border/40 group bg-lmu-gain-deep/20">
        <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
          <span className="text-lmu-gain font-black text-[10px] tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3" />
            THROTTLE
          </span>

        </div>

        <TelemetryStaticTrace chart={throttleSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
          { label: '100%', yPercent: 2 / 89 * 100, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain' },
          { label: '50%', yPercent: 50, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain' },
          { label: '0%', yPercent: 87 / 89 * 100, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain' },
        ]} />

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className={`px-2 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentPoint?.tcActive ? 'border-lmu-warn text-lmu-warn-soft' : 'border-lmu-gain/80 text-lmu-gain-soft'
            }`}>
              {(currentPoint?.throttle ?? 0).toFixed(0)}%
              {currentPoint?.tcActive && (
                <span className="text-[10px] font-black px-1 rounded bg-lmu-warn-strong text-black ml-1">TC</span>
              )}
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn/70 text-lmu-warn-soft font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: {currentComparison.baseline.throttle.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* BRAKE CHANNEL */}
      <div className="relative flex-1 basis-0 min-h-0 border-b border-lmu-border/40 group bg-lmu-loss-deep/20">
        <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
          <span className="text-lmu-loss font-black text-[10px] tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            BRAKE
          </span>

        </div>

        <TelemetryStaticTrace chart={brakeSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
          { label: '100%', yPercent: 2 / 89 * 100, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss' },
          { label: '50%', yPercent: 50, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss' },
          { label: '0%', yPercent: 87 / 89 * 100, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss' },
        ]} />

        {isCursorInView && (
          <div
            className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
            style={{ left: `${cursorPct}%` }}
          >
            <span className={`px-2 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentPoint?.absActive ? 'border-lmu-aqua text-lmu-aqua-soft' : 'border-lmu-loss/80 text-lmu-loss-soft'
            }`}>
              {(currentPoint?.brake ?? 0).toFixed(0)}%
              {currentPoint?.absActive && (
                <span className="text-[10px] font-black px-1 rounded bg-lmu-aqua text-black ml-1">ABS</span>
              )}
            </span>
            {currentComparison && (
              <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn/70 text-lmu-warn-soft font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                B: {currentComparison.baseline.brake.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
});
