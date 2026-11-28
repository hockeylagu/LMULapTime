import React, { useMemo } from 'react';
import { Hand } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

export interface TelemetrySteerForceChannelProps {
  steerForcePath: string;
  baselineSteerForcePath?: string;
  holdStillBands: string;
  counterSteerBands: string;
  hasSteerForce: boolean;
  currentPoint?: ReplayTrajectoryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

/** Signed % of the wheel base's peak, positive left (ISO). */
export const formatSteerForce = (pct: number | undefined): string =>
  pct === undefined ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%${Math.abs(pct) < 1 ? '' : pct > 0 ? ' L' : ' R'}`;

const TOOLTIP = 'The driver\'s steering force, from the force feedback: % of the wheel base\'s peak, positive pushing left. '
  + 'Two laps compare only at the same in-game FFB strength (the recording does not hold it). '
  + 'Amber bands: the hands hold the wheel still while the force changes (light hands). '
  + 'Red bands: the hands push against the wheel\'s angle (passive counter-steer).';

export const TelemetrySteerForceChannel: React.FC<TelemetrySteerForceChannelProps> = React.memo(({
  steerForcePath,
  baselineSteerForcePath,
  holdStillBands,
  counterSteerBands,
  hasSteerForce,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 8 1000 84" preserveAspectRatio="none" className="w-full h-full">
      {holdStillBands && <path d={holdStillBands} fill={TELEMETRY_COLORS.oversteer} fillOpacity={0.18} />}
      {counterSteerBands && <path d={counterSteerBands} fill={TELEMETRY_COLORS.loss} fillOpacity={0.22} />}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={TELEMETRY_COLORS.steerForce} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineSteerForcePath && (
        <path d={baselineSteerForcePath} fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.2" strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      {steerForcePath && (
        <path d={steerForcePath} fill="none" stroke={TELEMETRY_COLORS.steerForce} strokeWidth="1.2" vectorEffect="non-scaling-stroke"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  ), [steerForcePath, baselineSteerForcePath, holdStillBands, counterSteerBands]);

  const force = currentPoint?.driverForcePct;
  const baseForce = currentComparison?.baseline.driverForcePct;
  const moment = currentPoint?.passiveCounterSteer ? { label: 'COUNTER-STEER', className: 'text-lmu-loss-soft' }
    : currentPoint?.steerHoldStill ? { label: 'LIGHT HANDS', className: 'text-lmu-warn-soft' } : null;

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-lmu-azure-deep/20" title={TOOLTIP}>
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-azure font-black text-[10px] tracking-wider flex items-center gap-1">
          <Hand className="w-3 h-3" />
          STEER FORCE
        </span>
        <span className="text-[10px] font-mono text-lmu-muted">% of FFB</span>
        {!hasSteerForce && (
          <span className="text-[10px] font-mono text-lmu-muted italic">Needs DuckDB telemetry for this lap</span>
        )}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: '+100% Left', borderClassName: 'border-b border-lmu-azure/30', labelClassName: 'text-[10px] text-lmu-azure font-mono' },
        { label: '0%', borderClassName: 'border-b border-lmu-azure/50', labelClassName: 'text-[10px] text-lmu-azure-soft font-mono' },
        { label: '-100% Right', borderClassName: 'border-b border-lmu-azure/30', labelClassName: 'text-[10px] text-lmu-azure font-mono' },
      ]} />

      {isCursorInView && hasSteerForce && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-azure/80 font-mono font-bold text-[11px] text-lmu-azure-soft shadow-marker-lift whitespace-nowrap">
            {formatSteerForce(force)}
          </span>
          {baseForce !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-marker-lift whitespace-nowrap">
              B: {formatSteerForce(baseForce)}
            </span>
          )}
          {moment && (
            <span className={`px-1.5 py-0.5 rounded-md bg-lmu-badge border border-white/10 font-mono font-bold text-[10px] shadow-marker-lift whitespace-nowrap ${moment.className}`}>
              {moment.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
