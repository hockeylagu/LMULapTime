import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Layers } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryTireWearChannelProps {
  tireWearPaths: CornerPaths;
  baselineTireWearPaths?: CornerPaths;
  minTireWear: number;
  maxTireWear: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryTireWearChannel: React.FC<TelemetryTireWearChannelProps> = React.memo(({
  tireWearPaths,
  baselineTireWearPaths,
  minTireWear,
  maxTireWear,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineTireWearPaths?.fl && (
        <path d={baselineTireWearPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.fr && (
        <path d={baselineTireWearPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.rl && (
        <path d={baselineTireWearPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireWearPaths?.rr && (
        <path d={baselineTireWearPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {tireWearPaths.fl && <path d={tireWearPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.fr && <path d={tireWearPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.rl && <path d={tireWearPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireWearPaths.rr && <path d={tireWearPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [tireWearPaths, baselineTireWearPaths]);

  const tw = currentPoint?.tireWear;
  const hasData = tw !== undefined || Boolean(tireWearPaths.fl);
  const midWear = Math.round((minTireWear + maxTireWear) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-warn-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-warn font-black text-[10px] tracking-wider flex items-center gap-1">
          <Layers className="w-3 h-3" />
          TIRE WEAR
        </span>
        {!(hasData && tw) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No tire degradation stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxTireWear}%`, borderClassName: 'border-b border-lmu-warn/40', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
        { label: `${midWear}%`, borderClassName: 'border-b border-lmu-warn/40', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
        { label: `${minTireWear}%`, borderClassName: 'border-b border-lmu-warn/40', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
      ]} />

      {isCursorInView && hasData && tw && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{tw[0].toFixed(1)}%</span>
            <span className="text-lmu-azure-soft">FR:{tw[1].toFixed(1)}%</span>
            <span className="text-lmu-warn-soft">RL:{tw[2].toFixed(1)}%</span>
            <span className="text-lmu-loss-soft">RR:{tw[3].toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
});
