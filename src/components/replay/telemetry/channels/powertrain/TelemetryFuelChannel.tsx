import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Fuel } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

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
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
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
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-lmu-gain-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-gain-soft font-black text-[10px] tracking-wider flex items-center gap-1">
          <Fuel className="w-3 h-3" />
          FUEL LEVEL
        </span>
        {!(hasFuelData) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No fuel stream recorded
          </span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxFuel} L`, borderClassName: 'border-b border-lmu-gain/30', labelClassName: 'text-[10px] text-lmu-gain-soft font-mono' },
        { label: `${Math.round(maxFuel / 2)} L`, borderClassName: 'border-b border-lmu-gain/30', labelClassName: 'text-[10px] text-lmu-gain-soft font-mono' },
        { label: '0 L', borderClassName: 'border-b border-lmu-gain/30', labelClassName: 'text-[10px] text-lmu-gain-soft font-mono' },
      ]} />

      {isCursorInView && hasFuelData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/90 text-lmu-gain-soft border border-lmu-gain-strong/40">
            {currentFuel !== undefined ? `${currentFuel.toFixed(1)}L` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetryFuelChannel.displayName = 'TelemetryFuelChannel';
