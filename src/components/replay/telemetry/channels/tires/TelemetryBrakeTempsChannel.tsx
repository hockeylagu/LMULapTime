import React, { useMemo } from 'react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { Thermometer } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerPaths } from '../../telemetryChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryBrakeTempsChannelProps {
  brakeTempsPaths: CornerPaths;
  baselineBrakeTempsPaths?: CornerPaths;
  maxBrakeTemp: number;
  currentPoint?: ReplayTelemetryPoint;
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
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineBrakeTempsPaths?.fl && (
        <path d={baselineBrakeTempsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.fr && (
        <path d={baselineBrakeTempsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.rl && (
        <path d={baselineBrakeTempsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.rr && (
        <path d={baselineBrakeTempsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {brakeTempsPaths.fl && <path d={brakeTempsPaths.fl} fill="none" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.fr && <path d={brakeTempsPaths.fr} fill="none" stroke={WHEEL_CORNER_COLORS.fr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.rl && <path d={brakeTempsPaths.rl} fill="none" stroke={WHEEL_CORNER_COLORS.rl} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.rr && <path d={brakeTempsPaths.rr} fill="none" stroke={WHEEL_CORNER_COLORS.rr} strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
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
