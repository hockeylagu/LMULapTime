import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { computeTelemetryChartPaths } from '../../../../src/components/replay/index.js';
import { ReplayTrajectoryPoint } from '../../../../server/core/types.js';
import { BaselineChartSample, InterpolatedPoint, PointComparison } from '../../../../src/utils/replayComparison.js';
import { getTrajectoryDistances } from '../../../../src/utils/lapAlignment.js';

type Corners = [number, number, number, number];
const corners = (base: number, i: number, step: number): Corners =>
  [base + i * step, base + 1 + i * step, base + 2 + i * step, base + 3 + i * step];

// A whole synthetic lap with every channel the strip draws: a braking zone, a corner and a straight.
function lapPoint(i: number, offset: number): InterpolatedPoint {
  const phase = i / 80;
  const speedKmh = 140 + 120 * Math.abs(Math.sin(Math.PI * phase)) + offset;
  return {
    timeSec: i * 0.5 + offset * 0.01, x: i * 12, y: 0, z: Math.sin(phase * 6) * 40,
    speedKmh, throttle: i % 20 < 12 ? 100 : 0, brake: i % 20 >= 14 ? 80 - (i % 20) * 2 : 0,
    steerYaw: Math.sin(phase * 12) * 0.4, gear: 1 + (i % 9) - (i % 9 === 8 ? 9 : 0),
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

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// The digests were taken from computeTelemetryChartPaths before it was split into its builders
// (main, 2026-09-29): the whole-lap output must stay byte-identical. Update them only for an
// intended change to how the strip is drawn.
describe('computeTelemetryChartPaths - whole lap golden output', () => {
  const { points, comparisons, baseline } = wholeLap();
  const distances = getTrajectoryDistances(points);

  it('draws the whole lap with the baseline read at the primary samples', () => {
    const { maxSpeed, ...paths } = computeTelemetryChartPaths(points, comparisons, 0, 80, distances);
    expect(maxSpeed).toBe(260);
    expect(digest(paths)).toBe('278c8ad681dda381');
  });

  it('draws a zoomed window with the baseline lap on its own samples', () => {
    const { maxSpeed, ...paths } = computeTelemetryChartPaths(points, comparisons, 20, 55, distances, baseline);
    expect(maxSpeed).toBe(260);
    expect(digest(paths)).toBe('af804d2781de7e34');
  });
});
