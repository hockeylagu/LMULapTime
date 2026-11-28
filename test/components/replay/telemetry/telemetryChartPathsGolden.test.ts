import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { computeTelemetryChartPaths } from '../../../../src/components/replay/telemetry/telemetryChartPaths.js';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { BaselineChartSample, InterpolatedPoint, PointComparison } from '../../../../src/utils/replayComparison.js';
import { getTrajectoryDistances } from '../../../../src/utils/lapAlignment.js';

type Corners = [number, number, number, number];
const corners = (base: number, i: number, step: number): Corners =>
  [base + i * step, base + 1 + i * step, base + 2 + i * step, base + 3 + i * step];

// A whole synthetic lap with every channel the strip draws: a braking zone, a corner and a straight.
// Steering is ISO 8855 (positive left); the lap was first written right-positive, hence the minus.
function lapPoint(i: number, offset: number): InterpolatedPoint {
  const phase = i / 80;
  const speedKmh = 140 + 120 * Math.abs(Math.sin(Math.PI * phase)) + offset;
  return {
    timeSec: i * 0.5 + offset * 0.01, x: i * 12, y: 0, z: Math.sin(phase * 6) * 40,
    speedKmh, throttle: i % 20 < 12 ? 100 : 0, brake: i % 20 >= 14 ? 80 - (i % 20) * 2 : 0,
    steerYaw: -Math.sin(phase * 12) * 0.4, gear: 1 + (i % 9) - (i % 9 === 8 ? 9 : 0),
    engineRpm: 6000 + (i % 10) * 350, lateralOffsetM: Math.cos(phase * 5) * 3,
    accelLatG: Math.sin(phase * 9) * 2.5, accelLonG: Math.cos(phase * 7) * 1.8, accelTotalG: 1 + (i % 5) * 0.4,
    slipAngleDeg: Math.sin(phase * 11) * 4, understeerDeg: Math.cos(phase * 3) * 2, tireSlipPct: (i % 7) * 1.5,
    yawRateDeg: Math.sin(phase * 13) * 30, fuel: 60 - i * 0.05, virtualEnergy: 90 - i * 0.2,
    soc: 50 + Math.sin(phase * 4) * 20, regenRate: i % 20 >= 14 ? 200 + i : 0,
    brakeTemps: corners(400, i, 3), rideHeight: corners(30, i % 10, 0.5), wheelSpeeds: corners(speedKmh / 3.6, 0, 0),
    tirePressures: corners(170, i % 6, 0.4), tireWear: corners(99, i, -0.01), tireTemps: corners(80, i % 12, 0.6),
  };
}

function wholeLap(): { points: ReplayTrajectoryPoint[]; comparisons: PointComparison[]; baseline: BaselineChartSample[] } {
  const points: ReplayTrajectoryPoint[] = [];
  const comparisons: PointComparison[] = [];
  for (let i = 0; i <= 80; i++) {
    const point: ReplayTrajectoryPoint = lapPoint(i, 0);
    const baselinePoint = lapPoint(i, -3);
    points.push(point);
    comparisons.push({
      primary: point, baseline: baselinePoint, deltaTimeSec: Math.sin(i / 9) * 0.6 - i * 0.004,
      deltaSpeedKmh: 3, deltaThrottle: 0, deltaBrake: 0, deltaSteer: 0,
    });
  }
  const distances = getTrajectoryDistances(points);
  const baseline = distances.map((distance, i) => ({ distance: distance * 1.002, point: lapPoint(i, -3) }));
  return { points, comparisons, baseline };
}

// The traces added after the digests (balance fill by sign, steering force and its bands, 2026-11-28) are checked on
// their own below, so the digests keep covering every trace drawn before them.
const LATER_FIELDS = new Set(['understeerArea', 'oversteerArea', 'steerForcePath', 'baselineSteerForcePath', 'holdStillBands', 'counterSteerBands', 'hasSteerForce']);
const digest = (value: Record<string, unknown>): string => createHash('sha256')
  .update(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !LATER_FIELDS.has(key))))).digest('hex').slice(0, 16);

