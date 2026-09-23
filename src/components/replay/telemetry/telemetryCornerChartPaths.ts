import { ReplayTrajectoryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';

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

  return {
    maxBrakeTemp,
    hasBrakeTemps,
    minSuspPos,
    maxSuspPos,
    hasSuspPos,
    maxWheelSpeed,
    hasWheelSpeeds,
    minTirePressure,
    maxTirePressure,
    hasTirePressures,
    minTireWear,
    maxTireWear,
    hasTireWear,
    minTireTemp,
    maxTireTemp,
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
}

export function createCornerChannelBuilders(): CornerChannelBuilders {
  return {
    bt: createEmptyCornerPaths(),
    sp: createEmptyCornerPaths(),
    ws: createEmptyCornerPaths(),
    tp: createEmptyCornerPaths(),
    tw: createEmptyCornerPaths(),
    tt: createEmptyCornerPaths(),
  };
}

export function appendCornerPoint(
  builders: CornerChannelBuilders,
  p: ReplayTrajectoryPoint,
  x: number,
  isFirst: boolean,
  extrema: CornerExtrema
): void {
  const { bt, sp, ws, tp, tw, tt } = builders;
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
