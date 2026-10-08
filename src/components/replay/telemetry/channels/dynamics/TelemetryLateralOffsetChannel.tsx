import React, { useMemo } from 'react';
import { GitCommit } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

export interface TelemetryLateralOffsetChannelProps {
  lateralOffsetPath: string;
  baselineLateralOffsetPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryLateralOffsetChannel: React.FC<TelemetryLateralOffsetChannelProps> = React.memo(({
  lateralOffsetPath,
  baselineLateralOffsetPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 80" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={TELEMETRY_COLORS.lateralOffset} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineLateralOffsetPath && (
        <path
          d={baselineLateralOffsetPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {lateralOffsetPath && (
        <path
          d={lateralOffsetPath}
          fill="none"
          stroke={TELEMETRY_COLORS.lateralOffset}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [lateralOffsetPath, baselineLateralOffsetPath]);

  const offsetM = currentPoint?.lateralOffsetM;
  const hasOffset = offsetM !== undefined || Boolean(lateralOffsetPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-lmu-teal-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-teal font-black text-[10px] tracking-wider flex items-center gap-1">
          <GitCommit className="w-3 h-3" />
          LATERAL OFFSET
        </span>
        {!(hasOffset) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No corridor offset recorded
          </span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: '+10m Left', borderClassName: 'border-b border-lmu-teal/30', labelClassName: 'text-[10px] text-lmu-teal font-mono' },
        { label: '0m Center', borderClassName: 'border-b border-lmu-teal/50', labelClassName: 'text-[10px] text-lmu-teal-soft font-mono' },
        { label: '-10m Right', borderClassName: 'border-b border-lmu-teal/30', labelClassName: 'text-[10px] text-lmu-teal font-mono' },
      ]} />

      {isCursorInView && hasOffset && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-teal/80 font-mono font-bold text-[11px] text-lmu-teal-soft shadow-marker-lift whitespace-nowrap">
            {offsetM !== undefined ? `${offsetM > 0 ? `+${offsetM.toFixed(2)}` : offsetM.toFixed(2)}m` : '0.00m'}
          </span>
          {currentComparison?.baseline.lateralOffsetM !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-marker-lift whitespace-nowrap">
              B: {currentComparison.baseline.lateralOffsetM.toFixed(2)}m
            </span>
          )}
        </div>
      )}
    </div>
  );
});
