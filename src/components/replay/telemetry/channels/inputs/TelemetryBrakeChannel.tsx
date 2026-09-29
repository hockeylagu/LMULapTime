import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

const BRAKE_GRID_LINES: readonly TelemetryGridLine[] = [
  { label: '100%', borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
  { label: '50%', borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
  { label: '0%', borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
];

export interface TelemetryBrakeChannelProps {
  brakePath: string;
  brakeArea?: string;
  baselineBrakePath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryBrakeChannel: React.FC<TelemetryBrakeChannelProps> = React.memo(({
  brakePath,
  brakeArea,
  baselineBrakePath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const brakeSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="brakeStandaloneGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.brake} stopOpacity="0.75" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.brake} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {brakeArea && <path d={brakeArea} fill="url(#brakeStandaloneGrad)" opacity="0.3" />}
      {baselineBrakePath && (
        <path
          d={baselineBrakePath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {brakePath && (
        <path
          d={brakePath}
          fill="none"
          stroke={TELEMETRY_COLORS.brake}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [brakeArea, baselineBrakePath, brakePath]);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-lmu-loss-deep/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-lmu-loss-strong/20 text-lmu-loss font-black text-[10px] tracking-wider flex items-center gap-1">
          <Zap className="w-3 h-3" />
          BRAKE
        </span>
        <span className="text-xs font-mono font-bold text-lmu-loss">
          {(currentPoint?.brake ?? 0).toFixed(1)}%
        </span>
        {currentPoint?.absActive && (
          <span className="px-1.5 py-0.2 rounded bg-lmu-aqua text-black font-black text-[10px] tracking-wider">
            ABS ACTIVE
          </span>
        )}
        {currentPoint?.wheelLockActive && !currentPoint?.absActive && (
          <span className="px-1.5 py-0.2 rounded bg-lmu-loss-strong text-lmu-deep font-black text-[10px] tracking-wider">
            LOCKUP
          </span>
        )}
        {currentComparison && (
          <span className="text-[11px] font-mono text-lmu-warn/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.brake.toFixed(0)}%
          </span>
        )}
      </div>

      <TelemetryStaticTrace
        chart={brakeSvg}
        gridLines={BRAKE_GRID_LINES}
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
            currentPoint?.absActive ? 'border-lmu-aqua text-lmu-aqua-soft' : 'border-lmu-loss/80 text-lmu-loss-soft'
          }`}>
            {(currentPoint?.brake ?? 0).toFixed(0)}%
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {currentComparison.baseline.brake.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
