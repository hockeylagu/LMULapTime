import { AVAILABLE_TELEMETRY_CHANNELS } from '../../telemetry/presets/telemetryPresets.js';
import type { DockChannel } from '../../map/telemetry/dockChannel.js';
import { CHANNEL_VALUES, type ChannelScale, type TracePoint, type WheelPoint } from '../../telemetry/telemetryChannels.js';

/** Decimals by size, as the chart's readouts: two for g, one under ten, none above. */
const decimals = (unit: string, value: number) => (unit === 'G' ? 2 : Math.abs(value) < 10 ? 1 : 0);

/** A trace channel's unit as its tooltip and legend show it: the chart's, but none for the gear (a count, its chart's unit names its range). */
export function traceUnit(id: Exclude<DockChannel, 'pedals'>): string {
  return id === 'gear' ? '' : AVAILABLE_TELEMETRY_CHANNELS.find(info => info.id === id)?.unit ?? '';
}

const formatted = (value: number, unit: string, signed: boolean) =>
  `${signed && value > 0 ? '+' : ''}${value.toFixed(decimals(unit, value))}${unit ? ` ${unit}` : ''}`;

/**
 * A trace channel's value at a sample in the chart's unit, for the hover tooltip: a centred channel keeps its sign (the curtain
 * stands by size), balance says which way the car slides, a per-wheel channel gives each wheel. Null without the channel there;
 * delta is the comparison's (`deltaTimeSec`), not the sample's. `scale` is the one the curtains stand on.
 */
export function traceReadout(
  id: DockChannel, scale: ChannelScale, point: (TracePoint & WheelPoint) | undefined, deltaTimeSec?: number | null,
): string | null {
  if (id === 'pedals') {
    if (!point || (point.throttle === undefined && point.brake === undefined)) return null;
    return `THR ${(point.throttle ?? 0).toFixed(0)} % · BRK ${(point.brake ?? 0).toFixed(0)} %`;
  }
  const channel = CHANNEL_VALUES[id], unit = traceUnit(id);
  if (channel.kind === 'delta') return deltaTimeSec === null || deltaTimeSec === undefined ? null : `${deltaTimeSec > 0 ? '+' : ''}${deltaTimeSec.toFixed(2)} s`;
  if (!point) return null;
  if (channel.kind === 'wheels') {
    const values = channel.read(point), factor = channel.unitFactor ?? 1;
    if (!values?.some(value => typeof value === 'number')) return null;
    return (['FL', 'FR', 'RL', 'RR'] as const)
      .map((wheel, i) => { const value = values[i]; return `${wheel} ${typeof value === 'number' ? (value * factor).toFixed(0) : '—'}`; })
      .join(' · ') + (unit ? ` ${unit}` : '');
  }
  const value = channel.read(point);
  if (value === undefined || !Number.isFinite(value)) return null;
  const text = formatted(value, unit, scale.from === 'centre');
  if (id === 'under-over-steer') return `${text} ${value >= 0 ? 'understeer' : 'oversteer'}`;
  return text;
}
