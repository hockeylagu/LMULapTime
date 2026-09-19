import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryVirtualEnergyChannelProps {
  virtualEnergyPath: string;
  virtualEnergyArea?: string;
  baselineVirtualEnergyPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryVirtualEnergyChannel: React.FC<TelemetryVirtualEnergyChannelProps> = React.memo(({
  virtualEnergyPath,
  virtualEnergyArea,
  baselineVirtualEnergyPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="veGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {virtualEnergyArea && <path d={virtualEnergyArea} fill="url(#veGrad)" opacity="0.3" />}
      {baselineVirtualEnergyPath && (
        <path
          d={baselineVirtualEnergyPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {virtualEnergyPath && (
        <path
          d={virtualEnergyPath}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [virtualEnergyArea, baselineVirtualEnergyPath, virtualEnergyPath]);

  const currentVe = currentPoint?.virtualEnergy;
  const hasVeData = currentVe !== undefined || Boolean(virtualEnergyPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-[#061720]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-cyan-500/20 text-cyan-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Zap className="w-3 h-3" />
          VIRTUAL ENERGY
        </span>
        {hasVeData ? (
          <span className="text-xs font-mono font-bold text-cyan-300">
            {currentVe !== undefined ? currentVe.toFixed(1) : '--'} <span className="text-[10px] font-normal text-cyan-400/70">%</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No virtual energy allocation recorded
          </span>
        )}
        {currentComparison?.baseline.virtualEnergy !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.virtualEnergy.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-cyan-400/30 w-full text-[9px] text-cyan-300 font-mono">100%</div>
        <div className="border-b border-cyan-400/30 w-full text-[9px] text-cyan-300 font-mono">50%</div>
        <div className="border-b border-cyan-400/30 w-full text-[9px] text-cyan-300 font-mono">0%</div>
      </div>

      {chartSvg}

      {isCursorInView && hasVeData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/90 text-cyan-300 border border-cyan-500/40 shadow-sm">
            {currentVe !== undefined ? `${currentVe.toFixed(1)}%` : '--'}
          </span>
        </div>
      )}
    </div>
  );
});

TelemetryVirtualEnergyChannel.displayName = 'TelemetryVirtualEnergyChannel';
