import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import type { CornerPaths } from './telemetryCornerChartPaths.js';
import type { DeltaGradientStop, TelemetryChartPathsResult } from './telemetryChartPaths.js';

/** Gear position in the full-height SVG coordinate system (0–100). */
export function gearTraceY(gear: number): number {
  return 95 - (gear / 7) * 80;
}

/** The scales the single-value traces are normalised against. */
export interface ChartBounds {
  maxSpd: number;
  maxRpm: number;
  maxFuel: number;
  maxRegen: number;
}

/** The SVG path of every single-value channel of one lap (the primary or the baseline). */
export interface ScalarTraces {
  spd: string; thr: string; brk: string; str: string; gr: string; rpm: string; lat: string;
  accLat: string; accLon: string; accTot: string; slipAng: string; uSteer: string; tireSlp: string; yawRt: string;
  fuel: string; ve: string; soc: string; regen: string;
}

export const emptyScalarTraces = (): ScalarTraces => ({
  spd: '', thr: '', brk: '', str: '', gr: '', rpm: '', lat: '',
  accLat: '', accLon: '', accTot: '', slipAng: '', uSteer: '', tireSlp: '', yawRt: '',
  fuel: '', ve: '', soc: '', regen: '',
});

/** The channels a sample of either lap (a trajectory point or an interpolated one) can carry. */
export interface TracePoint {
  speedKmh?: number;
  throttle?: number;
  brake?: number;
  steerYaw?: number;
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
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const step = (cmd: string, x: number, y: number): string => `${cmd} ${x.toFixed(1)} ${y.toFixed(1)} `;

/** 0..max -> 95 down to 10 (bottom to top of the chart). */
const upFromBottom = (v: number, max: number): number => 95 - clamp01(v / max) * 85;

/** -limit..+limit -> `span` above and below the centre line at 50 (positive is up). */
const aroundCentre = (v: number, limit: number, span: number): number => 50 - (Math.max(-limit, Math.min(limit, v)) / limit) * span;

interface ScalarChannel {
  key: keyof ScalarTraces;
  /** The sample's value, undefined when it does not carry the channel (nothing is added). */
  read: (p: TracePoint, b: ChartBounds) => number | undefined;
  y: (v: number, b: ChartBounds) => number;
  /** Starts at the first sample that has the value, not at the view's first sample. */
  startsWhenDrawn?: boolean;
}

const SCALAR_CHANNELS: ScalarChannel[] = [
  { key: 'spd', read: (p) => p.speedKmh || 0, y: (v, b) => upFromBottom(v, b.maxSpd) },
  { key: 'thr', read: (p) => p.throttle || 0, y: (v) => upFromBottom(v, 100) },
  { key: 'brk', read: (p) => p.brake || 0, y: (v) => upFromBottom(v, 100) },
  // Steering: left is up (-100% -> 10), right is down (+100% -> 90), centre at 50
  { key: 'str', read: (p) => p.steerYaw || 0, y: (v) => 50 + (Math.min(100, Math.max(-100, (v / 270) * 100)) / 100) * 40 },
  { key: 'rpm', read: (p) => p.engineRpm, y: (v, b) => upFromBottom(v, b.maxRpm) },
  // Lateral offset: -10 m to +10 m -> 90 to 10
  { key: 'lat', read: (p) => p.lateralOffsetM, y: (v) => aroundCentre(v, 10, 40) },
  // Accelerations: -3 G to +3 G -> 92 to 8; combined 0 G to 4 G -> 95 to 10
  { key: 'accLat', read: (p) => p.accelLatG, y: (v) => aroundCentre(v, 3.0, 42) },
  { key: 'accLon', read: (p) => p.accelLonG, y: (v) => aroundCentre(v, 3.0, 42) },
  { key: 'accTot', read: (p) => p.accelTotalG, y: (v) => 95 - (Math.max(0, Math.min(4.0, v)) / 4.0) * 85 },
  // Slip angle +/-12 deg, understeer/oversteer balance +/-8 deg, yaw rate +/-90 deg/s -> 92 to 8
  { key: 'slipAng', read: (p) => p.slipAngleDeg, y: (v) => aroundCentre(v, 12, 42) },
  { key: 'uSteer', read: (p) => p.understeerDeg, y: (v) => aroundCentre(v, 8, 42) },
  // Tire slip saturation: 0% to 100% -> 95 to 10
  { key: 'tireSlp', read: (p) => p.tireSlipPct, y: (v) => 95 - (Math.max(0, Math.min(100, v)) / 100) * 85 },
  { key: 'yawRt', read: (p) => p.yawRateDeg, y: (v) => aroundCentre(v, 90, 42) },
  { key: 'fuel', read: (p) => p.fuel, y: (v, b) => upFromBottom(v, b.maxFuel), startsWhenDrawn: true },
  { key: 've', read: (p) => p.virtualEnergy, y: (v) => upFromBottom(v, 100), startsWhenDrawn: true },
  { key: 'soc', read: (p) => p.soc, y: (v) => upFromBottom(v, 100), startsWhenDrawn: true },
  { key: 'regen', read: (p) => p.regenRate, y: (v, b) => upFromBottom(v, b.maxRegen), startsWhenDrawn: true },
];

/**
 * Adds one sample to every single-value trace at view x. `gear` and `prevGear` are the values to
 * draw (the primary lap clamps them to 1-7): the trace steps from the previous gear to the new one.
 */
export function appendScalarPoint(
  t: ScalarTraces, p: TracePoint, gear: number, prevGear: number, x: number, isFirst: boolean, bounds: ChartBounds
): void {
  for (const channel of SCALAR_CHANNELS) {
    const v = channel.read(p, bounds);
    if (v === undefined) continue;
    const starts = channel.startsWhenDrawn ? t[channel.key] === '' : isFirst;
    t[channel.key] += step(starts ? 'M' : 'L', x, channel.y(v, bounds));
  }
  // Forward gears occupy the inset range, keeping step strokes off the edges.
  const gy = gearTraceY(gear);
  if (isFirst) t.gr += step('M', x, gy);
  else t.gr += step('L', x, gearTraceY(prevGear)) + step('L', x, gy);
}

/** The scales both laps share, with a floor so a quiet lap keeps a readable axis. */
export function computeChartBounds(points: ReplayTrajectoryPoint[], comparisons: PointComparison[]): ChartBounds {
  const maxSpd = Math.max(260, ...points.map(p => p.speedKmh || 0), ...comparisons.map(c => c.baseline.speedKmh));
  const rawMaxRpm = Math.max(8000, ...points.map(p => p.engineRpm || 0), ...comparisons.map(c => c.baseline.engineRpm || 0));
  const rawMaxFuel = Math.max(50, ...points.map(p => p.fuel || 0), ...comparisons.map(c => c.baseline.fuel || 0));
  const rawMaxRegen = Math.max(150, ...points.map(p => p.regenRate || 0), ...comparisons.map(c => c.baseline.regenRate || 0));
  return {
    maxSpd,
    maxRpm: Math.ceil(rawMaxRpm / 1000) * 1000,
    maxFuel: Math.ceil(rawMaxFuel / 10) * 10,
    maxRegen: Math.ceil(rawMaxRegen / 50) * 50,
  };
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
    speedPath: '', maxSpeed: 260, throttlePath: '', throttleArea: '', brakePath: '', brakeArea: '', steerPath: '', gearPath: '',
    baselineSpeedPath: '', baselineThrottlePath: '', baselineBrakePath: '', baselineSteerPath: '', baselineGearPath: '',
    deltaTimePath: '', deltaTimeArea: '', deltaGainArea: '', deltaLossArea: '', deltaGradientStops: [], maxDeltaSec: 1,
    rpmPath: '', rpmArea: '', baselineRpmPath: '', maxRpm: 9000,
    brakeTempsPaths: emptyCorner, baselineBrakeTempsPaths: emptyCorner, hasBrakeTemps: false, maxBrakeTemp: 800,
    suspPosPaths: emptyCorner, baselineSuspPosPaths: emptyCorner, hasSuspPos: false, minSuspPos: 0, maxSuspPos: 50,
    wheelSpeedsPaths: emptyCorner, baselineWheelSpeedsPaths: emptyCorner, hasWheelSpeeds: false, maxWheelSpeed: 300,
    tirePressuresPaths: emptyCorner, baselineTirePressuresPaths: emptyCorner, hasTirePressures: false, minTirePressure: 150, maxTirePressure: 220,
    tireWearPaths: emptyCorner, baselineTireWearPaths: emptyCorner, hasTireWear: false, minTireWear: 80, maxTireWear: 100,
    tireTempsPaths: emptyCorner, baselineTireTempsPaths: emptyCorner, hasTireTemps: false, minTireTemp: 40, maxTireTemp: 120,
    lateralOffsetPath: '', baselineLateralOffsetPath: '', hasLateralOffset: false,
    accelLatPath: '', baselineAccelLatPath: '', accelLonPath: '', baselineAccelLonPath: '',
    accelTotalPath: '', accelTotalArea: '', baselineAccelTotalPath: '',
    slipAnglePath: '', baselineSlipAnglePath: '', understeerPath: '', baselineUndersteerPath: '',
    tireSlipPath: '', tireSlipArea: '', baselineTireSlipPath: '', yawRatePath: '', baselineYawRatePath: '',
    fuelPath: '', fuelArea: '', baselineFuelPath: '', hasFuel: false, maxFuel: 100,
    virtualEnergyPath: '', virtualEnergyArea: '', baselineVirtualEnergyPath: '', hasVirtualEnergy: false,
    socPath: '', socArea: '', baselineSocPath: '', hasSoc: false,
    regenRatePath: '', regenRateArea: '', baselineRegenRatePath: '', hasRegenRate: false, maxRegen: 300,
  };
}
