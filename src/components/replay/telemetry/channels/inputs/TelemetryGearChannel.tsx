import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

const GEAR_GRID_LINES: readonly TelemetryGridLine[] = [
  { label: 'G7', yPercent: 2 / (508 / 7) * 100, borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
  { label: 'G4', yPercent: 50, borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
  { label: 'G1', yPercent: (494 / 7) / (508 / 7) * 100, borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
];

export interface TelemetryGearChannelProps {
  gearPath: string;
  baselineGearPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

function formatGearLabel(g?: number): string {
  if (g === undefined || g === null) return 'N';
  if (g <= -1) return 'R';
  if (g === 0) return 'N';
  return `G${g}`;
}

export const TelemetryGearChannel: React.FC<TelemetryGearChannelProps> = React.memo(({
  gearPath,
  baselineGearPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 13 1000 72.57142857142857" preserveAspectRatio="none" className="w-full h-full">
      {baselineGearPath && (
        <path
          d={baselineGearPath}
          fill="none"
          stroke={TELEMETRY_COLORS.baseline}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.75"
        />
      )}
      {gearPath && (
        <path
          d={gearPath}
          fill="none"
          stroke={TELEMETRY_COLORS.gear}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      )}
    </svg>
  ), [gearPath, baselineGearPath]);

  const currentGearVal = currentPoint?.gear;

  return (
    <div className="relative flex-1 basis-0 min-h-[60px] border-b border-lmu-border/40 group bg-lmu-warn-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-warn font-black text-[10px] tracking-wider flex items-center gap-1">
          <Layers className="w-3 h-3" />
          GEAR
        </span>

      </div>

      <TelemetryStaticTrace
        chart={chartSvg}
        gridLines={GEAR_GRID_LINES}
        gridClassName="absolute inset-0 pointer-events-none opacity-20"
      />

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn/80 font-mono font-bold text-[11px] text-lmu-warn-soft shadow-marker-lift whitespace-nowrap">
            {formatGearLabel(currentGearVal)}
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-marker-lift whitespace-nowrap">
              B: {formatGearLabel(currentComparison.baseline.gear)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

