import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { computeLapComparisons, type PointComparison } from '../../../../utils/replayComparison.js';
import { TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../../utils/themeColors.js';
import type { DockChannel } from '../../map/telemetry/dockChannel.js';
import { computeChartBounds, computeDeltaScale } from '../../telemetry/telemetryChartPathBuilders.js';
import { computeCornerExtrema } from '../../telemetry/telemetryCornerChartPaths.js';
import { CHANNEL_VALUES, channelShare, type ChannelScale } from '../../telemetry/telemetryChannels.js';
import type { LapCurtains } from './curtainLayer.js';
import type { CurtainValues } from './traceCurtain.js';

const WHEEL_COLOURS = [WHEEL_CORNER_COLORS.fl, WHEEL_CORNER_COLORS.fr, WHEEL_CORNER_COLORS.rl, WHEEL_CORNER_COLORS.rr];
/** The baseline lap's per-wheel edges stand at half the lap's opacity, as its chart traces are fainter. */
const BASELINE_WHEEL_OPACITY = 0.5;

const hasAny = (values: CurtainValues) => values.edges.some(edge => edge.some(Number.isFinite));

/** Throttle and brake on one curtain (the dock's "Throttle + Brake"): both pedals' edges on the pedals' 0–100 % scale. */
const PEDAL_SCALE: ChannelScale = { from: 'bottom', min: 0, max: 100 };
const PEDALS = [
  { read: (point: ReplayTrajectoryData['points'][number]) => point.throttle, colour: TELEMETRY_COLORS.throttle },
  { read: (point: ReplayTrajectoryData['points'][number]) => point.brake, colour: TELEMETRY_COLORS.brake },
];

/**
 * One chart channel's curtains for a lap and its comparison lap, on the chart's scale and in its colours (`telemetryChannels.ts`):
 * the scales come from both laps as the chart's do. With the scale they stand on (the legend's); null when the lap carries none of
 * the channel (its note shows instead).
 */
export function lapCurtains(
  id: DockChannel, lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
): { curtains: LapCurtains; scale: ChannelScale } | null {
  if (id === 'pedals') return pedalCurtains(lap, baseline);
  const channel = CHANNEL_VALUES[id];
  const comparisons: PointComparison[] = baseline ? computeLapComparisons(lap.points, baseline.points, lap.trackLengthM) : [];
  if (channel.kind === 'delta') {
    if (!comparisons.length) return null;
    const scale: ChannelScale = { from: 'centre', limit: computeDeltaScale(lap.points, comparisons, 0, lap.points.length - 1).maxDelta };
    const primary = single(comparisons.map(comparison => comparison.deltaTimeSec), scale, channel.lap, () => channel.lap);
    return hasAny(primary) ? { curtains: { primary, baseline: null }, scale } : null;
  }
  const bounds = computeChartBounds(lap.points, comparisons);
  if (channel.kind === 'scalar') {
    const scale = channel.scale(bounds), { bySign } = channel;
    const of = (laps: ReplayTrajectoryData, colour: string) => {
      const values = laps.points.map(point => channel.read(point));
      const fill = bySign ? (i: number) => ((values[i] ?? 0) >= 0 ? bySign.positive : bySign.negative) : () => colour;
      return single(values, scale, colour, fill);
    };
    const primary = of(lap, channel.lap);
    if (!hasAny(primary)) return null;
    return { curtains: { primary, baseline: baseline ? of(baseline, channel.baseline) : null }, scale };
  }
  const scale = channel.scale(computeCornerExtrema(lap.points, comparisons, bounds.maxSpd));
  const of = (laps: ReplayTrajectoryData, fill: string, edgeOpacity: number): CurtainValues => {
    const edges = WHEEL_COLOURS.map(() => new Array<number>(laps.points.length).fill(NaN));
    laps.points.forEach((point, i) => {
      const wheels = channel.read(point);
      wheels?.forEach((value, wheel) => { if (typeof value === 'number' && Number.isFinite(value)) edges[wheel][i] = channelShare(scale, value); });
    });
    return { edges, edgeColours: WHEEL_COLOURS, fillColours: laps.points.map(() => fill), edgeOpacity };
  };
  // Four edges over one light fill: in the lap's colour, the baseline's in the baseline's.
  const primary = of(lap, TELEMETRY_COLORS.primary, 1);
  if (!hasAny(primary)) return null;
  return { curtains: { primary, baseline: baseline ? of(baseline, TELEMETRY_COLORS.baseline, BASELINE_WHEEL_OPACITY) : null }, scale };
}

/**
 * Throttle's and brake's edges in their colours over a fill in the pressed pedal's colour (the higher one); the baseline's edges at
 * half opacity over a fill in the baseline's colour, as the per-wheel channels.
 */
function pedalCurtains(lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null): { curtains: LapCurtains; scale: ChannelScale } | null {
  const of = (laps: ReplayTrajectoryData, fill: string | null, edgeOpacity: number): CurtainValues => {
    const edges = PEDALS.map(pedal => laps.points.map(point => {
      const value = pedal.read(point);
      return value === undefined || !Number.isFinite(value) ? NaN : channelShare(PEDAL_SCALE, value);
    }));
    const fillColours = laps.points.map((_, i) => fill ?? (edges[1][i] > (edges[0][i] || 0) ? PEDALS[1].colour : PEDALS[0].colour));
    return { edges, edgeColours: PEDALS.map(pedal => pedal.colour), fillColours, edgeOpacity };
  };
  const primary = of(lap, null, 1);
  if (!hasAny(primary)) return null;
  return { curtains: { primary, baseline: baseline ? of(baseline, TELEMETRY_COLORS.baseline, BASELINE_WHEEL_OPACITY) : null }, scale: PEDAL_SCALE };
}

/** A single-value channel's curtain: one edge in `colour`, the fill per sample. */
function single(values: Array<number | undefined>, scale: ChannelScale, colour: string, fill: (i: number) => string): CurtainValues {
  return {
    edges: [values.map(value => (value === undefined || !Number.isFinite(value) ? NaN : channelShare(scale, value)))],
    edgeColours: [colour], fillColours: values.map((_, i) => fill(i)), edgeOpacity: 1,
  };
}
