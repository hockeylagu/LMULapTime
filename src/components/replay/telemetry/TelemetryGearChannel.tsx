import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

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
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
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
    <div className="relative flex-1 basis-0 min-h-[60px] border-b border-lmu-border/40 group bg-amber-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-amber-500/20 text-amber-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Layers className="w-3 h-3" />
          GEAR
        </span>
        <span className="text-xs font-mono font-bold text-amber-300">
          {formatGearLabel(currentGearVal)}
        </span>
        {currentComparison && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {formatGearLabel(currentComparison.baseline.gear)}
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-amber-400/30 w-full text-[8px] text-amber-400 font-mono">G7</div>
        <div className="border-b border-amber-400/30 w-full text-[8px] text-amber-400 font-mono">G4</div>
        <div className="border-b border-amber-400/30 w-full text-[8px] text-amber-400 font-mono">G1</div>
      </div>

      {chartSvg}

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-amber-400/80 font-mono font-bold text-[11px] text-amber-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {formatGearLabel(currentGearVal)}
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {formatGearLabel(currentComparison.baseline.gear)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

