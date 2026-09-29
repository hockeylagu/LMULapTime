import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { BaselineChartSample, InterpolatedPoint, PointComparison } from '../../../utils/replayComparison.js';
import {
  appendScalarPoint, buildDeltaGradientStops, computeChartBounds, computeDeltaScale, DeltaTrace, emptyChartPaths, emptyScalarTraces,
} from './telemetryChartPathBuilders.js';

// Neutral (0) and reverse (-1) are clamped to 1 since this chart's Y-scale only spans
// forward gears 1-7.
function resolveGear(p: ReplayTrajectoryPoint): number {
  return Math.min(7, Math.max(1, p.gear ?? 1));
}

export { type CornerPaths } from './telemetryCornerChartPaths.js';
import {
  type CornerPaths,
  computeCornerExtrema,
  createCornerChannelBuilders,
  appendCornerPoint,
} from './telemetryCornerChartPaths.js';

export interface DeltaGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export interface TelemetryChartPathsResult {
  speedPath: string;
  throttlePath: string;
  throttleArea: string;
  brakePath: string;
  brakeArea: string;
  steerPath: string;
  gearPath: string;
  baselineSpeedPath: string;
  baselineThrottlePath: string;
  baselineBrakePath: string;
  baselineSteerPath: string;
  baselineGearPath: string;
  deltaTimePath: string;
  deltaTimeArea: string;
  deltaGainArea: string;
  deltaLossArea: string;
  deltaGradientStops: DeltaGradientStop[];
  maxDeltaSec: number;

  // Extended authentic telemetry channels
  rpmPath: string;
  rpmArea: string;
  baselineRpmPath: string;
  maxRpm: number;

  brakeTempsPaths: CornerPaths;
  baselineBrakeTempsPaths: CornerPaths;
  hasBrakeTemps: boolean;
  maxBrakeTemp: number;

  suspPosPaths: CornerPaths;
  baselineSuspPosPaths: CornerPaths;
  hasSuspPos: boolean;
  minSuspPos: number;
  maxSuspPos: number;

  wheelSpeedsPaths: CornerPaths;
  baselineWheelSpeedsPaths: CornerPaths;
  hasWheelSpeeds: boolean;
  maxWheelSpeed: number;

  tirePressuresPaths: CornerPaths;
  baselineTirePressuresPaths: CornerPaths;
  hasTirePressures: boolean;
  minTirePressure: number;
  maxTirePressure: number;

  tireWearPaths: CornerPaths;
  baselineTireWearPaths: CornerPaths;
  hasTireWear: boolean;
  minTireWear: number;
  maxTireWear: number;

  tireTempsPaths: CornerPaths;
  baselineTireTempsPaths: CornerPaths;
  hasTireTemps: boolean;
  minTireTemp: number;
  maxTireTemp: number;

  lateralOffsetPath: string;
  baselineLateralOffsetPath: string;
  hasLateralOffset: boolean;

  // Computed vehicle dynamics channels
  accelLatPath: string;
  baselineAccelLatPath: string;
  accelLonPath: string;
  baselineAccelLonPath: string;
  accelTotalPath: string;
  accelTotalArea: string;
  baselineAccelTotalPath: string;
  slipAnglePath: string;
  baselineSlipAnglePath: string;
  understeerPath: string;
  baselineUndersteerPath: string;
  tireSlipPath: string;
  tireSlipArea: string;
  baselineTireSlipPath: string;
  yawRatePath: string;
  baselineYawRatePath: string;

  // Energy & Fuel channels
  fuelPath: string;
  fuelArea: string;
  baselineFuelPath: string;
  hasFuel: boolean;
  maxFuel: number;

  virtualEnergyPath: string;
  virtualEnergyArea: string;
  baselineVirtualEnergyPath: string;
  hasVirtualEnergy: boolean;

  socPath: string;
  socArea: string;
  baselineSocPath: string;
  hasSoc: boolean;

  regenRatePath: string;
  regenRateArea: string;
  baselineRegenRatePath: string;
  hasRegenRate: boolean;
  maxRegen: number;
}

