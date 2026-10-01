import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

const speedGridLines = (maxSpeed: number): readonly TelemetryGridLine[] => [
  { label: `${Number(maxSpeed.toFixed(1))} km/h`, borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info' },
  { label: `${Number((maxSpeed / 2).toFixed(1))} km/h`, borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info' },
  { label: '0 km/h', borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info' },
];

export interface TelemetrySpeedChannelProps {
  speedPath: string;
  maxSpeed?: number;
  baselineSpeedPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySpeedChannel: React.FC<TelemetrySpeedChannelProps> = React.memo(({
  speedPath,
  maxSpeed = 260,
  baselineSpeedPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {baselineSpeedPath && (
        <path
          d={baselineSpeedPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      <path
        d={speedPath}
        fill="none"
        stroke={TELEMETRY_COLORS.primary}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ), [speedPath, baselineSpeedPath]);

  return (
    <div className="relative flex-1 basis-0 min-h-0 border-b border-lmu-border/40 group bg-lmu-info-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-info font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          SPEED
        </span>

      </div>

      <TelemetryStaticTrace
        chart={chartSvg}
        gridLines={speedGridLines(maxSpeed)}
        gridClassName="absolute inset-0 pointer-events-none opacity-20"
      />

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge text-lmu-info-soft border border-lmu-info/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {currentPoint?.speedKmh ?? 0} <span className="text-[10px] font-normal text-lmu-info/70">km/h</span>
          </span>
          {currentComparison && (
            <span className={`px-1.5 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentComparison.deltaSpeedKmh >= 0 ? 'border-lmu-gain-strong/80 text-lmu-gain-soft' : 'border-lmu-loss-strong/80 text-lmu-loss-soft'
            }`}>
              <span className="text-lmu-warn font-semibold mr-1">B: {currentComparison.baseline.speedKmh}</span>
              <span>{currentComparison.deltaSpeedKmh >= 0 ? `+${currentComparison.deltaSpeedKmh}` : currentComparison.deltaSpeedKmh}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});
