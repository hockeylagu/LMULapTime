import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { chartY, wheelChannel, type CornerExtrema, type WheelPoint } from './telemetryChannels.js';
import type { TelemetryChannelId } from './presets/telemetryPresets.js';

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

/** The per-wheel traces by the channel table (`telemetryChannels.ts`); wheel slip breaks where a ratio is missing. */
type WheelTraceKey = Exclude<keyof CornerChannelBuilders, 'wslOpen' | 'wsl'>;
const wheelTrace = (key: WheelTraceKey, id: TelemetryChannelId, movesWhenEmpty: boolean) => ({ key, channel: wheelChannel(id), movesWhenEmpty });
const WHEEL_TRACES = [
  // Brake temperatures and ride height start a trace at the first sample that has them.
  wheelTrace('bt', 'brake-temps', true),
  wheelTrace('sp', 'ride-height', true),
  wheelTrace('ws', 'wheel-speeds', false),
  wheelTrace('tp', 'tire-pressures', false),
  wheelTrace('tw', 'tire-wear', false),
  wheelTrace('tt', 'tire-temps', false),
];
const WHEEL_SLIP = wheelChannel('wheel-slip');

export function appendCornerPoint(
  builders: CornerChannelBuilders,
  p: WheelPoint,
  x: number,
  isFirst: boolean,
  extrema: CornerExtrema
): void {
  for (const { key, channel, movesWhenEmpty } of WHEEL_TRACES) {
    const values = channel.read(p);
    if (!values) continue;
    const scale = channel.scale(extrema), paths = builders[key];
    WHEELS.forEach((corner, index) => {
      const move = movesWhenEmpty ? !paths[corner] : isFirst;
      paths[corner] += `${move ? 'M' : 'L'} ${x.toFixed(1)} ${chartY(scale, values[index] ?? 0, 0).toFixed(1)} `;
    });
  }

  // Measured wheel slip: -30 % (lockup) to +30 % (wheelspin) -> 95 to 10 in SVG Y, 0 % centred at 52.5
  const ratios = WHEEL_SLIP.read(p), slipScale = WHEEL_SLIP.scale(extrema), { wsl, wslOpen } = builders;
  WHEELS.forEach((corner, index) => {
    const ratio = ratios?.[index];
    if (ratio === null || ratio === undefined) { wslOpen[index] = false; return; }
    const y = chartY(slipScale, ratio, 42.5) + 2.5;
    wsl[corner] += `${wslOpen[index] && !isFirst ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    wslOpen[index] = true;
  });
}