// The digests were taken from computeTelemetryChartPaths before it was split into its builders
// (main, 2026-09-29): the whole-lap output must stay byte-identical. Update them only for an
// intended change to how the strip is drawn.
describe('computeTelemetryChartPaths - whole lap golden output', () => {
  const { points, comparisons, baseline } = wholeLap();
  const distances = getTrajectoryDistances(points);

  it('draws the whole lap with the baseline read at the primary samples', () => {
    const { maxSpeed, maxGear, wheelSlipPaths, baselineWheelSlipPaths, hasWheelSlip, ...paths } = computeTelemetryChartPaths(points, comparisons, 0, 80, distances);
    expect(maxSpeed).toBe(265);
    expect(maxGear).toBe(7);
    expect(digest(paths)).toBe('a7e315513e4d88b3');
    // Measured wheel slip is live-capture only: absent here, and it leaves every other trace unchanged.
    expect({ wheelSlipPaths, baselineWheelSlipPaths, hasWheelSlip }).toEqual({ wheelSlipPaths: { fl: '', fr: '', rl: '', rr: '' },
      baselineWheelSlipPaths: { fl: '', fr: '', rl: '', rr: '' }, hasWheelSlip: false });
  });

  it('draws measured wheel slip on a ±30 % scale and breaks the line where a ratio is unavailable', () => {
    const slipPoints = points.slice(0, 4).map((point, i) => ({ ...point, wheelSlip: {
      ratios: [-0.15, i === 2 ? null : 0.3, 0, 0.6] as [number | null, number | null, number | null, number | null], lockup: [], wheelspin: [] } }));
    const result = computeTelemetryChartPaths(slipPoints, [], 0, 3, getTrajectoryDistances(slipPoints));
    expect(result.hasWheelSlip).toBe(true);
    expect(result.wheelSlipPaths.fl.match(/\d+\.\d (\d+\.\d)/g)?.map(pair => pair.split(' ')[1])).toEqual(['73.8', '73.8', '73.8', '73.8']);
    expect(result.wheelSlipPaths.fr.trim().split(/ (?=[ML])/).map(command => command[0])).toEqual(['M', 'L', 'M']);
    expect(result.wheelSlipPaths.rl).toContain(' 52.5');
    expect(result.wheelSlipPaths.rr).toContain(' 10.0'); // Clamped at +30 %.
  });

  it('fills the balance by sign along the centre line', () => {
    const result = computeTelemetryChartPaths(points, comparisons, 0, 80, distances);
    expect(result.understeerArea.endsWith('L 1000 50 L 0 50 Z')).toBe(true);
    // Understeer stays at or above the centre line (y <= 50), oversteer at or below it.
    const ys = (path: string) => [...path.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map(match => Number(match[1]));
    expect(Math.max(...ys(result.understeerArea))).toBeLessThanOrEqual(50);
    expect(Math.min(...ys(result.oversteerArea))).toBeGreaterThanOrEqual(50);
    expect(result.hasSteerForce).toBe(false);
    expect(result.steerForcePath).toBe('');
  });

  it('draws the steering force and bands its two moments', () => {
    const forcePoints = points.slice(0, 10).map((point, i) => ({ ...point, driverForcePct: i * 10 - 50,
      ...(i >= 2 && i < 4 ? { steerHoldStill: true as const } : {}), ...(i === 9 ? { passiveCounterSteer: true as const } : {}) }));
    const forceDistances = getTrajectoryDistances(forcePoints);
    const result = computeTelemetryChartPaths(forcePoints, [], 0, 9, forceDistances);
    expect(result.hasSteerForce).toBe(true);
    expect(result.steerForcePath.startsWith('M 0.0 71.0 ')).toBe(true); // -50 % is below the centre.
    expect(result.holdStillBands.match(/M /g)).toHaveLength(1);
    expect(result.counterSteerBands).toMatch(/^M 1000\.0 0 L 1001\.0 0 /); // Open at the view's end: a 1-unit band.
  });

  it('draws a zoomed window with the baseline lap on its own samples', () => {
    const { maxSpeed, maxGear, wheelSlipPaths: _slip, baselineWheelSlipPaths: _baselineSlip, hasWheelSlip: _hasSlip, ...paths } = computeTelemetryChartPaths(points, comparisons, 20, 55, distances, baseline);
    expect(maxSpeed).toBe(265);
    expect(maxGear).toBe(7);
    expect(digest(paths)).toBe('282745025ffc88df');
  });
});