export function computeTelemetryChartPaths(
  points: ReplayTrajectoryPoint[],
  pointComparisons: PointComparison[],
  viewStart: number,
  viewEnd: number,
  // The strip's x-axis distances (same frame as the cursor and sector lines), one per point.
  distances: number[],
  // The baseline lap's own samples on that axis (computeBaselineChartSamples). Without them the
  // baseline traces are read at the primary's samples.
  baselineSamples?: BaselineChartSample[]
): TelemetryChartPathsResult {
  if (points.length === 0) return emptyChartPaths();

  const bounds = computeChartBounds(points, pointComparisons);
  const cornerExtrema = computeCornerExtrema(points, pointComparisons, bounds.maxSpd);

  const distStart = distances[viewStart] ?? 0;
  const distEnd = distances[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);
  const xForIndex = (i: number): number => ((distances[i] - distStart) / distSpan) * 1000;

  const primary = emptyScalarTraces();
  const baseline = emptyScalarTraces();
  const cornerBuilders = createCornerChannelBuilders();
  const bCornerBuilders = createCornerChannelBuilders();
  const { maxDelta, rates } = computeDeltaScale(points, pointComparisons, viewStart, viewEnd);
  const delta = new DeltaTrace(maxDelta);

  // Baseline traces, one sample at a time (x in 0-1000 view units).
  const appendBaseline = (bp: InterpolatedPoint, prevBp: InterpolatedPoint, x: number, isFirst: boolean): void => {
    appendScalarPoint(baseline, bp, bp.gear, prevBp.gear, x, isFirst, bounds);
    appendCornerPoint(bCornerBuilders, bp, x, isFirst, cornerExtrema);
  };

  for (let i = viewStart; i <= viewEnd; i++) {
    const p = points[i];
    const x = xForIndex(i);
    const isFirst = i === viewStart;

    // Neutral and reverse are clamped to 1: the chart's gear scale spans forward gears only.
    appendScalarPoint(primary, p, resolveGear(p), i > 0 ? resolveGear(points[i - 1]) : 0, x, isFirst, bounds);
    appendCornerPoint(cornerBuilders, p, x, isFirst, cornerExtrema);

    const comp = pointComparisons[i];
    if (comp) {
      if (!baselineSamples) appendBaseline(comp.baseline, pointComparisons[i - 1]?.baseline || comp.baseline, x, isFirst);
      delta.push(comp.deltaTimeSec, x, isFirst, rates.get(i) ?? 0);
    }
  }

  if (baselineSamples) {
    // The visible samples plus one on each side, so the lines run to the view's edges.
    let from = baselineSamples.findIndex(sample => sample.distance >= distStart);
    if (from < 0) from = baselineSamples.length;
    let to = from;
    while (to < baselineSamples.length && baselineSamples[to].distance <= distEnd) to++;
    const lo = Math.max(0, from - 1);
    const hi = Math.min(baselineSamples.length - 1, to);
    for (let j = lo; j <= hi && baselineSamples.length > 0; j++) {
      const x = ((baselineSamples[j].distance - distStart) / distSpan) * 1000;
      appendBaseline(baselineSamples[j].point, baselineSamples[j - 1]?.point ?? baselineSamples[j].point, x, j === lo);
    }
  }

  const closed = (path: string): string => (path ? `${path} L 1000 95 L 0 95 Z` : '');
  const { bt, sp, ws, tp, tw, tt } = cornerBuilders;
  const { bt: bBt, sp: bSp, ws: bWs, tp: bTp, tw: bTw, tt: bTt } = bCornerBuilders;

  return {
    speedPath: primary.spd,
    throttlePath: primary.thr,
    throttleArea: `${primary.thr} L 1000 95 L 0 95 Z`,
    brakePath: primary.brk,
    brakeArea: `${primary.brk} L 1000 95 L 0 95 Z`,
    steerPath: primary.str,
    gearPath: primary.gr,
    baselineSpeedPath: baseline.spd,
    baselineThrottlePath: baseline.thr,
    baselineBrakePath: baseline.brk,
    baselineSteerPath: baseline.str,
    baselineGearPath: baseline.gr,
    deltaTimePath: delta.path,
    deltaTimeArea: delta.area,
    deltaGainArea: delta.gainArea,
    deltaLossArea: delta.lossArea,
    deltaGradientStops: buildDeltaGradientStops(pointComparisons, rates, viewStart, viewEnd, xForIndex),
    maxDeltaSec: maxDelta,
    rpmPath: primary.rpm,
    rpmArea: closed(primary.rpm),
    baselineRpmPath: baseline.rpm,
    maxRpm: bounds.maxRpm,
    brakeTempsPaths: bt,
    baselineBrakeTempsPaths: bBt,
    hasBrakeTemps: cornerExtrema.hasBrakeTemps,
    maxBrakeTemp: cornerExtrema.maxBrakeTemp,
    suspPosPaths: sp,
    baselineSuspPosPaths: bSp,
    hasSuspPos: cornerExtrema.hasSuspPos,
    minSuspPos: cornerExtrema.minSuspPos,
    maxSuspPos: cornerExtrema.maxSuspPos,
    wheelSpeedsPaths: ws,
    baselineWheelSpeedsPaths: bWs,
    hasWheelSpeeds: cornerExtrema.hasWheelSpeeds,
    maxWheelSpeed: cornerExtrema.maxWheelSpeed,
    tirePressuresPaths: tp,
    baselineTirePressuresPaths: bTp,
    hasTirePressures: cornerExtrema.hasTirePressures,
    minTirePressure: cornerExtrema.minTirePressure,
    maxTirePressure: cornerExtrema.maxTirePressure,
    tireWearPaths: tw,
    baselineTireWearPaths: bTw,
    hasTireWear: cornerExtrema.hasTireWear,
    minTireWear: cornerExtrema.minTireWear,
    maxTireWear: cornerExtrema.maxTireWear,
    tireTempsPaths: tt,
    baselineTireTempsPaths: bTt,
    hasTireTemps: cornerExtrema.hasTireTemps,
    minTireTemp: cornerExtrema.minTireTemp,
    maxTireTemp: cornerExtrema.maxTireTemp,
    lateralOffsetPath: primary.lat,
    baselineLateralOffsetPath: baseline.lat,
    hasLateralOffset: points.some(p => p.lateralOffsetM !== undefined),
    accelLatPath: primary.accLat,
    baselineAccelLatPath: baseline.accLat,
    accelLonPath: primary.accLon,
    baselineAccelLonPath: baseline.accLon,
    accelTotalPath: primary.accTot,
    accelTotalArea: closed(primary.accTot),
    baselineAccelTotalPath: baseline.accTot,
    slipAnglePath: primary.slipAng,
    baselineSlipAnglePath: baseline.slipAng,
    understeerPath: primary.uSteer,
    baselineUndersteerPath: baseline.uSteer,
    tireSlipPath: primary.tireSlp,
    tireSlipArea: closed(primary.tireSlp),
    baselineTireSlipPath: baseline.tireSlp,
    yawRatePath: primary.yawRt,
    baselineYawRatePath: baseline.yawRt,
    fuelPath: primary.fuel,
    fuelArea: closed(primary.fuel),
    baselineFuelPath: baseline.fuel,
    hasFuel: points.some(p => p.fuel !== undefined),
    maxFuel: bounds.maxFuel,
    virtualEnergyPath: primary.ve,
    virtualEnergyArea: closed(primary.ve),
    baselineVirtualEnergyPath: baseline.ve,
    hasVirtualEnergy: points.some(p => p.virtualEnergy !== undefined),
    socPath: primary.soc,
    socArea: closed(primary.soc),
    baselineSocPath: baseline.soc,
    hasSoc: points.some(p => p.soc !== undefined),
    regenRatePath: primary.regen,
    regenRateArea: closed(primary.regen),
    baselineRegenRatePath: baseline.regen,
    hasRegenRate: points.some(p => p.regenRate !== undefined),
    maxRegen: bounds.maxRegen,
  };
}
