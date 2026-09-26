import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from './TelemetryStaticTrace.js';
import { CircleGauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../utils/themeColors.js';

export interface TelemetryTirePressuresChannelProps {
  tirePressuresPaths: CornerPaths;
  baselineTirePressuresPaths?: CornerPaths;
  minTirePressure: number;
  maxTirePressure: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryTirePressuresChannel: React.FC<TelemetryTirePressuresChannelProps> = React.memo(({
  tirePressuresPaths,
  baselineTirePressuresPaths,
  minTirePressure,
  maxTirePressure,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineTirePressuresPaths?.fl && (
        <path d={baselineTirePressuresPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTirePressuresPaths?.fr && (
        <path d={baselineTirePressuresPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTirePressuresPaths?.rl && (
        <path d={baselineTirePressuresPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTirePressuresPaths?.rr && (
        <path d={baselineTirePressuresPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {tirePressuresPaths.fl && <path d={tirePressuresPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tirePressuresPaths.fr && <path d={tirePressuresPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tirePressuresPaths.rl && <path d={tirePressuresPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tirePressuresPaths.rr && <path d={tirePressuresPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [tirePressuresPaths, baselineTirePressuresPaths]);

  const tp = currentPoint?.tirePressures;
  const hasData = tp !== undefined || Boolean(tirePressuresPaths.fl);
  const midPres = Math.round((minTirePressure + maxTirePressure) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-sky-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-sky-500/20 text-sky-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <CircleGauge className="w-3 h-3" />
          TIRE PRESSURES
        </span>
        {hasData && tp ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {tp[0].toFixed(1)}</span>
            <span className="text-blue-400">FR: {tp[1].toFixed(1)}</span>
            <span className="text-amber-400">RL: {tp[2].toFixed(1)}</span>
            <span className="text-rose-400">RR: {tp[3].toFixed(1)} kPa</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No tire pressure stream recorded
          </span>
        )}
        {currentComparison?.baseline.tirePressures && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.tirePressures[0].toFixed(1)} / {currentComparison.baseline.tirePressures[1].toFixed(1)} / {currentComparison.baseline.tirePressures[2].toFixed(1)} / {currentComparison.baseline.tirePressures[3].toFixed(1)} kPa
          </span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20" gridLines={[
        { label: `${maxTirePressure} kPa`, borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400 font-mono' },
        { label: `${midPres} kPa`, borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400 font-mono' },
        { label: `${minTirePressure} kPa`, borderClassName: 'border-b border-sky-400/40', labelClassName: 'text-[9px] text-sky-400 font-mono' },
      ]} />

      {isCursorInView && hasData && tp && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-sky-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{tp[0].toFixed(1)}</span>
            <span className="text-blue-300">FR:{tp[1].toFixed(1)}</span>
            <span className="text-amber-300">RL:{tp[2].toFixed(1)}</span>
            <span className="text-rose-300">RR:{tp[3].toFixed(1)}</span>
            <span className="text-sky-400 text-[9px]">kPa</span>
          </div>
        </div>
      )}
    </div>
  );
});
