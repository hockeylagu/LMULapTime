import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { PointComparison } from '../../../utils/replayComparison.js';

/** Measured wheel slip ratio shown at full channel height (±30 %). */
const WHEEL_SLIP_CHART_RANGE = 0.3;
const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;

export interface CornerPaths {
  fl: string;
  fr: string;
  rl: string;
  rr: string;
}

export function createEmptyCornerPaths(): CornerPaths {
  return { fl: '', fr: '', rl: '', rr: '' };
}

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

export function computeCornerExtrema(
  points: ReplayTrajectoryPoint[],
  pointComparisons: PointComparison[],
  maxSpd: number
): CornerExtrema {
  let rawMaxBrakeTemp = 600;
  let rawMaxSusp = 30;
  let rawMaxWheelSpeed = maxSpd;
  let hasBrakeTemps = false;
  let hasSuspPos = false;
  let hasWheelSpeeds = false;
  let pressureMin = Infinity;
  let pressureMax = -Infinity;
  let wearMin = Infinity;
  let tireTempMin = Infinity;
  let tireTempMax = -Infinity;

  // Scan each lap once. Avoid temporary channel arrays and spreading a whole lap into
  // Math.min/max: full-resolution four-wheel streams can exceed the argument limit.
  const observe = (point: Pick<ReplayTrajectoryPoint,
    'brakeTemps' | 'rideHeight' | 'wheelSpeeds' | 'tirePressures' | 'tireWear' | 'tireTemps'>) => {
    rawMaxBrakeTemp = Math.max(rawMaxBrakeTemp, point.brakeTemps ? Math.max(...point.brakeTemps) : 0);
    rawMaxSusp = Math.max(rawMaxSusp, point.rideHeight ? Math.max(...point.rideHeight) : 0);
    rawMaxWheelSpeed = Math.max(rawMaxWheelSpeed, point.wheelSpeeds ? Math.max(...point.wheelSpeeds) : 0);
    for (const value of point.tirePressures ?? []) {
      if (value > 50 && value < 400) {
        pressureMin = Math.min(pressureMin, value);
        pressureMax = Math.max(pressureMax, value);
      }
    }
    for (const value of point.tireWear ?? []) {
      if (value >= 0 && value <= 100) wearMin = Math.min(wearMin, value);
    }
    for (const value of point.tireTemps ?? []) {
      if (value > 10 && value < 200) {
        tireTempMin = Math.min(tireTempMin, value);
        tireTempMax = Math.max(tireTempMax, value);
      }
    }
  };
  for (const point of points) {
    // These three channels are available only when present on the primary lap.
    hasBrakeTemps ||= point.brakeTemps !== undefined;
    hasSuspPos ||= point.rideHeight !== undefined;
    hasWheelSpeeds ||= point.wheelSpeeds !== undefined;
    observe(point);
  }
  for (const comparison of pointComparisons) observe(comparison.baseline);

  const hasTirePressures = pressureMin !== Infinity;
  const hasTireWear = wearMin !== Infinity;
  const hasTireTemps = tireTempMin !== Infinity;
  return {
    maxBrakeTemp: Math.ceil(rawMaxBrakeTemp / 100) * 100,
    hasBrakeTemps,
    minSuspPos: 0,
    maxSuspPos: Math.ceil(rawMaxSusp / 10) * 10,
    hasSuspPos,
    maxWheelSpeed: Math.ceil(rawMaxWheelSpeed / 10) * 10,
    hasWheelSpeeds,
    minTirePressure: hasTirePressures ? Math.max(50, Math.floor(pressureMin / 10) * 10 - 10) : 150,
    maxTirePressure: hasTirePressures ? Math.ceil(pressureMax / 10) * 10 + 10 : 220,
    hasTirePressures,
    minTireWear: hasTireWear ? Math.max(0, Math.floor(wearMin / 5) * 5) : 80,
    maxTireWear: 100,
    hasTireWear,
    minTireTemp: hasTireTemps ? Math.max(20, Math.floor(tireTempMin / 10) * 10 - 10) : 40,
    maxTireTemp: hasTireTemps ? Math.max(100, Math.ceil(tireTempMax / 10) * 10 + 10) : 120,
    hasTireTemps,
  };
}

export interface CornerChannelBuilders {
  bt: CornerPaths;
  sp: CornerPaths;
  ws: CornerPaths;
  tp: CornerPaths;
  tw: CornerPaths;
  tt: CornerPaths;
  wsl: CornerPaths;
  /** Whether each wheel's slip line continues: unavailable ratios break the line instead of bridging it. */
  wslOpen: [boolean, boolean, boolean, boolean];
}

export function createCornerChannelBuilders(): CornerChannelBuilders {
  return {
    bt: createEmptyCornerPaths(),
    sp: createEmptyCornerPaths(),
    ws: createEmptyCornerPaths(),
    tp: createEmptyCornerPaths(),
    tw: createEmptyCornerPaths(),
    tt: createEmptyCornerPaths(),
    wsl: createEmptyCornerPaths(),
    wslOpen: [false, false, false, false],
  };
}

export function appendCornerPoint(
  builders: CornerChannelBuilders,
  p: ReplayTrajectoryPoint,
  x: number,
  isFirst: boolean,
  extrema: CornerExtrema
): void {
  const { bt, sp, ws, tp, tw, tt, wsl, wslOpen } = builders;
  const {
    maxBrakeTemp,
    minSuspPos,
    maxSuspPos,
    maxWheelSpeed,
    minTirePressure,
    maxTirePressure,
    minTireWear,
    maxTireWear,
    minTireTemp,
    maxTireTemp,
  } = extrema;

  // Brake Temperatures: 0 to maxBrakeTemp °C -> 95 to 10 in SVG Y
  if (p.brakeTemps) {
    const [fl, fr, rl, rr] = p.brakeTemps;
    const flY = 95 - Math.min(1, Math.max(0, fl / maxBrakeTemp)) * 85;
    const frY = 95 - Math.min(1, Math.max(0, fr / maxBrakeTemp)) * 85;
    const rlY = 95 - Math.min(1, Math.max(0, rl / maxBrakeTemp)) * 85;
    const rrY = 95 - Math.min(1, Math.max(0, rr / maxBrakeTemp)) * 85;
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

  // Measured wheel slip: -30 % (lockup) to +30 % (wheelspin) -> 95 to 10 in SVG Y, 0 % centred
  const ratios = p.liveWheelSlip?.ratios;
  WHEELS.forEach((corner, index) => {
    const ratio = ratios?.[index];
    if (ratio === null || ratio === undefined) { wslOpen[index] = false; return; }
    const y = 52.5 - Math.max(-1, Math.min(1, ratio / WHEEL_SLIP_CHART_RANGE)) * 42.5;
    wsl[corner] += `${wslOpen[index] && !isFirst ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    wslOpen[index] = true;
  });

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
}
