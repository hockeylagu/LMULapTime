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
  /** Names the primary row (the race names the followed car); else "Primary". */
  primaryLabel?: string;
  className?: string;
}

/** A label and its value, a fixed gap apart. */
const Reading = ({ title, children }: { title?: string; children: React.ReactNode }) =>
  <span className="inline-flex items-baseline gap-1.5" title={title}>{children}</span>;
const Label = ({ children }: { children: React.ReactNode }) => <span className="text-[11px] text-lmu-muted">{children}</span>;
const SLOT_WIDTH: Record<number, string> = { 2: 'w-[2ch]', 3: 'w-[3ch]', 4: 'w-[4ch]', 5: 'w-[5ch]', 8: 'w-[8ch]' };
/** A value right-aligned in a monospace slot `ch` characters wide. */
const Slot = ({ ch, color, className = '', children, 'aria-label': ariaLabel }: {
  ch: number; color?: string; className?: string; children: React.ReactNode; 'aria-label'?: string;
}) => <span aria-label={ariaLabel} className={`inline-block text-right font-mono tabular-nums ${SLOT_WIDTH[ch]} ${className}`} style={color ? { color } : undefined}>{children}</span>;
/** A driver aid's light: always there, lit while the aid works. */
const Aid = ({ on, tone, title, children }: { on?: boolean; tone: string; title: string; children: React.ReactNode }) =>
  <span data-active={on ? '' : undefined} title={`${title}${on ? ' working' : ''}`}
    className={`text-[10px] font-semibold ${on ? tone : 'text-lmu-muted/40'}`}>{children}</span>;

export const GpsMapTelemetryHud: React.FC<GpsMapTelemetryHudProps> = React.memo(({
  primaryPoint, baselinePoint, deltaTimeSec: rawDelta, primaryLabel = 'Primary', className = '',
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
    // Every value sits right-aligned in a slot as wide as its longest reading: nothing moves as the values change.
    return <div data-testid={baseline ? 'telemetry-hud-baseline' : 'telemetry-hud-primary'}
      className="flex shrink-0 items-baseline gap-x-6 whitespace-nowrap text-xs 2xl:text-[13px]">
      <span className="inline-flex w-[64px] items-center gap-1.5 truncate text-[11px] text-lmu-muted"
        title={baseline ? 'Reference lap; dashed telemetry traces.' : 'Selected lap; solid telemetry traces.'}>
        <span aria-hidden="true" className={baseline ? 'w-3 shrink-0 border-t border-dashed border-lmu-warn' : 'w-3 shrink-0 border-t border-lmu-info'} />
        {baseline ? 'Baseline' : primaryLabel}
      </span>
      <Reading><Slot ch={3} className="font-semibold">{formatReading(point.speedKmh, 0)}</Slot><Label>km/h</Label></Reading>
      <Reading title="Selected gear"><Label>GEAR</Label><Slot ch={2} className="font-semibold">{formatGear(point.gear)}</Slot></Reading>
      <Reading><Label>THR</Label><Slot ch={4} color={TELEMETRY_COLORS.throttle}>{formatReading(point.throttle, 0)}%</Slot>
        <Aid on={point.tcActive} tone="text-lmu-warn" title="Traction control">TC</Aid></Reading>
      <Reading><Label>BRK</Label><Slot ch={4} color={TELEMETRY_COLORS.brake}>{formatReading(point.brake, 0)}%</Slot>
        <Aid on={point.absActive} tone="text-lmu-info" title="ABS">ABS</Aid></Reading>
      <Reading><Label>STEER</Label><Slot ch={8}>{steering}</Slot></Reading>
      <Reading title={`G-force: ${accelerationDetail}`}><Slot ch={5} aria-label={`G-force: ${accelerationDetail}`}>{hasReading(totalG) ? `${totalG.toFixed(2)}G` : '--'}</Slot></Reading>
      {status && <span className="text-[11px] text-lmu-warn" title={getStatusSubtext(point)}>{status}</span>}
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
