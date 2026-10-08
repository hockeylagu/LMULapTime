import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Gauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../../utils/themeColors.js';

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
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineWheelSpeedsPaths?.fl && (
        <path d={baselineWheelSpeedsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.fr && (
        <path d={baselineWheelSpeedsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.rl && (
        <path d={baselineWheelSpeedsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineWheelSpeedsPaths?.rr && (
        <path d={baselineWheelSpeedsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {wheelSpeedsPaths.fl && <path d={wheelSpeedsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.fr && <path d={wheelSpeedsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.rl && <path d={wheelSpeedsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {wheelSpeedsPaths.rr && <path d={wheelSpeedsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [wheelSpeedsPaths, baselineWheelSpeedsPaths]);

  const ws = currentPoint?.wheelSpeeds;
  const hasData = ws !== undefined || Boolean(wheelSpeedsPaths.fl);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-aqua-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-aqua font-black text-[10px] tracking-wider flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          WHEEL SPEEDS
        </span>
        {!(hasData && ws) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No wheel speed stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxWheelSpeed} km/h`, borderClassName: 'border-b border-lmu-aqua/40', labelClassName: 'text-[10px] text-lmu-aqua font-mono' },
        { label: `${Math.round(maxWheelSpeed / 2)} km/h`, borderClassName: 'border-b border-lmu-aqua/40', labelClassName: 'text-[10px] text-lmu-aqua font-mono' },
        { label: '0 km/h', borderClassName: 'border-b border-lmu-aqua/40', labelClassName: 'text-[10px] text-lmu-aqua font-mono' },
      ]} />

      {isCursorInView && hasData && ws && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-aqua-strong/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{ws[0].toFixed(0)}</span>
            <span className="text-lmu-azure-soft">FR:{ws[1].toFixed(0)}</span>
            <span className="text-lmu-warn-soft">RL:{ws[2].toFixed(0)}</span>
            <span className="text-lmu-loss-soft">RR:{ws[3].toFixed(0)}</span>
            <span className="text-lmu-aqua text-[10px]">km/h</span>
          </div>
        </div>
      )}
    </div>
  );
});
