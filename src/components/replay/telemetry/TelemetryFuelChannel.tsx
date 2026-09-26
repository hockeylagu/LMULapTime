import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from './TelemetryStaticTrace.js';
import { Fuel } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface TelemetryFuelChannelProps {
  fuelPath: string;
  fuelArea?: string;
  baselineFuelPath?: string;
  maxFuel: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryFuelChannel: React.FC<TelemetryFuelChannelProps> = React.memo(({
  fuelPath,
  fuelArea,
  baselineFuelPath,
  maxFuel,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="fuelGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.fuel} stopOpacity="0.4" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.fuel} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {fuelArea && <path d={fuelArea} fill="url(#fuelGrad)" opacity="0.3" />}
      {baselineFuelPath && (
        <path
          d={baselineFuelPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {fuelPath && (
        <path
          d={fuelPath}
          fill="none"
          stroke={TELEMETRY_COLORS.fuel}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [fuelArea, baselineFuelPath, fuelPath]);

  const currentFuel = currentPoint?.fuel;
  const hasFuelData = currentFuel !== undefined || Boolean(fuelPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-emerald-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-emerald-500/20 text-emerald-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Fuel className="w-3 h-3" />
          FUEL LEVEL
        </span>
        {hasFuelData ? (
          <span className="text-xs font-mono font-bold text-emerald-300">
            {currentFuel !== undefined ? currentFuel.toFixed(1) : '--'} <span className="text-[10px] font-normal text-emerald-400/70">L</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No fuel stream recorded
          </span>
        )}
        {currentComparison?.baseline.fuel !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.fuel.toFixed(1)} L
          </span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20" gridLines={[
        { label: `${maxFuel} L`, borderClassName: 'border-b border-emerald-400/30', labelClassName: 'text-[9px] text-emerald-300 font-mono' },
        { label: `${Math.round(maxFuel / 2)} L`, borderClassName: 'border-b border-emerald-400/30', labelClassName: 'text-[9px] text-emerald-300 font-mono' },
        { label: '0 L', borderClassName: 'border-b border-emerald-400/30', labelClassName: 'text-[9px] text-emerald-300 font-mono' },
      ]} />

      {isCursorInView && hasFuelData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/90 text-emerald-300 border border-emerald-500/40 shadow-sm">
            {currentFuel !== undefined ? `${currentFuel.toFixed(1)}L` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetryFuelChannel.displayName = 'TelemetryFuelChannel';
