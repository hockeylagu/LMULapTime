import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { CircleGauge } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryCornerChartPaths.js';
import { TelemetryWheelTrace } from '../TelemetryWheelTrace.js';

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
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <TelemetryWheelTrace paths={tirePressuresPaths} baselinePaths={baselineTirePressuresPaths} />
  ), [tirePressuresPaths, baselineTirePressuresPaths]);

  const tp = currentPoint?.tirePressures;
  const hasData = tp !== undefined || Boolean(tirePressuresPaths.fl);
  const midPres = Math.round((minTirePressure + maxTirePressure) / 2);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-info-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-info font-black text-[10px] tracking-wider flex items-center gap-1">
          <CircleGauge className="w-3 h-3" />
          TIRE PRESSURES
        </span>
        {!(hasData && tp) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No tire pressure stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxTirePressure} kPa`, borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info font-mono' },
        { label: `${midPres} kPa`, borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info font-mono' },
        { label: `${minTirePressure} kPa`, borderClassName: 'border-b border-lmu-info/40', labelClassName: 'text-[10px] text-lmu-info font-mono' },
      ]} />

      {isCursorInView && hasData && tp && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-info-strong/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{tp[0].toFixed(1)}</span>
            <span className="text-lmu-azure-soft">FR:{tp[1].toFixed(1)}</span>
            <span className="text-lmu-warn-soft">RL:{tp[2].toFixed(1)}</span>
            <span className="text-lmu-loss-soft">RR:{tp[3].toFixed(1)}</span>
            <span className="text-lmu-info text-[10px]">kPa</span>
          </div>
        </div>
      )}
    </div>
  );
});
