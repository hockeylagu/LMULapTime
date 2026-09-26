import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from './TelemetryStaticTrace.js';

const SPEED_GRID_LINES: readonly TelemetryGridLine[] = [
  { label: '250 km/h', borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400' },
  { label: '125 km/h', borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400' },
  { label: '0 km/h', borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400' },
];

export interface TelemetrySpeedChannelProps {
  speedPath: string;
  baselineSpeedPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySpeedChannel: React.FC<TelemetrySpeedChannelProps> = React.memo(({
  speedPath,
  baselineSpeedPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
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
    <div className="relative flex-1 basis-0 min-h-0 border-b border-lmu-border/40 group bg-sky-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-sky-500/20 text-sky-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          SPEED
        </span>
        <span className="text-xs font-mono font-bold text-white">
          {currentPoint?.speedKmh ?? 0} <span className="text-[10px] font-normal text-lmu-muted">km/h</span>
        </span>
        {currentComparison && (
          <span className="text-[11px] font-mono flex items-center gap-1.5 ml-1 pl-2 border-l border-white/10">
            <span className="text-amber-400 font-semibold">Base: {currentComparison.baseline.speedKmh} km/h</span>
            <span className={`font-bold ${currentComparison.deltaSpeedKmh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              (Δ {currentComparison.deltaSpeedKmh >= 0 ? `+${currentComparison.deltaSpeedKmh}` : currentComparison.deltaSpeedKmh})
            </span>
          </span>
        )}
      </div>

      <TelemetryStaticTrace
        chart={chartSvg}
        gridLines={SPEED_GRID_LINES}
        gridClassName="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20"
      />

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge text-sky-300 border border-sky-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {currentPoint?.speedKmh ?? 0} <span className="text-[9px] font-normal text-sky-400/70">km/h</span>
          </span>
          {currentComparison && (
            <span className={`px-1.5 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap border ${
              currentComparison.deltaSpeedKmh >= 0 ? 'border-emerald-500/80 text-emerald-300' : 'border-rose-500/80 text-rose-300'
            }`}>
              <span className="text-amber-400 font-semibold mr-1">B: {currentComparison.baseline.speedKmh}</span>
              <span>{currentComparison.deltaSpeedKmh >= 0 ? `+${currentComparison.deltaSpeedKmh}` : currentComparison.deltaSpeedKmh}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});
