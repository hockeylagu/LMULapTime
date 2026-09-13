import React, { useMemo } from 'react';
import { Thermometer } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerPaths } from './telemetryChartPaths.js';

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
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Baseline dashed lines */}
      {baselineBrakeTempsPaths?.fl && (
        <path d={baselineBrakeTempsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.fr && (
        <path d={baselineBrakeTempsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.rl && (
        <path d={baselineBrakeTempsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}
      {baselineBrakeTempsPaths?.rr && (
        <path d={baselineBrakeTempsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
      )}

      {/* Primary solid lines */}
      {brakeTempsPaths.fl && <path d={brakeTempsPaths.fl} fill="none" stroke="#06b6d4" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.fr && <path d={brakeTempsPaths.fr} fill="none" stroke="#3b82f6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.rl && <path d={brakeTempsPaths.rl} fill="none" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
      {brakeTempsPaths.rr && <path d={brakeTempsPaths.rr} fill="none" stroke="#f43f5e" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  ), [brakeTempsPaths, baselineBrakeTempsPaths]);

  const temps = currentPoint?.brakeTemps;
  const hasTemps = temps !== undefined || Boolean(brakeTempsPaths.fl);

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-[#160d09]/60">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <span className="p-1 rounded bg-orange-500/20 text-orange-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Thermometer className="w-3 h-3" />
          BRAKE ROTOR TEMPS
        </span>
        {hasTemps && temps ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="text-cyan-400">FL: {temps[0]}°C</span>
            <span className="text-blue-400">FR: {temps[1]}°C</span>
            <span className="text-amber-400">RL: {temps[2]}°C</span>
            <span className="text-rose-400">RR: {temps[3]}°C</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            No brake rotor thermal stream recorded
          </span>
        )}
        {currentComparison?.baseline.brakeTemps && (
          <span className="text-[10px] font-mono text-amber-400/80 ml-1 pl-2 border-l border-white/10 hidden sm:inline">
            Base: {currentComparison.baseline.brakeTemps[0]}° / {currentComparison.baseline.brakeTemps[1]}° / {currentComparison.baseline.brakeTemps[2]}° / {currentComparison.baseline.brakeTemps[3]}°
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-2 px-3 pointer-events-none opacity-20">
        <div className="border-b border-orange-400/40 w-full text-[9px] text-orange-400 font-mono">{maxBrakeTemp}°C</div>
        <div className="border-b border-orange-400/40 w-full text-[9px] text-orange-400 font-mono">{Math.round(maxBrakeTemp / 2)}°C</div>
        <div className="border-b border-orange-400/40 w-full text-[9px] text-orange-400 font-mono">0°C</div>
      </div>

      {chartSvg}

      {isCursorInView && hasTemps && temps && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-[#070c18] border border-orange-500/80 font-mono font-bold text-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-cyan-300">FL:{temps[0]}°</span>
            <span className="text-blue-300">FR:{temps[1]}°</span>
            <span className="text-amber-300">RL:{temps[2]}°</span>
            <span className="text-rose-300">RR:{temps[3]}°</span>
          </div>
        </div>
      )}
    </div>
  );
});
