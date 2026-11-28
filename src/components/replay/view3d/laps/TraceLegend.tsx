import type { ReactNode } from 'react';
import { AVAILABLE_TELEMETRY_CHANNELS } from '../../telemetry/presets/telemetryPresets.js';
import type { DockChannel } from '../../map/telemetry/dockChannel.js';
import { CHANNEL_VALUES, type ChannelScale } from '../../telemetry/telemetryChannels.js';
import { TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../../utils/themeColors.js';
import { useCurtainHeight } from './curtainHeight.js';
import { traceUnit } from './traceReadout.js';

interface Props {
  trace: DockChannel;
  /** The scale the curtains stand on; null when the lap has none of the channel (the note shows instead). */
  scale: ChannelScale | null;
  /** A comparison lap stands its own curtain. */
  compared: boolean;
  /** A shown lap's steering force is estimated from its replay. */
  estimated?: boolean;
}

const number = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 1 : 0));

/** What the full height (`heightM` tall, its step) and the road stand for, in the chart's unit. */
function scaleText(scale: ChannelScale, unit: string, factor: number, heightM: number): string {
  const top = scale.from === 'centre' ? `±${number(scale.limit * factor)}` : number(scale.max * factor);
  return `${top}${unit ? ` ${unit}` : ''} at ${heightM} m · ${scale.from === 'centre' ? 0 : number(scale.min * factor)} at the road`;
}

const swatch = (colour: string, label: string) => (
  <span key={label} className="flex items-center gap-1 text-lmu-text-soft">
    <span className="w-3 h-1 rounded-sm shrink-0" style={{backgroundColor: colour}} />
    {label}
  </span>
);

/** The trace curtain's legend in the 3D view's corner: the channel, its scale and its colours, or why the lap has no curtain. */
export function TraceLegend({trace, scale, compared, estimated = false}: Props) {
  if (trace === 'pedals') {
    return <LegendBox name="Throttle + Brake" scale={scale} unit="%" factor={1} missing="pedal"
      colours={[swatch(TELEMETRY_COLORS.throttle, 'Throttle'), swatch(TELEMETRY_COLORS.brake, 'Brake'),
        ...(compared ? [<span key="faint" className="text-lmu-muted">baseline fainter</span>] : [])]} />;
  }
  const info = AVAILABLE_TELEMETRY_CHANNELS.find(channel => channel.id === trace), channel = CHANNEL_VALUES[trace];
  // The chart panel's own title (STEER FORCE, BALANCE): short enough for the corner.
  const name = `${info?.shortName ?? trace}${estimated ? ' ≈ estimated' : ''}`;
  const colours = channel.kind === 'wheels'
    ? [...(['fl', 'fr', 'rl', 'rr'] as const).map(wheel => swatch(WHEEL_CORNER_COLORS[wheel], wheel.toUpperCase())),
      ...(compared ? [<span key="faint" className="text-lmu-muted">baseline fainter</span>] : [])]
    : channel.kind === 'delta' ? [swatch(channel.lap, 'Lap')]
      : channel.bySign ? [swatch(channel.bySign.positive, 'Understeer'), swatch(channel.bySign.negative, 'Oversteer')]
        : [swatch(channel.lap, 'Lap'), ...(compared ? [swatch(channel.baseline, 'Baseline')] : [])];
  return <LegendBox name={name} scale={scale} unit={traceUnit(trace)} factor={channel.kind === 'wheels' ? channel.unitFactor ?? 1 : 1}
    missing={info?.name.toLowerCase() ?? trace} colours={colours} />;
}

interface LegendBoxProps {
  name: string;
  scale: ChannelScale | null;
  unit: string;
  factor: number;
  /** The channel's name in the note when the lap has none of it. */
  missing: string;
  colours: ReactNode[];
}

function LegendBox({name, scale, unit, factor, missing, colours}: LegendBoxProps) {
  const heightM = useCurtainHeight();
  return (
    <div data-testid="trace-legend"
      className="absolute bottom-2 left-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[min(36rem,calc(100%-1rem))] bg-lmu-strip/90 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] shadow-lg pointer-events-none font-mono">
      <span className="font-bold text-white uppercase tracking-wider">{name}</span>
      {scale ? <>
        <span className="text-lmu-muted">{scaleText(scale, unit, factor, heightM)}</span>
        {colours}
      </> : <span className="text-lmu-muted italic">No {missing} data on this lap: the racing line shows instead</span>}
    </div>
  );
}
