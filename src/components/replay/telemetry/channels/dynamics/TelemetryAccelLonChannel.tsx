import React, { useMemo } from 'react';
import { Gauge, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

export interface TelemetryAccelLonChannelProps {
  accelLonPath: string;
  baselineAccelLonPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
  source?: 'vcr' | 'duckdb';
}

export const TelemetryAccelLonChannel: React.FC<TelemetryAccelLonChannelProps> = React.memo(({
  accelLonPath,
  baselineAccelLonPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
  source,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={TELEMETRY_COLORS.baseline} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineAccelLonPath && (
        <path
          d={baselineAccelLonPath}
          fill="none"
          stroke={TELEMETRY_COLORS.primary}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {accelLonPath && (
        <path
          d={accelLonPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [accelLonPath, baselineAccelLonPath]);

  const lonG = currentPoint?.accelLonG;
  const hasLonG = lonG !== undefined || Boolean(accelLonPath);
  const baseLonG = currentComparison?.baseline.accelLonG;

  const formatG = (g: number | undefined): string => {
    if (g === undefined) return '0.00 G';
    const sign = g > 0 ? '+' : '';
    const label = Math.abs(g) < 0.08 ? '' : g > 0 ? ' Power' : ' Braking';
    return `${sign}${g.toFixed(2)} G${label}`;
  };

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-amber-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-amber-500/20 text-amber-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          LONGITUDINAL G
        </span>
        {source !== 'duckdb' && <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>}
        {hasLonG ? (
          <span className={`text-xs font-mono font-bold ${lonG && lonG < -0.1 ? 'text-rose-400' : lonG && lonG > 0.1 ? 'text-emerald-400' : 'text-amber-300'}`}>
            {formatG(lonG)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseLonG !== undefined && (
          <span className="text-[11px] font-mono text-sky-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {formatG(baseLonG)}
          </span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20" gridLines={[
        { label: '+3.0G Acceleration', borderClassName: 'border-b border-amber-400/30', labelClassName: 'text-[8px] text-emerald-400 font-mono' },
        { label: '0.0G Neutral', borderClassName: 'border-b border-amber-400/50', labelClassName: 'text-[8px] text-amber-300 font-mono' },
        { label: '-3.0G Braking', borderClassName: 'border-b border-amber-400/30', labelClassName: 'text-[8px] text-rose-400 font-mono' },
      ]} />

      {isCursorInView && hasLonG && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-amber-400/80 font-mono font-bold text-[11px] text-amber-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {formatG(lonG)}
          </span>
          {baseLonG !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-sky-500/80 font-mono font-bold text-[10px] text-sky-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {formatG(baseLonG)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
