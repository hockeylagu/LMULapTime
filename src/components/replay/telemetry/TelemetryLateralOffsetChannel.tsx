import React, { useMemo } from 'react';
import { GitCommit } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryLateralOffsetChannelProps {
  lateralOffsetPath: string;
  baselineLateralOffsetPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryLateralOffsetChannel: React.FC<TelemetryLateralOffsetChannelProps> = React.memo(({
  lateralOffsetPath,
  baselineLateralOffsetPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#2dd4bf" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineLateralOffsetPath && (
        <path
          d={baselineLateralOffsetPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {lateralOffsetPath && (
        <path
          d={lateralOffsetPath}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [lateralOffsetPath, baselineLateralOffsetPath]);

  const offsetM = currentPoint?.lateralOffsetM;
  const hasOffset = offsetM !== undefined || Boolean(lateralOffsetPath);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#071615]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-teal-500/20 text-teal-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <GitCommit className="w-3 h-3" />
          LATERAL OFFSET
        </span>
        {hasOffset ? (
          <span className="text-xs font-mono font-bold text-teal-300">
            {offsetM !== undefined ? `${offsetM > 0 ? `+${offsetM.toFixed(2)}` : offsetM.toFixed(2)}m` : '0.00m'}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No corridor offset recorded
          </span>
        )}
        {currentComparison?.baseline.lateralOffsetM !== undefined && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {currentComparison.baseline.lateralOffsetM.toFixed(2)}m
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-teal-400/30 w-full text-[8px] text-teal-400 font-mono">+10m Right</div>
        <div className="border-b border-teal-400/50 w-full text-[8px] text-teal-300 font-mono">0m Center</div>
        <div className="border-b border-teal-400/30 w-full text-[8px] text-teal-400 font-mono">-10m Left</div>
      </div>

      {chartSvg}

      {isCursorInView && hasOffset && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-teal-400/80 font-mono font-bold text-[11px] text-teal-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {offsetM !== undefined ? `${offsetM > 0 ? `+${offsetM.toFixed(2)}` : offsetM.toFixed(2)}m` : '0.00m'}
          </span>
          {currentComparison?.baseline.lateralOffsetM !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {currentComparison.baseline.lateralOffsetM.toFixed(2)}m
            </span>
          )}
        </div>
      )}
    </div>
  );
});
