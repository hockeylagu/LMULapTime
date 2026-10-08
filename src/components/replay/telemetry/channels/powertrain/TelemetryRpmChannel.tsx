import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryRpmChannelProps {
  rpmPath: string;
  rpmArea?: string;
  baselineRpmPath?: string;
  maxRpm: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryRpmChannel: React.FC<TelemetryRpmChannelProps> = React.memo(({
  rpmPath,
  rpmArea,
  baselineRpmPath,
  maxRpm,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="rpmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.rpm} stopOpacity="0.5" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.rpm} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {rpmArea && <path d={rpmArea} fill="url(#rpmGrad)" opacity="0.25" />}
      {baselineRpmPath && (
        <path
          d={baselineRpmPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {rpmPath && (
        <path
          d={rpmPath}
          fill="none"
          stroke={TELEMETRY_COLORS.rpm}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [rpmArea, baselineRpmPath, rpmPath]);

  const currentRpm = currentPoint?.engineRpm;
  const hasRpmData = currentRpm !== undefined || Boolean(rpmPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-lmu-purple-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-purple-soft font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          ENGINE RPM
        </span>
        {!(hasRpmData) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No RPM stream recorded
          </span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxRpm} rpm`, borderClassName: 'border-b border-lmu-purple/30', labelClassName: 'text-[10px] text-lmu-purple-soft font-mono' },
        { label: `${Math.round(maxRpm / 2)} rpm`, borderClassName: 'border-b border-lmu-purple/30', labelClassName: 'text-[10px] text-lmu-purple-soft font-mono' },
        { label: '0 rpm', borderClassName: 'border-b border-lmu-purple/30', labelClassName: 'text-[10px] text-lmu-purple-soft font-mono' },
      ]} />

      {isCursorInView && hasRpmData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-purple/80 font-mono font-bold text-[11px] text-lmu-purple-soft shadow-marker-lift whitespace-nowrap">
            {currentRpm?.toLocaleString() ?? 0} <span className="text-[10px] font-normal text-lmu-purple/70">rpm</span>
          </span>
          {currentComparison?.baseline.engineRpm !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-marker-lift whitespace-nowrap">
              B: {currentComparison.baseline.engineRpm.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
