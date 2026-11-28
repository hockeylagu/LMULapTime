import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { BaselineChartSample, PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import type { CornerPaths } from './telemetryCornerChartPaths.js';
import type { DeltaGradientStop, TelemetryChartPathsResult } from './telemetryChartTypes.js';
import { chartY, scalarChannel, type ChartBounds, type TracePoint } from './telemetryChannels.js';
import type { TelemetryChannelId } from './presets/telemetryPresets.js';

/** Gear position in the full-height SVG coordinate system (0–100). */
export function gearTraceY(gear: number, maxGear: number = 7): number {
  return 95 - (gear / maxGear) * 80;
}

/** The SVG path of every single-value channel of one lap (the primary or the baseline). */
export interface ScalarTraces {
  spd: string; thr: string; brk: string; str: string; gr: string; rpm: string; lat: string;
  accLat: string; accLon: string; accTot: string; slipAng: string; uSteer: string; tireSlp: string; yawRt: string;
  fuel: string; ve: string; soc: string; regen: string; force: string;
  /** The balance line clipped to understeer (above the centre) and to oversteer (below), for the fill by sign. */
  uSteerPos: string; uSteerNeg: string;
}

export const emptyScalarTraces = (): ScalarTraces => ({
  spd: '', thr: '', brk: '', str: '', gr: '', rpm: '', lat: '',
  accLat: '', accLon: '', accTot: '', slipAng: '', uSteer: '', tireSlp: '', yawRt: '',
  fuel: '', ve: '', soc: '', regen: '', force: '', uSteerPos: '', uSteerNeg: '',
});

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const step = (cmd: string, x: number, y: number): string => `${cmd} ${x.toFixed(1)} ${y.toFixed(1)} `;

interface ScalarTrace {
  key: keyof ScalarTraces;
  /** The sample's value, undefined when it does not carry the channel (nothing is added). */
  read: (p: TracePoint) => number | undefined;
  y: (v: number, b: ChartBounds) => number;
  /** Starts at the first sample that has the value, not at the view's first sample. */
  startsWhenDrawn?: boolean;
}

/** A channel's trace by the channel table (`telemetryChannels.ts`); a centred one spans `span` either side of the centre line. */
const tableTrace = (key: keyof ScalarTraces, id: TelemetryChannelId, span = 42, startsWhenDrawn = false): ScalarTrace => {
  const channel = scalarChannel(id);
  return { key, read: channel.read, y: (v, b) => chartY(channel.scale(b), v, span), startsWhenDrawn };
};
const BALANCE = scalarChannel('under-over-steer');

const SCALAR_CHANNELS: ScalarTrace[] = [
  tableTrace('spd', 'speed'),
  tableTrace('thr', 'throttle'),
  tableTrace('brk', 'brake'),
  // Steering and lateral offset span 40 either side of the centre, the other centred channels 42.
  tableTrace('str', 'steer', 40),
  tableTrace('rpm', 'rpm'),
  tableTrace('lat', 'lateral-offset', 40),
  tableTrace('accLat', 'accel-lat'),
  tableTrace('accLon', 'accel-lon'),
  tableTrace('accTot', 'accel-total'),
  tableTrace('slipAng', 'slip-angle'),
  tableTrace('uSteer', 'under-over-steer'),
  // The balance line clipped to each side of the centre, for the fill by sign.
  { key: 'uSteerPos', read: (p) => (p.understeerDeg === undefined ? undefined : Math.max(0, p.understeerDeg)), y: (v, b) => chartY(BALANCE.scale(b), v, 42) },
  { key: 'uSteerNeg', read: (p) => (p.understeerDeg === undefined ? undefined : Math.min(0, p.understeerDeg)), y: (v, b) => chartY(BALANCE.scale(b), v, 42) },
  tableTrace('force', 'steer-force'),
  // Tire slip saturation (the combined-g chart's overlay): 0% to 100% -> 95 to 10
  { key: 'tireSlp', read: (p) => p.tireSlipPct, y: (v) => 95 - clamp01(v / 100) * 85 },
  tableTrace('yawRt', 'yaw-rate'),
  tableTrace('fuel', 'fuel', 42, true),
  tableTrace('ve', 'virtual-energy', 42, true),
  tableTrace('soc', 'soc', 42, true),
  tableTrace('regen', 'regen-rate', 42, true),
];

/**
 * Adds one sample to every single-value trace at view x. `gear` and `prevGear` are the values to
 * draw (the primary lap clamps them to 1-7): the trace steps from the previous gear to the new one.
 */
export function appendScalarPoint(
  t: ScalarTraces, p: TracePoint, gear: number, prevGear: number, x: number, isFirst: boolean, bounds: ChartBounds
): void {
  for (const channel of SCALAR_CHANNELS) {
    const v = channel.read(p);
    if (v === undefined) continue;
    const starts = channel.startsWhenDrawn ? t[channel.key] === '' : isFirst;
    t[channel.key] += step(starts ? 'M' : 'L', x, channel.y(v, bounds));
  }
  // Forward gears occupy the inset range, keeping step strokes off the edges.
  const gy = gearTraceY(gear, bounds.maxGear);
  if (isFirst) t.gr += step('M', x, gy);
  else t.gr += step('L', x, gearTraceY(prevGear, bounds.maxGear)) + step('L', x, gy);
}

/** The scales both laps share, with a floor so a quiet lap keeps a readable axis. */
export function computeChartBounds(
  points: ReplayTrajectoryPoint[],
  comparisons: PointComparison[],
  baselineSamples?: BaselineChartSample[]
): ChartBounds {
  let peakSpd = 0;
  let rawMaxRpm = 8000;
  let rawMaxFuel = 50;
  let rawMaxRegen = 150;
  let highestGear = 0;

  for (const p of points) {
    if (p.speedKmh) peakSpd = Math.max(peakSpd, p.speedKmh);
    if (p.engineRpm) rawMaxRpm = Math.max(rawMaxRpm, p.engineRpm);
    if (p.fuel) rawMaxFuel = Math.max(rawMaxFuel, p.fuel);
    if (p.regenRate) rawMaxRegen = Math.max(rawMaxRegen, p.regenRate);
    if (p.gear) highestGear = Math.max(highestGear, p.gear);
  }

  for (const c of comparisons) {
    if (c.baseline.speedKmh) peakSpd = Math.max(peakSpd, c.baseline.speedKmh);
    if (c.baseline.engineRpm) rawMaxRpm = Math.max(rawMaxRpm, c.baseline.engineRpm);
    if (c.baseline.fuel) rawMaxFuel = Math.max(rawMaxFuel, c.baseline.fuel);
    if (c.baseline.regenRate) rawMaxRegen = Math.max(rawMaxRegen, c.baseline.regenRate);
    if (c.baseline.gear) highestGear = Math.max(highestGear, c.baseline.gear);
  }

  if (baselineSamples) {
    for (const s of baselineSamples) {
      if (s.point.gear) highestGear = Math.max(highestGear, s.point.gear);
    }
  }

  const maxSpd = Math.max(260, Math.floor(peakSpd / 5) * 5 + 5);
  const maxGear = highestGear >= 7 ? 7 : 6;
  return {
    maxSpd,
    maxRpm: Math.ceil(rawMaxRpm / 1000) * 1000,
    maxFuel: Math.ceil(rawMaxFuel / 10) * 10,
    maxRegen: Math.ceil(rawMaxRegen / 50) * 50,
    maxGear,
  };
}

/** Full-height bands (x in view units) where a flag is set, as one SVG path of rectangles. */
export class FlagBands {
  path = '';
  private startX: number | null = null;
  private lastX = 0;

  public push(flag: boolean, x: number): void {
    if (flag && this.startX === null) this.startX = x;
    if (!flag && this.startX !== null) this.close(x);
    this.lastX = x;
  }

  /** Ends a band still open at the view's last sample. */
  public finish(): string {
    if (this.startX !== null) this.close(this.lastX);
    return this.path;
  }

  private close(endX: number): void {
    const x0 = (this.startX ?? endX).toFixed(1), x1 = Math.max(endX, (this.startX ?? endX) + 1).toFixed(1);
    this.path += `M ${x0} 0 L ${x1} 0 L ${x1} 100 L ${x0} 100 Z `;
    this.startX = null;
  }
}

/** Delta rate (s per s) below which a stretch counts as steady: no shading and no gradient colour. */
const RATE_DEADBAND = 0.015;

/** The delta trace's scale (1-8 s, in half-second steps) and the smoothed rate of change per sample. */
export function computeDeltaScale(
  points: ReplayTrajectoryPoint[], comparisons: PointComparison[], viewStart: number, viewEnd: number
): { maxDelta: number; rates: Map<number, number> } {
  const rates = new Map<number, number>();
  if (comparisons.length === 0) return { maxDelta: 1.0, rates };
  const deltas = comparisons.slice(viewStart, viewEnd + 1)
    .map(c => Math.abs(c.deltaTimeSec))
    .filter(d => !isNaN(d) && isFinite(d));
  const rawMax = Math.max(0.5, ...deltas);
  const maxDelta = Math.min(8, Math.max(1.0, Math.ceil(rawMax * 2) / 2));

  // Smoothed rate of change using a centered window (+/- 3 points).
  // Rate < 0: gaining time (becoming faster). Rate > 0: losing time (becoming slower).
  const W = 3;
  for (let i = viewStart; i <= viewEnd; i++) {
    if (!comparisons[i]) continue;
    const iPrev = Math.max(viewStart, i - W);
    const iNext = Math.min(viewEnd, i + W);
    const cPrev = comparisons[iPrev] || comparisons[i];
    const cNext = comparisons[iNext] || comparisons[i];
    const dtDiff = cNext.deltaTimeSec - cPrev.deltaTimeSec;
    const tDiff = Math.max(0.04, (points[iNext]?.timeSec ?? 0) - (points[iPrev]?.timeSec ?? 0));
    rates.set(i, dtDiff / tDiff);
  }
  return { maxDelta, rates };
}

/** The delta-time line and its gain/loss shading, one compared sample at a time. */
export class DeltaTrace {
  path = '';
  gainArea = '';
  lossArea = '';
  private prevX = 0;
  private prevY = 50;
  private firstX: number | null = null;
  private lastX = 0;
  private hasPrev = false;

  public constructor(private readonly maxDelta: number) {}

  public push(deltaTimeSec: number, x: number, isFirst: boolean, rate: number): void {
    // Negative delta is faster (above the zero line, y < 50), positive is slower (below, y > 50)
    const y = 50 + Math.max(-1, Math.min(1, deltaTimeSec / this.maxDelta)) * 40;
    this.path += step(isFirst ? 'M' : 'L', x, y);
    if (this.firstX === null) this.firstX = x;
    this.lastX = x;

    if (!isFirst && this.hasPrev) {
      // Steady stretches (inside the deadband) stay unshaded, which suppresses jitter.
      const trapezoid = `M ${this.prevX.toFixed(1)} 50 L ${this.prevX.toFixed(1)} ${this.prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} 50 Z `;
      if (rate < -RATE_DEADBAND) this.gainArea += trapezoid;
      else if (rate > RATE_DEADBAND) this.lossArea += trapezoid;
    }
    this.prevX = x;
    this.prevY = y;
    this.hasPrev = true;
  }

  /** The line closed along the zero baseline. */
  public get area(): string {
    return this.path && this.firstX !== null ? `${this.path} L ${this.lastX.toFixed(1)} 50 L ${this.firstX.toFixed(1)} 50 Z` : '';
  }
}

/** Smooth horizontal gradient stops with dynamic intensity and deadband fading. */
export function buildDeltaGradientStops(
  comparisons: PointComparison[], rates: Map<number, number>, viewStart: number, viewEnd: number, xForIndex: (i: number) => number
): DeltaGradientStop[] {
  const stops: DeltaGradientStop[] = [];
  if (comparisons.length === 0) return stops;
  const stride = Math.max(1, Math.floor((viewEnd - viewStart + 1) / 100));
  let prevColor: string | null = null;

  for (let i = viewStart; i <= viewEnd; i += stride) {
    if (!comparisons[i]) continue;
    const pct = Math.max(0, Math.min(100, xForIndex(i) / 10));
    const rate = rates.get(i) ?? 0;
    const absRate = Math.abs(rate);

    let opacity = 0;
    const color = rate < 0 ? TELEMETRY_COLORS.gain : TELEMETRY_COLORS.loss;

    if (absRate >= RATE_DEADBAND) {
      // High delta rate of change -> rich vibrant color (opacity up to 0.75)
      const norm = Math.min(1.0, (absRate - RATE_DEADBAND) / (0.16 - RATE_DEADBAND));
      const smooth = norm * norm * (3 - 2 * norm);
      opacity = 0.08 + 0.67 * smooth;
    }

    // Between green and red, insert zero-opacity stops to prevent color bleed
    if (prevColor && prevColor !== color && opacity > 0) {
      stops.push({ offset: `${Math.max(0, pct - 0.2).toFixed(1)}%`, color: prevColor, opacity: 0 });
      stops.push({ offset: `${pct.toFixed(1)}%`, color, opacity: 0 });
    }

    stops.push({ offset: `${pct.toFixed(1)}%`, color, opacity: Number(opacity.toFixed(2)) });
    prevColor = color;
  }

  if (stops.length > 0 && parseFloat(stops[stops.length - 1].offset) < 99.5) {
    const lastStop = stops[stops.length - 1];
    stops.push({ offset: '100%', color: lastStop.color, opacity: lastStop.opacity });
  }
  return stops;
}

/** What the chart shows for a lap with no samples. */
export function emptyChartPaths(): TelemetryChartPathsResult {
  const emptyCorner: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  return {
    speedPath: '', maxSpeed: 260, throttlePath: '', throttleArea: '', brakePath: '', brakeArea: '', steerPath: '', gearPath: '', maxGear: 6,
    baselineSpeedPath: '', baselineThrottlePath: '', baselineBrakePath: '', baselineSteerPath: '', baselineGearPath: '',
    deltaTimePath: '', deltaTimeArea: '', deltaGainArea: '', deltaLossArea: '', deltaGradientStops: [], maxDeltaSec: 1,
    rpmPath: '', rpmArea: '', baselineRpmPath: '', maxRpm: 9000,
    brakeTempsPaths: emptyCorner, baselineBrakeTempsPaths: emptyCorner, hasBrakeTemps: false, maxBrakeTemp: 800,
    suspPosPaths: emptyCorner, baselineSuspPosPaths: emptyCorner, hasSuspPos: false, minSuspPos: 0, maxSuspPos: 50,
    wheelSpeedsPaths: emptyCorner, baselineWheelSpeedsPaths: emptyCorner, hasWheelSpeeds: false, maxWheelSpeed: 300,
    wheelSlipPaths: emptyCorner, baselineWheelSlipPaths: emptyCorner, hasWheelSlip: false,
    tirePressuresPaths: emptyCorner, baselineTirePressuresPaths: emptyCorner, hasTirePressures: false, minTirePressure: 150, maxTirePressure: 220,
    tireWearPaths: emptyCorner, baselineTireWearPaths: emptyCorner, hasTireWear: false, minTireWear: 80, maxTireWear: 100,
    tireTempsPaths: emptyCorner, baselineTireTempsPaths: emptyCorner, hasTireTemps: false, minTireTemp: 40, maxTireTemp: 120,
    lateralOffsetPath: '', baselineLateralOffsetPath: '', hasLateralOffset: false,
    accelLatPath: '', baselineAccelLatPath: '', accelLonPath: '', baselineAccelLonPath: '',
    accelTotalPath: '', accelTotalArea: '', baselineAccelTotalPath: '',
    slipAnglePath: '', baselineSlipAnglePath: '', understeerPath: '', baselineUndersteerPath: '', understeerArea: '', oversteerArea: '',
    steerForcePath: '', baselineSteerForcePath: '', holdStillBands: '', counterSteerBands: '', hasSteerForce: false,
    tireSlipPath: '', tireSlipArea: '', baselineTireSlipPath: '', yawRatePath: '', baselineYawRatePath: '',
    fuelPath: '', fuelArea: '', baselineFuelPath: '', hasFuel: false, maxFuel: 100,
    virtualEnergyPath: '', virtualEnergyArea: '', baselineVirtualEnergyPath: '', hasVirtualEnergy: false,
    socPath: '', socArea: '', baselineSocPath: '', hasSoc: false,
    regenRatePath: '', regenRateArea: '', baselineRegenRatePath: '', hasRegenRate: false, maxRegen: 300,
  };
}
