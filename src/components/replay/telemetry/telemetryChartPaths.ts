import { ReplayTrajectoryPoint } from '../../../../server/core/types';
import { PointComparison, getTrajectoryDistances } from '../../../utils/replayComparison.js';

// Neutral (0) and reverse (-1) are clamped to 1 since this chart's Y-scale only spans
// forward gears 1-7.
function resolveGear(p: ReplayTrajectoryPoint): number {
  return Math.min(7, Math.max(1, p.gear ?? 1));
}

export interface CornerPaths {
  fl: string;
  fr: string;
  rl: string;
  rr: string;
}

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
}

export function computeTelemetryChartPaths(
  points: ReplayTrajectoryPoint[],
  pointComparisons: PointComparison[],
  viewStart: number,
  viewEnd: number,
  distances?: number[]
): TelemetryChartPathsResult {
  if (points.length === 0) {
    const emptyCorner: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
    return {
      speedPath: '',
      throttlePath: '',
      throttleArea: '',
      brakePath: '',
      brakeArea: '',
      steerPath: '',
      gearPath: '',
      baselineSpeedPath: '',
      baselineThrottlePath: '',
      baselineBrakePath: '',
      baselineSteerPath: '',
      baselineGearPath: '',
      deltaTimePath: '',
      deltaTimeArea: '',
      deltaGainArea: '',
      deltaLossArea: '',
      deltaGradientStops: [],
      maxDeltaSec: 1,
      rpmPath: '',
      rpmArea: '',
      baselineRpmPath: '',
      maxRpm: 9000,
      brakeTempsPaths: emptyCorner,
      baselineBrakeTempsPaths: emptyCorner,
      hasBrakeTemps: false,
      maxBrakeTemp: 800,
      suspPosPaths: emptyCorner,
      baselineSuspPosPaths: emptyCorner,
      hasSuspPos: false,
      minSuspPos: 0,
      maxSuspPos: 50,
      wheelSpeedsPaths: emptyCorner,
      baselineWheelSpeedsPaths: emptyCorner,
      hasWheelSpeeds: false,
      maxWheelSpeed: 300,
      tirePressuresPaths: emptyCorner,
      baselineTirePressuresPaths: emptyCorner,
      hasTirePressures: false,
      minTirePressure: 150,
      maxTirePressure: 220,
      tireWearPaths: emptyCorner,
      baselineTireWearPaths: emptyCorner,
      hasTireWear: false,
      minTireWear: 80,
      maxTireWear: 100,
      tireTempsPaths: emptyCorner,
      baselineTireTempsPaths: emptyCorner,
      hasTireTemps: false,
      minTireTemp: 40,
      maxTireTemp: 120,
      lateralOffsetPath: '',
      baselineLateralOffsetPath: '',
      hasLateralOffset: false,
      accelLatPath: '',
      baselineAccelLatPath: '',
      accelLonPath: '',
      baselineAccelLonPath: '',
      accelTotalPath: '',
      accelTotalArea: '',
      baselineAccelTotalPath: '',
      slipAnglePath: '',
      baselineSlipAnglePath: '',
      understeerPath: '',
      baselineUndersteerPath: '',
      tireSlipPath: '',
      tireSlipArea: '',
      baselineTireSlipPath: '',
      yawRatePath: '',
      baselineYawRatePath: '',
    };
  }

  const maxSpd = Math.max(
    260,
    ...points.map(p => p.speedKmh || 0),
    ...(pointComparisons.map(c => c.baseline.speedKmh) || [])
  );

  const rawMaxRpm = Math.max(
    8000,
    ...points.map(p => p.engineRpm || 0),
    ...(pointComparisons.map(c => c.baseline.engineRpm || 0))
  );
  const maxRpm = Math.ceil(rawMaxRpm / 1000) * 1000;

  const rawMaxBrakeTemp = Math.max(
    600,
    ...points.map(p => p.brakeTemps ? Math.max(...p.brakeTemps) : 0),
    ...(pointComparisons.map(c => c.baseline.brakeTemps ? Math.max(...c.baseline.brakeTemps) : 0))
  );
  const maxBrakeTemp = Math.ceil(rawMaxBrakeTemp / 100) * 100;
  const hasBrakeTemps = points.some(p => p.brakeTemps !== undefined);

  // 4-Corner Suspension Deflection / Travel
  const rawMaxSusp = Math.max(
    30,
    ...points.map(p => p.rideHeight ? Math.max(...p.rideHeight) : 0),
    ...(pointComparisons.map(c => c.baseline.rideHeight ? Math.max(...c.baseline.rideHeight) : 0))
  );
  const minSuspPos = 0;
  const maxSuspPos = Math.ceil(rawMaxSusp / 10) * 10;
  const hasSuspPos = points.some(p => p.rideHeight !== undefined);

  // 4-Corner Wheel Speeds
  const rawMaxWheelSpeed = Math.max(
    maxSpd,
    ...points.map(p => p.wheelSpeeds ? Math.max(...p.wheelSpeeds) : 0),
    ...(pointComparisons.map(c => c.baseline.wheelSpeeds ? Math.max(...c.baseline.wheelSpeeds) : 0))
  );
  const maxWheelSpeed = Math.ceil(rawMaxWheelSpeed / 10) * 10;
  const hasWheelSpeeds = points.some(p => p.wheelSpeeds !== undefined);

  // 4-Corner Tire Inflation Pressures
  const allPressures: number[] = [];
  for (const p of points) {
    if (p.tirePressures) {
      allPressures.push(...p.tirePressures.filter((v: number) => v > 50 && v < 400));
    }
  }
  for (const c of pointComparisons) {
    if (c.baseline.tirePressures) {
      allPressures.push(...c.baseline.tirePressures.filter((v: number) => v > 50 && v < 400));
    }
  }
  const hasTirePressures = allPressures.length > 0;
  const minTirePressure = hasTirePressures
    ? Math.max(50, Math.floor(Math.min(...allPressures) / 10) * 10 - 10)
    : 150;
  const maxTirePressure = hasTirePressures
    ? Math.ceil(Math.max(...allPressures) / 10) * 10 + 10
    : 220;

  // 4-Corner Tire Tread Wear / Condition
  const allWear: number[] = [];
  for (const p of points) {
    if (p.tireWear) {
      allWear.push(...p.tireWear.filter((v: number) => v >= 0 && v <= 100));
    }
  }
  for (const c of pointComparisons) {
    if (c.baseline.tireWear) {
      allWear.push(...c.baseline.tireWear.filter((v: number) => v >= 0 && v <= 100));
    }
  }
  const hasTireWear = allWear.length > 0;
  const minTireWear = hasTireWear
    ? Math.max(0, Math.floor(Math.min(...allWear) / 5) * 5)
    : 80;
  const maxTireWear = 100;

  // 4-Corner Tire Carcass / Inner Bulk Temperatures
  const allTireTemps: number[] = [];
  for (const p of points) {
    if (p.tireTemps) {
      allTireTemps.push(...p.tireTemps.filter((v: number) => v > 10 && v < 200));
    }
  }
  for (const c of pointComparisons) {
    if (c.baseline.tireTemps) {
      allTireTemps.push(...c.baseline.tireTemps.filter((v: number) => v > 10 && v < 200));
    }
  }
  const hasTireTemps = allTireTemps.length > 0;
  const minTireTemp = hasTireTemps
    ? Math.max(20, Math.floor(Math.min(...allTireTemps) / 10) * 10 - 10)
    : 40;
  const maxTireTemp = hasTireTemps
    ? Math.max(100, Math.ceil(Math.max(...allTireTemps) / 10) * 10 + 10)
    : 120;

  const hasLateralOffset = points.some(p => p.lateralOffsetM !== undefined);

  const cumDists = distances && distances.length === points.length
    ? distances
    : getTrajectoryDistances(points);
  const distStart = cumDists[viewStart] ?? 0;
  const distEnd = cumDists[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);
  const xForIndex = (i: number): number => ((cumDists[i] - distStart) / distSpan) * 1000;

  let spd = '';
  let thr = '';
  let brk = '';
  let str = '';
  let gr = '';

  let bSpd = '';
  let bThr = '';
  let bBrk = '';
  let bStr = '';
  let bGr = '';

  let rpm = '';
  let bRpm = '';

  const bt: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bBt: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const sp: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bSp: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const ws: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bWs: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const tp: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bTp: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const tw: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bTw: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const tt: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };
  const bTt: CornerPaths = { fl: '', fr: '', rl: '', rr: '' };

  let lat = '';
  let bLat = '';

  let accLat = '';
  let bAccLat = '';
  let accLon = '';
  let bAccLon = '';
  let accTot = '';
  let bAccTot = '';
  let slipAng = '';
  let bSlipAng = '';
  let uSteer = '';
  let bUSteer = '';
  let tireSlp = '';
  let bTireSlp = '';
  let yawRt = '';
  let bYawRt = '';

  let maxDelta = 1.0;
  const rates = new Map<number, number>();

  if (pointComparisons.length > 0) {
    const visibleComps = pointComparisons.slice(viewStart, viewEnd + 1);
    const deltas = visibleComps
      .map(c => Math.abs(c.deltaTimeSec))
      .filter(d => !isNaN(d) && isFinite(d));
    const rawMax = Math.max(0.5, ...deltas);
    maxDelta = Math.min(8, Math.max(1.0, Math.ceil(rawMax * 2) / 2));

    // Pre-calculate smoothed rate of change using a centered window (+/- 3 points)
    // Rate < 0: gaining time (becoming faster). Rate > 0: losing time (becoming slower).
    const W = 3;
    for (let i = viewStart; i <= viewEnd; i++) {
      if (!pointComparisons[i]) continue;
      const iPrev = Math.max(viewStart, i - W);
      const iNext = Math.min(viewEnd, i + W);
      const cPrev = pointComparisons[iPrev] || pointComparisons[i];
      const cNext = pointComparisons[iNext] || pointComparisons[i];
      const dtDiff = cNext.deltaTimeSec - cPrev.deltaTimeSec;
      const tDiff = Math.max(0.04, (points[iNext]?.timeSec ?? 0) - (points[iPrev]?.timeSec ?? 0));
      rates.set(i, dtDiff / tDiff);
    }
  }

  let dtPath = '';
  let dtGainArea = '';
  let dtLossArea = '';
  let prevDtX = 0;
  let prevDtY = 50;
  let firstDtX: number | null = null;
  let lastDtX = 0;
  let prevComp: PointComparison | null = null;

  for (let i = viewStart; i <= viewEnd; i++) {
    const p = points[i];
    const x = xForIndex(i);
    const isFirst = i === viewStart;

    // Speed: 0 to maxSpd km/h -> 95 to 10 in SVG Y
    const spdNorm = Math.min(1, Math.max(0, (p.speedKmh || 0) / maxSpd));
    const sy = 95 - spdNorm * 85;
    spd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sy.toFixed(1)} `;

    // Throttle: 0 to 100% -> 95 to 10 in SVG Y
    const thrNorm = Math.min(1, Math.max(0, (p.throttle || 0) / 100));
    const ty = 95 - thrNorm * 85;
    thr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${ty.toFixed(1)} `;

    // Brake: 0 to 100% -> 95 to 10 in SVG Y
    const brkNorm = Math.min(1, Math.max(0, (p.brake || 0) / 100));
    const by = 95 - brkNorm * 85;
    brk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${by.toFixed(1)} `;

    // Steering: Left is UP (-100% -> 10), Right is BOTTOM (+100% -> 90), center at 50
    const st = Math.min(100, Math.max(-100, ((p.steerYaw || 0) / 270) * 100));
    const sty = 50 + (st / 100) * 40;
    str += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sty.toFixed(1)} `;

    // Gear: 1 to 7 -> 95 to 15 in SVG Y
    const gear = resolveGear(p);
    const gy = 95 - (gear / 7) * 80;
    if (isFirst) {
      gr += `M ${x.toFixed(1)} ${gy.toFixed(1)} `;
    } else {
      const prevP = points[i - 1];
      const prevGear = resolveGear(prevP);
      const prevGy = 95 - (prevGear / 7) * 80;
      gr += `L ${x.toFixed(1)} ${prevGy.toFixed(1)} L ${x.toFixed(1)} ${gy.toFixed(1)} `;
    }

    // Engine RPM: 0 to maxRpm -> 95 to 10 in SVG Y
    if (p.engineRpm !== undefined) {
      const rpmNorm = Math.min(1, Math.max(0, p.engineRpm / maxRpm));
      const ry = 95 - rpmNorm * 85;
      rpm += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${ry.toFixed(1)} `;
    }

    // Brake Rotor Temperatures: 0 to maxBrakeTemp °C -> 95 to 10 in SVG Y
    if (p.brakeTemps) {
      const [flB, frB, rlB, rrB] = p.brakeTemps;
      const flY = 95 - Math.min(1, Math.max(0, flB / maxBrakeTemp)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, frB / maxBrakeTemp)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, rlB / maxBrakeTemp)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, rrB / maxBrakeTemp)) * 85;
      bt.fl += `${bt.fl ? 'L' : 'M'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      bt.fr += `${bt.fr ? 'L' : 'M'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      bt.rl += `${bt.rl ? 'L' : 'M'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      bt.rr += `${bt.rr ? 'L' : 'M'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Suspension Deflection / Travel: minSuspPos to maxSuspPos mm -> 95 to 10 in SVG Y
    if (p.rideHeight) {
      const [fl, fr, rl, rr] = p.rideHeight;
      const suspSpan = Math.max(1, maxSuspPos - minSuspPos);
      const flY = 95 - Math.min(1, Math.max(0, (fl - minSuspPos) / suspSpan)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, (fr - minSuspPos) / suspSpan)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, (rl - minSuspPos) / suspSpan)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, (rr - minSuspPos) / suspSpan)) * 85;
      sp.fl += `${sp.fl ? 'L' : 'M'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      sp.fr += `${sp.fr ? 'L' : 'M'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      sp.rl += `${sp.rl ? 'L' : 'M'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      sp.rr += `${sp.rr ? 'L' : 'M'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Wheel Speeds: 0 to maxWheelSpeed km/h -> 95 to 10 in SVG Y
    if (p.wheelSpeeds) {
      const [fl, fr, rl, rr] = p.wheelSpeeds;
      const flY = 95 - Math.min(1, Math.max(0, fl / maxWheelSpeed)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, fr / maxWheelSpeed)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, rl / maxWheelSpeed)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, rr / maxWheelSpeed)) * 85;
      ws.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      ws.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      ws.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      ws.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Tire Pressures: minTirePressure to maxTirePressure kPa -> 95 to 10 in SVG Y
    if (p.tirePressures) {
      const [fl, fr, rl, rr] = p.tirePressures;
      const presSpan = Math.max(1, maxTirePressure - minTirePressure);
      const flY = 95 - Math.min(1, Math.max(0, (fl - minTirePressure) / presSpan)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, (fr - minTirePressure) / presSpan)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, (rl - minTirePressure) / presSpan)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, (rr - minTirePressure) / presSpan)) * 85;
      tp.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      tp.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      tp.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      tp.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Tire Wear: minTireWear to maxTireWear % -> 95 to 10 in SVG Y
    if (p.tireWear) {
      const [fl, fr, rl, rr] = p.tireWear;
      const wearSpan = Math.max(1, maxTireWear - minTireWear);
      const flY = 95 - Math.min(1, Math.max(0, (fl - minTireWear) / wearSpan)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, (fr - minTireWear) / wearSpan)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, (rl - minTireWear) / wearSpan)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, (rr - minTireWear) / wearSpan)) * 85;
      tw.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      tw.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      tw.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      tw.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Tire Temperatures: minTireTemp to maxTireTemp °C -> 95 to 10 in SVG Y
    if (p.tireTemps) {
      const [fl, fr, rl, rr] = p.tireTemps;
      const tempSpan = Math.max(1, maxTireTemp - minTireTemp);
      const flY = 95 - Math.min(1, Math.max(0, (fl - minTireTemp) / tempSpan)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, (fr - minTireTemp) / tempSpan)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, (rl - minTireTemp) / tempSpan)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, (rr - minTireTemp) / tempSpan)) * 85;
      tt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      tt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      tt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      tt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Lateral offset: -10m to +10m -> 90 to 10 in SVG Y (center 0 at 50)
    if (p.lateralOffsetM !== undefined) {
      const latClamped = Math.min(10, Math.max(-10, p.lateralOffsetM));
      const latY = 50 - (latClamped / 10) * 40;
      lat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
    }

    // Lateral Acceleration: -3.0G to +3.0G -> 92 to 8 in SVG Y (center 0 at 50)
    if (p.accelLatG !== undefined) {
      const latClamped = Math.max(-3.0, Math.min(3.0, p.accelLatG));
      const latY = 50 - (latClamped / 3.0) * 42;
      accLat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
    }

    // Longitudinal Acceleration: -3.0G to +3.0G -> 92 to 8 in SVG Y (center 0 at 50)
    if (p.accelLonG !== undefined) {
      const lonClamped = Math.max(-3.0, Math.min(3.0, p.accelLonG));
      const lonY = 50 - (lonClamped / 3.0) * 42;
      accLon += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${lonY.toFixed(1)} `;
    }

    // Combined Acceleration: 0.0G to 4.0G -> 95 to 10 in SVG Y
    if (p.accelTotalG !== undefined) {
      const totClamped = Math.max(0, Math.min(4.0, p.accelTotalG));
      const totY = 95 - (totClamped / 4.0) * 85;
      accTot += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${totY.toFixed(1)} `;
    }

    // Slip Angle: -12 to +12 deg -> 92 to 8 in SVG Y (center 0 at 50)
    if (p.slipAngleDeg !== undefined) {
      const saClamped = Math.max(-12, Math.min(12, p.slipAngleDeg));
      const saY = 50 - (saClamped / 12) * 42;
      slipAng += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${saY.toFixed(1)} `;
    }

    // Understeer / Oversteer Dynamic Balance: -8 to +8 deg -> 92 to 8 in SVG Y (center 0 at 50)
    if (p.understeerDeg !== undefined) {
      const uClamped = Math.max(-8, Math.min(8, p.understeerDeg));
      const uY = 50 - (uClamped / 8) * 42;
      uSteer += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${uY.toFixed(1)} `;
    }

    // Tire Slip Saturation: 0% to 100% -> 95 to 10 in SVG Y
    if (p.tireSlipPct !== undefined) {
      const slpClamped = Math.max(0, Math.min(100, p.tireSlipPct));
      const slpY = 95 - (slpClamped / 100) * 85;
      tireSlp += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${slpY.toFixed(1)} `;
    }

    // Yaw Rate: -90 to +90 deg/s -> 92 to 8 in SVG Y (center 0 at 50)
    if (p.yawRateDeg !== undefined) {
      const yrClamped = Math.max(-90, Math.min(90, p.yawRateDeg));
      const yrY = 50 - (yrClamped / 90) * 42;
      yawRt += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${yrY.toFixed(1)} `;
    }

    // Baseline comparisons
    if (pointComparisons[i]) {
      const comp = pointComparisons[i];
      const bp = comp.baseline;

      const bSpdNorm = Math.min(1, Math.max(0, (bp.speedKmh || 0) / maxSpd));
      const bsy = 95 - bSpdNorm * 85;
      bSpd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsy.toFixed(1)} `;

      const bThrNorm = Math.min(1, Math.max(0, (bp.throttle || 0) / 100));
      const bty = 95 - bThrNorm * 85;
      bThr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bty.toFixed(1)} `;

      const bBrkNorm = Math.min(1, Math.max(0, (bp.brake || 0) / 100));
      const bby = 95 - bBrkNorm * 85;
      bBrk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bby.toFixed(1)} `;

      // Steering: Left is UP (-100% -> 10), Right is BOTTOM (+100% -> 90), center at 50
      const bst = Math.min(100, Math.max(-100, ((bp.steerYaw || 0) / 270) * 100));
      const bsty = 50 + (bst / 100) * 40;
      bStr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsty.toFixed(1)} `;

      const bGy = 95 - (bp.gear / 7) * 80;
      if (isFirst) {
        bGr += `M ${x.toFixed(1)} ${bGy.toFixed(1)} `;
      } else {
        const prevBp = pointComparisons[i - 1]?.baseline || bp;
        const prevBgy = 95 - (prevBp.gear / 7) * 80;
        bGr += `L ${x.toFixed(1)} ${prevBgy.toFixed(1)} L ${x.toFixed(1)} ${bGy.toFixed(1)} `;
      }

      if (bp.engineRpm !== undefined) {
        const brpmNorm = Math.min(1, Math.max(0, bp.engineRpm / maxRpm));
        const bry = 95 - brpmNorm * 85;
        bRpm += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bry.toFixed(1)} `;
      }

      if (bp.brakeTemps) {
        const [flB, frB, rlB, rrB] = bp.brakeTemps;
        const flY = 95 - Math.min(1, Math.max(0, flB / maxBrakeTemp)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, frB / maxBrakeTemp)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, rlB / maxBrakeTemp)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, rrB / maxBrakeTemp)) * 85;
        bBt.fl += `${bBt.fl ? 'L' : 'M'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bBt.fr += `${bBt.fr ? 'L' : 'M'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bBt.rl += `${bBt.rl ? 'L' : 'M'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bBt.rr += `${bBt.rr ? 'L' : 'M'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.rideHeight) {
        const [fl, fr, rl, rr] = bp.rideHeight;
        const suspSpan = Math.max(1, maxSuspPos - minSuspPos);
        const flY = 95 - Math.min(1, Math.max(0, (fl - minSuspPos) / suspSpan)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, (fr - minSuspPos) / suspSpan)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, (rl - minSuspPos) / suspSpan)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, (rr - minSuspPos) / suspSpan)) * 85;
        bSp.fl += `${bSp.fl ? 'L' : 'M'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bSp.fr += `${bSp.fr ? 'L' : 'M'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bSp.rl += `${bSp.rl ? 'L' : 'M'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bSp.rr += `${bSp.rr ? 'L' : 'M'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.wheelSpeeds) {
        const [fl, fr, rl, rr] = bp.wheelSpeeds;
        const flY = 95 - Math.min(1, Math.max(0, fl / maxWheelSpeed)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, fr / maxWheelSpeed)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, rl / maxWheelSpeed)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, rr / maxWheelSpeed)) * 85;
        bWs.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bWs.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bWs.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bWs.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.tirePressures) {
        const [fl, fr, rl, rr] = bp.tirePressures;
        const presSpan = Math.max(1, maxTirePressure - minTirePressure);
        const flY = 95 - Math.min(1, Math.max(0, (fl - minTirePressure) / presSpan)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, (fr - minTirePressure) / presSpan)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, (rl - minTirePressure) / presSpan)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, (rr - minTirePressure) / presSpan)) * 85;
        bTp.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bTp.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bTp.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bTp.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.tireWear) {
        const [fl, fr, rl, rr] = bp.tireWear;
        const wearSpan = Math.max(1, maxTireWear - minTireWear);
        const flY = 95 - Math.min(1, Math.max(0, (fl - minTireWear) / wearSpan)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, (fr - minTireWear) / wearSpan)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, (rl - minTireWear) / wearSpan)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, (rr - minTireWear) / wearSpan)) * 85;
        bTw.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bTw.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bTw.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bTw.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.tireTemps) {
        const [fl, fr, rl, rr] = bp.tireTemps;
        const tempSpan = Math.max(1, maxTireTemp - minTireTemp);
        const flY = 95 - Math.min(1, Math.max(0, (fl - minTireTemp) / tempSpan)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, (fr - minTireTemp) / tempSpan)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, (rl - minTireTemp) / tempSpan)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, (rr - minTireTemp) / tempSpan)) * 85;
        bTt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bTt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bTt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bTt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.lateralOffsetM !== undefined) {
        const latClamped = Math.min(10, Math.max(-10, bp.lateralOffsetM));
        const latY = 50 - (latClamped / 10) * 40;
        bLat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
      }

      if (bp.accelLatG !== undefined) {
        const latClamped = Math.max(-3.0, Math.min(3.0, bp.accelLatG));
        const latY = 50 - (latClamped / 3.0) * 42;
        bAccLat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
      }

      if (bp.accelLonG !== undefined) {
        const lonClamped = Math.max(-3.0, Math.min(3.0, bp.accelLonG));
        const lonY = 50 - (lonClamped / 3.0) * 42;
        bAccLon += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${lonY.toFixed(1)} `;
      }

      if (bp.accelTotalG !== undefined) {
        const totClamped = Math.max(0, Math.min(4.0, bp.accelTotalG));
        const totY = 95 - (totClamped / 4.0) * 85;
        bAccTot += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${totY.toFixed(1)} `;
      }

      if (bp.slipAngleDeg !== undefined) {
        const saClamped = Math.max(-12, Math.min(12, bp.slipAngleDeg));
        const saY = 50 - (saClamped / 12) * 42;
        bSlipAng += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${saY.toFixed(1)} `;
      }

      if (bp.understeerDeg !== undefined) {
        const uClamped = Math.max(-8, Math.min(8, bp.understeerDeg));
        const uY = 50 - (uClamped / 8) * 42;
        bUSteer += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${uY.toFixed(1)} `;
      }

      if (bp.tireSlipPct !== undefined) {
        const slpClamped = Math.max(0, Math.min(100, bp.tireSlipPct));
        const slpY = 95 - (slpClamped / 100) * 85;
        bTireSlp += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${slpY.toFixed(1)} `;
      }

      if (bp.yawRateDeg !== undefined) {
        const yrClamped = Math.max(-90, Math.min(90, bp.yawRateDeg));
        const yrY = 50 - (yrClamped / 90) * 42;
        bYawRt += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${yrY.toFixed(1)} `;
      }

      // Delta time: negative is faster (above zero line, Y < 50), positive is slower (below, Y > 50)
      const dtNorm = Math.max(-1, Math.min(1, comp.deltaTimeSec / maxDelta));
      const dty = 50 + dtNorm * 40;
      dtPath += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${dty.toFixed(1)} `;

      if (firstDtX === null) firstDtX = x;
      lastDtX = x;

      if (!isFirst && prevComp) {
        // Suppress jitter in steady/flat zones: only assign to gain/loss trapezoids when rate exceeds deadband
        const rate = rates.get(i) ?? 0;
        const trapezoid = `M ${prevDtX.toFixed(1)} 50 L ${prevDtX.toFixed(1)} ${prevDtY.toFixed(1)} L ${x.toFixed(1)} ${dty.toFixed(1)} L ${x.toFixed(1)} 50 Z `;
        if (rate < -0.015) {
          dtGainArea += trapezoid;
        } else if (rate > 0.015) {
          dtLossArea += trapezoid;
        }
      }

      prevDtX = x;
      prevDtY = dty;
      prevComp = comp;
    }
  }

  // Generate smooth horizontal gradient stops with dynamic intensity and deadband fading
  const dtStops: DeltaGradientStop[] = [];
  if (pointComparisons.length > 0) {
    const totalComps = viewEnd - viewStart + 1;
    const step = Math.max(1, Math.floor(totalComps / 100));
    let prevColor: string | null = null;

    for (let i = viewStart; i <= viewEnd; i += step) {
      if (!pointComparisons[i]) continue;
      const pct = Math.max(0, Math.min(100, xForIndex(i) / 10));
      const rate = rates.get(i) ?? 0;
      const absRate = Math.abs(rate);

      let opacity = 0;
      const color = rate < 0 ? '#10b981' : '#ef4444';

      if (absRate >= 0.015) {
        // High delta rate of change -> rich vibrant color (opacity up to 0.75)
        const norm = Math.min(1.0, (absRate - 0.015) / (0.16 - 0.015));
        const smooth = norm * norm * (3 - 2 * norm);
        opacity = 0.08 + 0.67 * smooth;
      }

      // If transitioning between green and red, insert zero-opacity stops to prevent color bleed
      if (prevColor && prevColor !== color && opacity > 0) {
        dtStops.push({
          offset: `${Math.max(0, pct - 0.2).toFixed(1)}%`,
          color: prevColor,
          opacity: 0,
        });
        dtStops.push({
          offset: `${pct.toFixed(1)}%`,
          color,
          opacity: 0,
        });
      }

      dtStops.push({
        offset: `${pct.toFixed(1)}%`,
        color,
        opacity: Number(opacity.toFixed(2)),
      });
      prevColor = color;
    }

    if (dtStops.length > 0 && parseFloat(dtStops[dtStops.length - 1].offset) < 99.5) {
      const lastStop = dtStops[dtStops.length - 1];
      dtStops.push({
        offset: '100%',
        color: lastStop.color,
        opacity: lastStop.opacity,
      });
    }
  }

  return {
    speedPath: spd,
    throttlePath: thr,
    throttleArea: `${thr} L 1000 95 L 0 95 Z`,
    brakePath: brk,
    brakeArea: `${brk} L 1000 95 L 0 95 Z`,
    steerPath: str,
    gearPath: gr,
    baselineSpeedPath: bSpd,
    baselineThrottlePath: bThr,
    baselineBrakePath: bBrk,
    baselineSteerPath: bStr,
    baselineGearPath: bGr,
    deltaTimePath: dtPath,
    deltaTimeArea: dtPath && firstDtX !== null ? `${dtPath} L ${lastDtX.toFixed(1)} 50 L ${firstDtX.toFixed(1)} 50 Z` : '',
    deltaGainArea: dtGainArea,
    deltaLossArea: dtLossArea,
    deltaGradientStops: dtStops,
    maxDeltaSec: maxDelta,
    rpmPath: rpm,
    rpmArea: rpm ? `${rpm} L 1000 95 L 0 95 Z` : '',
    baselineRpmPath: bRpm,
    maxRpm,
    brakeTempsPaths: bt,
    baselineBrakeTempsPaths: bBt,
    hasBrakeTemps,
    maxBrakeTemp,
    suspPosPaths: sp,
    baselineSuspPosPaths: bSp,
    hasSuspPos,
    minSuspPos,
    maxSuspPos,
    wheelSpeedsPaths: ws,
    baselineWheelSpeedsPaths: bWs,
    hasWheelSpeeds,
    maxWheelSpeed,
    tirePressuresPaths: tp,
    baselineTirePressuresPaths: bTp,
    hasTirePressures,
    minTirePressure,
    maxTirePressure,
    tireWearPaths: tw,
    baselineTireWearPaths: bTw,
    hasTireWear,
    minTireWear,
    maxTireWear,
    tireTempsPaths: tt,
    baselineTireTempsPaths: bTt,
    hasTireTemps,
    minTireTemp,
    maxTireTemp,
    lateralOffsetPath: lat,
    baselineLateralOffsetPath: bLat,
    hasLateralOffset,
    accelLatPath: accLat,
    baselineAccelLatPath: bAccLat,
    accelLonPath: accLon,
    baselineAccelLonPath: bAccLon,
    accelTotalPath: accTot,
    accelTotalArea: accTot ? `${accTot} L 1000 95 L 0 95 Z` : '',
    baselineAccelTotalPath: bAccTot,
    slipAnglePath: slipAng,
    baselineSlipAnglePath: bSlipAng,
    understeerPath: uSteer,
    baselineUndersteerPath: bUSteer,
    tireSlipPath: tireSlp,
    tireSlipArea: tireSlp ? `${tireSlp} L 1000 95 L 0 95 Z` : '',
    baselineTireSlipPath: bTireSlp,
    yawRatePath: yawRt,
    baselineYawRatePath: bYawRt,
  };
}
