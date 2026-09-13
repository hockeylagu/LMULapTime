import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';

export interface TelemetryWheelSpeedsChannelProps {
  wheelSpeedsPaths: CornerPaths;
  baselineWheelSpeedsPaths?: CornerPaths;
  maxWheelSpeed: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryWheelSpeedsChannel: React.FC<TelemetryWheelSpeedsChannelProps> = React.memo(({
  wheelSpeedsPaths,
  baselineWheelSpeedsPaths,
  maxWheelSpeed,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineWheelSpeedsPaths?.fl && (
        <path d={baselineWheelSpeedsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.fr && (
        <path d={baselineWheelSpeedsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.rl && (
        <path d={baselineWheelSpeedsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.rr && (
        <path d={baselineWheelSpeedsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {wheelSpeedsPaths.fl && <path d={wheelSpeedsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.fr && <path d={wheelSpeedsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.rl && <path d={wheelSpeedsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.rr && <path d={wheelSpeedsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [wheelSpeedsPaths, baselineWheelSpeedsPaths]);

  const ws = currentPoint?.wheelSpeeds;
  const hasData = ws !== undefined || Boolean(wheelSpeedsPaths.fl);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#07131a]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-cyan-500/20 text-cyan-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          WHEEL SPEEDS
        </span>
        {hasData && ws ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {ws[0].toFixed(0)}</span>
            <span className="text-blue-400">FR: {ws[1].toFixed(0)}</span>
            <span className="text-amber-400">RL: {ws[2].toFixed(0)}</span>
            <span className="text-rose-400">RR: {ws[3].toFixed(0)} km/h</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No wheel speed stream recorded
          </span>
        )}
        {currentComparison?.baseline.wheelSpeeds && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.wheelSpeeds[0].toFixed(0)} / {currentComparison.baseline.wheelSpeeds[1].toFixed(0)} / {currentComparison.baseline.wheelSpeeds[2].toFixed(0)} / {currentComparison.baseline.wheelSpeeds[3].toFixed(0)} km/h
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">{maxWheelSpeed} km/h</div>
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">{Math.round(maxWheelSpeed / 2)} km/h</div>
        <div className="border-b border-cyan-400/40 w-full text-[9px] text-cyan-400 font-mono">0 km/h</div>
      </div>

      {chartSvg}

      {isCursorInView && hasData && ws && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-cyan-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{ws[0].toFixed(0)}</span>
            <span className="text-blue-300">FR:{ws[1].toFixed(0)}</span>
            <span className="text-amber-300">RL:{ws[2].toFixed(0)}</span>
            <span className="text-rose-300">RR:{ws[3].toFixed(0)}</span>
            <span className="text-cyan-400 text-[9px]">km/h</span>
          </div>
        </div>
      )}
    </div>
  );
});
