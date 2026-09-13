import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryRpmChannelProps {
  rpmPath: string;
  rpmArea?: string;
  baselineRpmPath?: string;
  maxRpm: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryRpmChannel: React.FC<TelemetryRpmChannelProps> = React.memo(({
  rpmPath,
  rpmArea,
  baselineRpmPath,
  maxRpm,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="rpmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {rpmArea && <path d={rpmArea} fill="url(#rpmGrad)" opacity="0.25" />}
      {baselineRpmPath && (
        <path
          d={baselineRpmPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {rpmPath && (
        <path
          d={rpmPath}
          fill="none"
          stroke="#c084fc"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [rpmArea, baselineRpmPath, rpmPath]);

  const currentRpm = currentPoint?.engineRpm;
  const hasRpmData = currentRpm !== undefined || Boolean(rpmPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[68px] border-b border-lmu-border/40 group bg-[#130b1e]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-purple-500/20 text-purple-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          ENGINE RPM
        </span>
        {hasRpmData ? (
          <span className="text-xs font-mono font-bold text-purple-300">
            {currentRpm?.toLocaleString() ?? 0} <span className="text-[10px] font-normal text-purple-400/70">rpm</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No RPM stream recorded
          </span>
        )}
        {currentComparison?.baseline.engineRpm !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.engineRpm.toLocaleString()} rpm
          </span>
        )}
      </div>

      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">{maxRpm} rpm</div>
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">{Math.round(maxRpm / 2)} rpm</div>
        <div className="border-b border-purple-400/30 w-full text-[9px] text-purple-300 font-mono">0 rpm</div>
      </div>

      {chartSvg}

      {isCursorInView && hasRpmData && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-purple-400/80 font-mono font-bold text-[11px] text-purple-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {currentRpm?.toLocaleString() ?? 0} <span className="text-[9px] font-normal text-purple-400/70">rpm</span>
          </span>
          {currentComparison?.baseline.engineRpm !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {currentComparison.baseline.engineRpm.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
