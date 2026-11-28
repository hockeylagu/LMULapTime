import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { CHART_COLORS, TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../utils/themeColors.js';
import type { TelemetryChannelId } from './presets/telemetryPresets.js';

/**
 * Every chart channel's value, scale and colours, read by the chart paths (`telemetryChartPathBuilders.ts`,
 * `telemetryCornerChartPaths.ts`) and the 3D trace curtains (`view3d/laps/traceValues.ts`), so the two cannot drift.
 */

/** The channels a sample of either lap (a trajectory point or an interpolated one) can carry. */
export interface TracePoint {
  speedKmh?: number;
  throttle?: number;
  brake?: number;
  steerYaw?: number;
  gear?: number;
  engineRpm?: number;
  lateralOffsetM?: number;
  accelLatG?: number;
  accelLonG?: number;
  accelTotalG?: number;
  slipAngleDeg?: number;
  understeerDeg?: number;
  tireSlipPct?: number;
  yawRateDeg?: number;
  fuel?: number;
  virtualEnergy?: number;
  soc?: number;
  regenRate?: number;
  driverForcePct?: number;
}

/** The per-wheel channels a sample carries. */
export type WheelPoint = Pick<ReplayTrajectoryPoint, 'brakeTemps' | 'rideHeight' | 'wheelSpeeds' | 'tirePressures' | 'tireWear' | 'tireTemps' | 'wheelSlip'>;

/** The scales the single-value traces are normalised against, shared by both laps. */
export interface ChartBounds {
  maxSpd: number;
  maxRpm: number;
  maxFuel: number;
  maxRegen: number;
  maxGear: number;
}

/** The per-wheel channels' scales and which of them the laps carry, shared by both laps. */
export interface CornerExtrema {
  maxBrakeTemp: number;
  hasBrakeTemps: boolean;
  minSuspPos: number;
  maxSuspPos: number;
  hasSuspPos: boolean;
  maxWheelSpeed: number;
  hasWheelSpeeds: boolean;
  minTirePressure: number;
  maxTirePressure: number;
  hasTirePressures: boolean;
  minTireWear: number;
  maxTireWear: number;
  hasTireWear: boolean;
  minTireTemp: number;
  maxTireTemp: number;
  hasTireTemps: boolean;
}

/** A channel's chart range: from the bottom (`min` at the bottom, `max` at the top) or centred on zero (±`limit`). */
export type ChannelScale = { from: 'bottom'; min: number; max: number } | { from: 'centre'; limit: number };

/** Lap and baseline lap colours, as the chart draws the two traces. */
interface LapColours {
  lap: string;
  baseline: string;
}

export interface ScalarChannel extends LapColours {
  kind: 'scalar';
  /** The sample's value, undefined when it does not carry the channel. */
  read: (p: TracePoint) => number | undefined;
  scale: (bounds: ChartBounds) => ChannelScale;
  /** The fill's colour by the value's sign (the balance chart: understeer above, oversteer below). */
  bySign?: { positive: string; negative: string };
}

export interface WheelChannel {
  kind: 'wheels';
  /** FL, FR, RL, RR; null or undefined where a wheel has no value. */
  read: (p: WheelPoint) => ReadonlyArray<number | null | undefined> | undefined;
  scale: (extrema: CornerExtrema) => ChannelScale;
  /** The value in the channel's unit (`AVAILABLE_TELEMETRY_CHANNELS`): wheel slip is read as a ratio and shown in %. */
  unitFactor?: number;
}

/** The time delta to the baseline lap: a comparison of the two, drawn on the lap only. */
export interface DeltaChannel {
  kind: 'delta';
  lap: string;
}

export type ChannelValues = ScalarChannel | WheelChannel | DeltaChannel;

/** Measured wheel slip ratio shown at full channel height (±30 %). */
const WHEEL_SLIP_CHART_RANGE = 0.3;

const bottom = (min: number, max: number): ChannelScale => ({ from: 'bottom', min, max });
const centre = (limit: number): ChannelScale => ({ from: 'centre', limit });
const scalar = (read: ScalarChannel['read'], scale: ScalarChannel['scale'], lap: string, rest: Partial<ScalarChannel> = {}): ScalarChannel => ({
  kind: 'scalar', read, scale, lap, baseline: TELEMETRY_COLORS.baseline, ...rest,
});
const wheels = (read: WheelChannel['read'], scale: WheelChannel['scale'], unitFactor?: number): WheelChannel => ({ kind: 'wheels', read, scale, unitFactor });

export const CHANNEL_VALUES: Record<TelemetryChannelId, ChannelValues> = {
  'speed': scalar(p => p.speedKmh || 0, b => bottom(0, b.maxSpd), TELEMETRY_COLORS.primary),
  'delta': { kind: 'delta', lap: TELEMETRY_COLORS.rpm },
  'throttle': scalar(p => p.throttle || 0, () => bottom(0, 100), TELEMETRY_COLORS.throttle),
  'brake': scalar(p => p.brake || 0, () => bottom(0, 100), TELEMETRY_COLORS.brake),
  'gear': scalar(p => p.gear, b => bottom(0, b.maxGear), TELEMETRY_COLORS.gear),
  // Steering (ISO 8855, positive left): ±270 chart degrees as ±100 % of the wheel's half range.
  'steer': scalar(p => ((p.steerYaw || 0) / 270) * 100, () => centre(100), TELEMETRY_COLORS.steer),
  // The driver's steering force: ±100 % of the wheel base's peak, positive left.
  'steer-force': scalar(p => p.driverForcePct, () => centre(100), TELEMETRY_COLORS.steerForce),
  'rpm': scalar(p => p.engineRpm, b => bottom(0, b.maxRpm), TELEMETRY_COLORS.rpm),
  'brake-temps': wheels(p => p.brakeTemps, e => bottom(0, e.maxBrakeTemp)),
  'ride-height': wheels(p => p.rideHeight, e => bottom(e.minSuspPos, e.maxSuspPos)),
  'wheel-speeds': wheels(p => p.wheelSpeeds, e => bottom(0, e.maxWheelSpeed)),
  // Measured wheel slip: lockup below, wheelspin above.
  'wheel-slip': wheels(p => p.wheelSlip?.ratios, () => centre(WHEEL_SLIP_CHART_RANGE), 100),
  'tire-pressures': wheels(p => p.tirePressures, e => bottom(e.minTirePressure, e.maxTirePressure)),
  'tire-wear': wheels(p => p.tireWear, e => bottom(e.minTireWear, e.maxTireWear)),
  'tire-temps': wheels(p => p.tireTemps, e => bottom(e.minTireTemp, e.maxTireTemp)),
  // Lateral offset, positive left of the centerline.
  'lateral-offset': scalar(p => p.lateralOffsetM, () => centre(10), TELEMETRY_COLORS.lateralOffset),
  'accel-lat': scalar(p => p.accelLatG, () => centre(3), TELEMETRY_COLORS.primary),
  'accel-lon': scalar(p => p.accelLonG, () => centre(3), TELEMETRY_COLORS.primary),
  'accel-total': scalar(p => p.accelTotalG, () => bottom(0, 4), TELEMETRY_COLORS.tireScrub),
  'slip-angle': scalar(p => p.slipAngleDeg, () => centre(12), TELEMETRY_COLORS.slipAngle),
  'under-over-steer': scalar(p => p.understeerDeg, () => centre(8), CHART_COLORS.playerHighlight, {
    baseline: TELEMETRY_COLORS.understeer, bySign: { positive: TELEMETRY_COLORS.understeer, negative: TELEMETRY_COLORS.oversteer },
  }),
  'yaw-rate': scalar(p => p.yawRateDeg, () => centre(90), TELEMETRY_COLORS.yawRate),
  'fuel': scalar(p => p.fuel, b => bottom(0, b.maxFuel), TELEMETRY_COLORS.fuel),
  'virtual-energy': scalar(p => p.virtualEnergy, () => bottom(0, 100), WHEEL_CORNER_COLORS.fl),
  'soc': scalar(p => p.soc, () => bottom(0, 100), TELEMETRY_COLORS.primary),
  'regen-rate': scalar(p => p.regenRate, b => bottom(0, b.maxRegen), TELEMETRY_COLORS.rpm),
};

/** A scalar channel of the table (the chart's single-value traces read only these). */
export function scalarChannel(id: TelemetryChannelId): ScalarChannel {
  const values = CHANNEL_VALUES[id];
  if (values.kind !== 'scalar') throw Error(`${id} is not a single-value channel`);
  return values;
}

/** A per-wheel channel of the table. */
export function wheelChannel(id: TelemetryChannelId): WheelChannel {
  const values = CHANNEL_VALUES[id];
  if (values.kind !== 'wheels') throw Error(`${id} is not a per-wheel channel`);
  return values;
}

/**
 * A value's share of its scale, 0–1, clamped as the chart clamps: from the bottom, or for a centred channel by its size (a
 * curtain cannot go under the road; left or right reads from the corner itself).
 */
export function channelShare(scale: ChannelScale, value: number): number {
  const share = scale.from === 'bottom' ? (value - scale.min) / Math.max(1, scale.max - scale.min) : Math.abs(value) / scale.limit;
  return Math.min(1, Math.max(0, share));
}

/** A value's chart y (0–100, top to bottom): from 95 at the bottom to 10 at the top, or `span` either side of the centre at 50. */
export function chartY(scale: ChannelScale, value: number, span: number): number {
  if (scale.from === 'bottom') return 95 - channelShare(scale, value) * 85;
  return 50 - (Math.max(-scale.limit, Math.min(scale.limit, value)) / scale.limit) * span;
}
