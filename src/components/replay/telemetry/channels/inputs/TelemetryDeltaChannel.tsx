import React, { useMemo } from 'react';
import { Timer } from 'lucide-react';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { DeltaGradientStop } from '../../telemetryChartPaths.js';
import { CHART_COLORS, TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

export interface TelemetryDeltaChannelProps {
  deltaTimePath: string;
  deltaTimeArea?: string;
  deltaGainArea?: string;
  deltaLossArea?: string;
  deltaGradientStops?: DeltaGradientStop[];
  maxDeltaSec: number;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryDeltaChannel: React.FC<TelemetryDeltaChannelProps> = React.memo(({
  deltaTimePath,
  deltaTimeArea,
  deltaGainArea,
  deltaLossArea,
  deltaGradientStops,
  maxDeltaSec,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 80" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        {deltaGradientStops && deltaGradientStops.length > 0 && (
          <linearGradient id="dynamicDeltaGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            {deltaGradientStops.map((s, idx) => (
              <stop
                key={idx}
                offset={s.offset}
                stopColor={s.color}
                stopOpacity={s.opacity}
              />
            ))}
          </linearGradient>
        )}
        <linearGradient id="gainDeltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.gain} stopOpacity="0.55" />
          <stop offset="50%" stopColor={TELEMETRY_COLORS.gain} stopOpacity="0.25" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.gain} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="lossDeltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.loss} stopOpacity="0.55" />
          <stop offset="50%" stopColor={TELEMETRY_COLORS.loss} stopOpacity="0.25" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.loss} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="deltaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.gain} stopOpacity="0.45" />
          <stop offset="50%" stopColor={TELEMETRY_COLORS.gain} stopOpacity="0.05" />
          <stop offset="50%" stopColor={TELEMETRY_COLORS.loss} stopOpacity="0.05" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.loss} stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {deltaGradientStops && deltaGradientStops.length > 0 && deltaTimeArea ? (
        <path d={deltaTimeArea} fill="url(#dynamicDeltaGrad)" />
      ) : (
        <>
          {deltaGainArea && <path d={deltaGainArea} fill="url(#gainDeltaGrad)" />}
          {deltaLossArea && <path d={deltaLossArea} fill="url(#lossDeltaGrad)" />}
          {!deltaGainArea && !deltaLossArea && deltaTimeArea && (
            <path d={deltaTimeArea} fill="url(#deltaGrad)" />
          )}
        </>
      )}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={CHART_COLORS.white} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
      <path
        d={deltaTimePath}
        fill="none"
        stroke={TELEMETRY_COLORS.rpm}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ), [deltaTimePath, deltaTimeArea, deltaGainArea, deltaLossArea, deltaGradientStops]);

  const gridLines = useMemo<readonly TelemetryGridLine[]>(() => [
    { label: `-${maxDeltaSec.toFixed(1)}s (Faster)`, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
    { label: '0.00s (Equal)', borderClassName: 'border-b border-white/60', labelClassName: 'text-[10px] text-white font-mono' },
    { label: `+${maxDeltaSec.toFixed(1)}s (Slower)`, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
  ], [maxDeltaSec]);

  return (
    <div className="relative flex-1 basis-0 min-h-0 border-b border-lmu-border/40 group bg-lmu-purple-deep/20">
      <div className="absolute top-1 left-3 h-5 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="text-lmu-purple-soft font-black text-[10px] tracking-wider flex items-center gap-1">
            <Timer className="w-3 h-3" />
            TIME DELTA (Δt)
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1 text-lmu-gain font-semibold">
            <span className="w-2.5 h-2 rounded-sm bg-lmu-gain-strong/70 border border-lmu-gain/60 inline-block" />
            Vibrant Green = Gaining Time
          </span>
          <span className="flex items-center gap-1 text-lmu-loss font-semibold">
            <span className="w-2.5 h-2 rounded-sm bg-lmu-loss-strong/70 border border-lmu-loss/60 inline-block" />
            Vibrant Red = Slower (Time Lost)
          </span>
          <span className="flex items-center gap-1 text-lmu-muted">
            <span className="w-2.5 h-2 rounded-sm bg-transparent border border-dashed border-lmu-rule-strong inline-block" />
            Faded = Steady Pace
          </span>
        </div>
      </div>

      <TelemetryStaticTrace
        chart={chartSvg}
        gridLines={gridLines}
        gridClassName="absolute inset-0 pointer-events-none opacity-20"
      />

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className={`px-2 py-0.5 rounded-md bg-lmu-badge font-mono font-bold text-[11px] shadow-marker-lift whitespace-nowrap border ${
            (currentComparison?.deltaTimeSec ?? 0) <= 0 ? 'border-lmu-gain/80 text-lmu-gain-soft' : 'border-lmu-loss/80 text-lmu-loss-soft'
          }`}>
            Δt: {(currentComparison?.deltaTimeSec ?? 0) <= 0 ? '' : '+'}
            {(currentComparison?.deltaTimeSec ?? 0).toFixed(3)}s
          </span>
        </div>
      )}
    </div>
  );
});
