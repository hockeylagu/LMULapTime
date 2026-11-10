import React from 'react';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import { getSteerPercent } from '../../../../../shared/domain/formatters.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { formatGear, formatReading, getStatusLabel, getStatusSubtext, hasReading, totalAcceleration } from './telemetryReadouts.js';

export interface GpsMapTelemetryHudProps {
  primaryPoint?: ReplayTrajectoryPoint | null;
  baselinePoint?: ReplayTrajectoryPoint | null;
  /** Live lap delta; the trace under the HUD shows the speed and pedal differences at the cursor. */
  deltaTimeSec?: number | null;
  className?: string;
}

export const GpsMapTelemetryHud: React.FC<GpsMapTelemetryHudProps> = React.memo(({
  primaryPoint, baselinePoint, deltaTimeSec: rawDelta, className = '',
}) => {
  if (!primaryPoint) return null;
  const delta = hasReading(rawDelta) ? rawDelta : null;
  const comparing = Boolean(baselinePoint);
  const deltaColor = delta === null ? 'text-lmu-muted' : delta < -0.005 ? 'text-lmu-gain'
    : delta > 0.005 ? 'text-lmu-loss' : 'text-lmu-text-soft';
  const deltaState = delta === null ? 'no delta' : delta < -0.005 ? 'ahead' : delta > 0.005 ? 'behind' : 'even';
  const deltaTitle = 'Live delta: primary lap time minus baseline lap time at the same track distance; negative is ahead.';

  const renderLap = (point: ReplayTrajectoryPoint, baseline = false) => {
    const steer = point.steerYaw;
    const steering = hasReading(steer)
      ? `${Math.abs(getSteerPercent(steer)).toFixed(1)}% ${steer > 5 ? 'L' : steer < -5 ? 'R' : 'C'}` : '--';
    const totalG = totalAcceleration(point);
    const accelerationDetail = hasReading(point.accelLatG) && hasReading(point.accelLonG)
      ? `${Math.abs(point.accelLatG).toFixed(1)}${point.accelLatG > 0.05 ? 'L' : point.accelLatG < -0.05 ? 'R' : ''} · ${Math.abs(point.accelLonG).toFixed(1)}${point.accelLonG < -0.05 ? 'B' : 'A'}` : 'unavailable';
    // Only states worth a glance (limiter, pit lane, wet); being on track is the normal case.
    const status = getStatusLabel(point);
    return <div data-testid={baseline ? 'telemetry-hud-baseline' : 'telemetry-hud-primary'}
      className="grid shrink-0 grid-cols-[60px_68px_52px_76px_84px_88px_52px_max-content] items-center gap-x-2 whitespace-nowrap text-xs 2xl:text-[13px]">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-lmu-muted"
        title={baseline ? 'Reference lap; dashed telemetry traces.' : 'Selected lap; solid telemetry traces.'}>
        <span aria-hidden="true" className={baseline ? 'w-3 border-t border-dashed border-lmu-warn' : 'w-3 border-t border-lmu-info'} />
        {baseline ? 'Baseline' : 'Primary'}
      </span>
      <span className="font-mono tabular-nums"><span className="font-semibold">{formatReading(point.speedKmh)}</span> <span className="text-lmu-muted">km/h</span></span>
      <span className="font-mono tabular-nums" title="Selected gear">GEAR {formatGear(point.gear)}</span>
      <span className="inline-flex items-baseline gap-1 font-mono tabular-nums"><span className="text-lmu-muted font-sans text-[11px]">THR</span><span style={{ color: TELEMETRY_COLORS.throttle }}>{formatReading(point.throttle, 0)}%</span>
        {point.tcActive && <span className="text-[11px] text-lmu-warn">TC</span>}
      </span>
      <span className="inline-flex items-baseline gap-1 font-mono tabular-nums"><span className="text-lmu-muted font-sans text-[11px]">BRK</span><span style={{ color: TELEMETRY_COLORS.brake }}>{formatReading(point.brake, 0)}%</span>
        {point.absActive && <span className="text-[11px] text-lmu-info">ABS</span>}
      </span>
      <span className="inline-flex items-baseline gap-1"><span className="text-lmu-muted text-[11px]">STEER</span><span className="font-mono tabular-nums">{steering}</span></span>
      <span className="font-mono tabular-nums" title={`G-force: ${accelerationDetail}`} aria-label={`G-force: ${accelerationDetail}`}>
        {hasReading(totalG) ? `${totalG.toFixed(2)}G` : '--'}
      </span>
      {status ? <span className="text-[11px] text-lmu-warn" title={getStatusSubtext(point)}>{status}</span> : <span />}
    </div>;
  };

  return <div data-testid="gps-map-telemetry-hud" data-map-control
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    className={`relative w-full shrink-0 bg-lmu-strip border-b border-lmu-border text-lmu-text ${className}`}>
    <div className={`grid min-h-10 items-center gap-3 overflow-x-auto px-4 py-1.5 ${comparing ? 'grid-cols-[minmax(max-content,1fr)_120px_minmax(max-content,1fr)]' : 'grid-cols-1'}`}>
      {renderLap(primaryPoint)}
      {comparing && <>
        <span className={`justify-self-center font-mono tabular-nums text-[22px] leading-none font-bold ${deltaColor}`} title={deltaTitle}
          aria-label={`Live delta: ${deltaState}`}>{delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}s` : '--'}</span>
        {baselinePoint && <div className="justify-self-end">{renderLap(baselinePoint, true)}</div>}
      </>}
    </div>
  </div>;
});
