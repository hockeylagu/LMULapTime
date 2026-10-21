import React, { useMemo } from 'react';
import { AlertTriangle, Disc } from 'lucide-react';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { ReplayTrajectoryPoint } from '../../../../../../shared/types/index.js';
import type { WheelPosition } from '../../../../../../shared/types/liveEvidence.js';
import { CornerPaths } from '../../telemetryCornerChartPaths.js';
import { TelemetryWheelTrace } from '../TelemetryWheelTrace.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetryWheelSlipChannelProps {
  wheelSlipPaths: CornerPaths;
  baselineWheelSlipPaths?: CornerPaths;
  hasWheelSlip: boolean;
  currentPoint?: ReplayTrajectoryPoint;
  isCursorInView: boolean;
  cursorPct: number;
}

const WHEEL_LABELS: Array<{ label: string; className: string }> = [
  { label: 'FL', className: 'text-lmu-aqua-soft' },
  { label: 'FR', className: 'text-lmu-azure-soft' },
  { label: 'RL', className: 'text-lmu-warn-soft' },
  { label: 'RR', className: 'text-lmu-loss-soft' },
];

const wheels = (positions: WheelPosition[]) => positions.map(position => position.toUpperCase()).join(' ');
const percent = (ratio: number | null) => ratio === null ? '—' : `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}`;

// ±15 % event thresholds (WHEEL_SLIP_EVENT_RATIO) on the ±30 % scale.
const guides = (
  <>
    <line x1="0" y1="52.5" x2="1000" y2="52.5" stroke={TELEMETRY_COLORS.baseline} strokeWidth="0.8" opacity="0.4" />
    <line x1="0" y1="31.25" x2="1000" y2="31.25" stroke={TELEMETRY_COLORS.throttle} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
    <line x1="0" y1="73.75" x2="1000" y2="73.75" stroke={TELEMETRY_COLORS.brake} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
  </>
);

/** Measured longitudinal slip: negative is braking/lockup, positive is wheelspin. */
export const TelemetryWheelSlipChannel: React.FC<TelemetryWheelSlipChannelProps> = React.memo(({
  wheelSlipPaths,
  baselineWheelSlipPaths,
  hasWheelSlip,
  currentPoint,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <TelemetryWheelTrace paths={wheelSlipPaths} baselinePaths={baselineWheelSlipPaths} guides={guides} />
  ), [wheelSlipPaths, baselineWheelSlipPaths]);

  const slip = currentPoint?.liveWheelSlip;

  return (
    <div className="relative flex-1 basis-0 min-h-[72px] border-b border-lmu-border/40 group bg-lmu-loss-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-loss font-black text-[10px] tracking-wider flex items-center gap-1">
          <Disc className="w-3 h-3" />
          WHEEL SLIP
        </span>
        {slip && slip.lockup.length > 0 && (
          <span className="px-1.5 py-px rounded bg-lmu-loss-strong text-lmu-deep font-black text-[10px] tracking-wider flex items-center gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5" /> LOCKUP {wheels(slip.lockup)}
          </span>
        )}
        {slip && slip.wheelspin.length > 0 && (
          <span className="px-1.5 py-px rounded bg-lmu-warn-strong text-black font-black text-[10px] tracking-wider">
            WHEELSPIN {wheels(slip.wheelspin)}
          </span>
        )}
        {!hasWheelSlip && (<span className="text-[10px] font-mono text-lmu-muted italic">
            Only for laps recorded live by the app
          </span>)}
      </div>

      <div className="absolute top-1 right-3 h-5 flex items-center gap-2 text-[10px] font-mono pointer-events-none">
        {WHEEL_LABELS.map(wheel => <span key={wheel.label} className={wheel.className}>{wheel.label}</span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: '+30% Wheelspin', borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn-soft font-mono' },
        { label: '0% Rolling', borderClassName: 'border-b border-lmu-border/50', labelClassName: 'text-[10px] text-lmu-muted font-mono' },
        { label: '-30% Lockup', borderClassName: 'border-b border-lmu-loss/30', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
      ]} />

      {isCursorInView && slip && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <div className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-loss/80 font-mono font-bold text-[10px] shadow-marker-lift flex items-center gap-1.5 whitespace-nowrap">
            {WHEEL_LABELS.map((wheel, index) => (
              <span key={wheel.label} className={wheel.className}>{wheel.label}:{percent(slip.ratios[index])}</span>
            ))}
            <span className="text-lmu-loss text-[10px]">%</span>
          </div>
        </div>
      )}
    </div>
  );
});
