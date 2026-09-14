import React, { useMemo } from 'react';
import { Compass } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetrySteerChannelProps {
  steerPath: string;
  baselineSteerPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySteerChannel: React.FC<TelemetrySteerChannelProps> = React.memo(({
  steerPath,
  baselineSteerPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#818cf8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineSteerPath && (
        <path
          d={baselineSteerPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {steerPath && (
        <path
          d={steerPath}
          fill="none"
          stroke="#818cf8"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [steerPath, baselineSteerPath]);

  const steerAngle = currentPoint?.steerYaw ?? 0;
  const baseSteerAngle = currentComparison?.baseline.steerYaw ?? 0;
  const steerDir = steerAngle < -3 ? 'LEFT' : steerAngle > 3 ? 'RIGHT' : 'CENTER';

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#0e0c1a]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Compass className="w-3 h-3" />
          STEERING
        </span>
        <span className="text-xs font-mono font-bold text-indigo-300">
          {Math.abs(steerAngle).toFixed(1)}° {steerDir}
        </span>
        {currentComparison && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {Math.abs(baseSteerAngle).toFixed(1)}°
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-indigo-400/30 w-full text-[8px] text-indigo-400 font-mono">+270° R</div>
        <div className="border-b border-indigo-400/50 w-full text-[8px] text-indigo-300 font-mono">0° Center</div>
        <div className="border-b border-indigo-400/30 w-full text-[8px] text-indigo-400 font-mono">-270° L</div>
      </div>

      {chartSvg}

      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-indigo-400/80 font-mono font-bold text-[11px] text-indigo-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {steerAngle > 0 ? `+${steerAngle.toFixed(0)}°` : `${steerAngle.toFixed(0)}°`}
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseSteerAngle.toFixed(0)}°
            </span>
          )}
        </div>
      )}
    </div>
  );
});
