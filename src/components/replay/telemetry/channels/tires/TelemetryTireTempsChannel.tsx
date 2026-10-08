import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Flame } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryTireTempsChannelProps {
  tireTempsPaths: CornerPaths;
  baselineTireTempsPaths?: CornerPaths;
  minTireTemp: number;
  maxTireTemp: number;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryTireTempsChannel: React.FC<TelemetryTireTempsChannelProps> = React.memo(({
  tireTempsPaths,
  baselineTireTempsPaths,
  minTireTemp,
  maxTireTemp,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineTireTempsPaths?.fl && (
        <path d={baselineTireTempsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.fr && (
        <path d={baselineTireTempsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.rl && (
        <path d={baselineTireTempsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineTireTempsPaths?.rr && (
        <path d={baselineTireTempsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {tireTempsPaths.fl && <path d={tireTempsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.fr && <path d={tireTempsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.rl && <path d={tireTempsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {tireTempsPaths.rr && <path d={tireTempsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [tireTempsPaths, baselineTireTempsPaths]);

  const tt = currentPoint?.tireTemps;
  const hasData = tt !== undefined || Boolean(tireTempsPaths.fl);
  const midTemp = Math.round((minTireTemp + maxTireTemp) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-loss-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-loss font-black text-[10px] tracking-wider flex items-center gap-1">
          <Flame className="w-3 h-3" />
          TIRE CARCASS TEMPS
        </span>
        {!(hasData && tt) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No tire thermal stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxTireTemp}°C`, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
        { label: `${midTemp}°C`, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
        { label: `${minTireTemp}°C`, borderClassName: 'border-b border-lmu-loss/40', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
      ]} />

      {isCursorInView && hasData && tt && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-loss-strong/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{tt[0]}°</span>
            <span className="text-lmu-azure-soft">FR:{tt[1]}°</span>
            <span className="text-lmu-warn-soft">RL:{tt[2]}°</span>
            <span className="text-lmu-loss-soft">RR:{tt[3]}°</span>
          </div>
        </div>
      )}
    </div>
  );
});
