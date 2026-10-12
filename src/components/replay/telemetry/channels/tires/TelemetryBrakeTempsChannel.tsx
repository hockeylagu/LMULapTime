import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Thermometer } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryCornerChartPaths.js';
import { TelemetryWheelTrace } from '../TelemetryWheelTrace.js';

export interface TelemetryBrakeTempsChannelProps {
  brakeTempsPaths: CornerPaths;
  baselineBrakeTempsPaths?: CornerPaths;
  maxBrakeTemp: number;
  currentPoint?: ReplayTrajectoryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryBrakeTempsChannel: React.FC<TelemetryBrakeTempsChannelProps> = React.memo(({
  brakeTempsPaths,
  baselineBrakeTempsPaths,
  maxBrakeTemp,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <TelemetryWheelTrace paths={brakeTempsPaths} baselinePaths={baselineBrakeTempsPaths} />
  ), [brakeTempsPaths, baselineBrakeTempsPaths]);

  const temps = currentPoint?.brakeTemps;
  const hasTemps = temps !== undefined || Boolean(brakeTempsPaths.fl);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-orange-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="text-lmu-orange font-black text-[10px] tracking-wider flex items-center gap-1">
          <Thermometer className="w-3 h-3" />
          BRAKE ROTOR TEMPS
        </span>
        {!(hasTemps && temps) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            No brake rotor thermal stream recorded
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        <span className="text-lmu-aqua-soft">FL</span><span className="text-lmu-azure-soft">FR</span>
        <span className="text-lmu-warn-soft">RL</span><span className="text-lmu-loss-soft">RR</span>
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: `${maxBrakeTemp}°C`, borderClassName: 'border-b border-lmu-orange/40', labelClassName: 'text-[10px] text-lmu-orange font-mono' },
        { label: `${Math.round(maxBrakeTemp / 2)}°C`, borderClassName: 'border-b border-lmu-orange/40', labelClassName: 'text-[10px] text-lmu-orange font-mono' },
        { label: '0°C', borderClassName: 'border-b border-lmu-orange/40', labelClassName: 'text-[10px] text-lmu-orange font-mono' },
      ]} />

      {isCursorInView && hasTemps && temps && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-orange-strong/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-lmu-aqua-soft">FL:{temps[0]}°</span>
            <span className="text-lmu-azure-soft">FR:{temps[1]}°</span>
            <span className="text-lmu-warn-soft">RL:{temps[2]}°</span>
            <span className="text-lmu-loss-soft">RR:{temps[3]}°</span>
          </div>
        </div>
      )}
    </div>
  );
});
