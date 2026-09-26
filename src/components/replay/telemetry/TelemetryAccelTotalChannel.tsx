import React, { useMemo } from 'react';
import { Activity, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import { TelemetryStaticTrace } from './TelemetryStaticTrace.js';

export interface TelemetryAccelTotalChannelProps {
  accelTotalPath: string;
  accelTotalArea?: string;
  baselineAccelTotalPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
  source?: 'vcr' | 'duckdb';
}

export const TelemetryAccelTotalChannel: React.FC<TelemetryAccelTotalChannelProps> = React.memo(({
  accelTotalPath,
  accelTotalArea,
  baselineAccelTotalPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
  source,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="totalGGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.tireScrub} stopOpacity="0.35" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.tireScrub} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {/* 2.0G midpoint guideline */}
      <line x1="0" y1="52" x2="1000" y2="52" stroke={TELEMETRY_COLORS.tireScrub} strokeWidth="0.6" strokeDasharray="3 3" opacity="0.25" />
      {accelTotalArea && (
        <path d={accelTotalArea} fill="url(#totalGGradient)" />
      )}
      {baselineAccelTotalPath && (
        <path
          d={baselineAccelTotalPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {accelTotalPath && (
        <path
          d={accelTotalPath}
          fill="none"
          stroke={TELEMETRY_COLORS.tireScrub}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [accelTotalPath, accelTotalArea, baselineAccelTotalPath]);

  const totalG = currentPoint?.accelTotalG;
  const hasTotalG = totalG !== undefined || Boolean(accelTotalPath);
  const baseTotalG = currentComparison?.baseline.accelTotalG;

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-rose-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-rose-500/20 text-rose-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3" />
          COMBINED G
        </span>
        {source !== 'duckdb' && <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>}
        {hasTotalG ? (
          <span className="text-xs font-mono font-bold text-rose-300">
            {totalG !== undefined ? `${totalG.toFixed(2)} G Resultant` : '0.00 G'}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseTotalG !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {baseTotalG.toFixed(2)} G
          </span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20" gridLines={[
        { label: '4.0G Max Grip', borderClassName: 'border-b border-rose-400/30', labelClassName: 'text-[8px] text-rose-400 font-mono' },
        { label: '2.0G', borderClassName: 'border-b border-rose-400/30', labelClassName: 'text-[8px] text-rose-300 font-mono' },
        { label: '0.0G Rest', borderClassName: 'border-b border-rose-400/30', labelClassName: 'text-[8px] text-rose-400 font-mono' },
      ]} />

      {isCursorInView && hasTotalG && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-rose-400/80 font-mono font-bold text-[11px] text-rose-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {totalG !== undefined ? `${totalG.toFixed(2)} G` : '0.00 G'}
          </span>
          {baseTotalG !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseTotalG.toFixed(2)} G
            </span>
          )}
        </div>
      )}
    </div>
  );
});
