import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Activity } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetrySuspPosChannelProps {
  suspPosPaths: CornerPaths;
  baselineSuspPosPaths?: CornerPaths;
  minSuspPos: number;
  maxSuspPos: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetrySuspPosChannel: React.FC<TelemetrySuspPosChannelProps> = React.memo(({
  suspPosPaths,
  baselineSuspPosPaths,
  minSuspPos,
  maxSuspPos,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineSuspPosPaths?.fl && (
        <path d={baselineSuspPosPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.fr && (
        <path d={baselineSuspPosPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.rl && (
        <path d={baselineSuspPosPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineSuspPosPaths?.rr && (
        <path d={baselineSuspPosPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {suspPosPaths.fl && <path d={suspPosPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.fr && <path d={suspPosPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.rl && <path d={suspPosPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {suspPosPaths.rr && <path d={suspPosPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [suspPosPaths, baselineSuspPosPaths]);

  const susp = currentPoint?.rideHeight;
  const hasData = susp !== undefined || Boolean(suspPosPaths.fl);
  const midSusp = Math.round((minSuspPos + maxSuspPos) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-gain-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-gain font-black text-[10px] tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3" />
          RIDE HEIGHT
        </span>
        {!(hasData && susp) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No ride-height stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxSuspPos} mm`, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
        { label: `${midSusp} mm`, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
        { label: `${minSuspPos} mm`, borderClassName: 'border-b border-lmu-gain/40', labelClassName: 'text-[10px] text-lmu-gain font-mono' },
      ]} />

      {isCursorInView && hasData && susp && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-gain-strong/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{susp[0].toFixed(1)}</span>
            <span className="text-lmu-azure-soft">FR:{susp[1].toFixed(1)}</span>
            <span className="text-lmu-warn-soft">RL:{susp[2].toFixed(1)}</span>
            <span className="text-lmu-loss-soft">RR:{susp[3].toFixed(1)}</span>
            <span className="text-lmu-gain text-[10px]">mm</span>
          </div>
        </div>
      )}
    </div>
  );
});
