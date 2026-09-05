import { describe, it, expect } from 'vitest';
import { computeTelemetryChartPaths } from '../../src/components/replay/telemetryChartPaths.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';
import { PointComparison } from '../../src/utils/replayComparison.js';

describe('telemetryChartPaths - Dynamic Delta Gradient & Fading', () => {
  const createMockPoint = (timeSec: number, speedKmh: number = 180): ReplayTrajectoryPoint => ({
    timeSec,
    x: timeSec * 50,
    y: 0,
    z: 0,
    speedKmh,
    throttle: 100,
    brake: 0,
    steerYaw: 0,
  });

  const createMockComparison = (point: ReplayTrajectoryPoint, deltaTimeSec: number): PointComparison => ({
    primary: point,
    deltaTimeSec,
    deltaSpeedKmh: 0,
    deltaThrottle: 0,
    deltaBrake: 0,
    deltaSteer: 0,
    baseline: {
      timeSec: point.timeSec ?? 0,
      speedKmh: 180,
      throttle: 100,
      brake: 0,
      gear: 4,
      steerYaw: 0,
      x: (point.timeSec ?? 0) * 50,
      y: 0,
      z: 0,
    },
  });

  it('returns empty result when points array is empty', () => {
    const result = computeTelemetryChartPaths([], [], 0, 0, 1);
    expect(result.deltaTimePath).toBe('');
    expect(result.deltaGradientStops).toEqual([]);
    expect(result.deltaGainArea).toBe('');
    expect(result.deltaLossArea).toBe('');
  });

  it('generates vibrant green stops with high opacity when gaining time rapidly', () => {
    // Delta rapidly drops from 0 to -1.0s over 2 seconds (gaining 0.5s/s)
    const points: ReplayTrajectoryPoint[] = [];
    const comparisons: PointComparison[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = 10 + i * 0.1;
      const dt = -(i * 0.05); // -0.5s/s rate
      const pt = createMockPoint(t);
      points.push(pt);
      comparisons.push(createMockComparison(pt, dt));
    }

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // Active stops should be emerald green with high opacity (> 0.4)
    const activeStops = result.deltaGradientStops.filter(s => s.opacity > 0.4);
    expect(activeStops.length).toBeGreaterThan(0);
    activeStops.forEach(s => {
      expect(s.color).toBe('#10b981');
      expect(s.opacity).toBeGreaterThanOrEqual(0.4);
    });
  });

  it('generates vibrant red stops with high opacity when losing time rapidly', () => {
    // Delta rapidly climbs from 0 to +1.0s over 2 seconds (losing 0.5s/s)
    const points: ReplayTrajectoryPoint[] = [];
    const comparisons: PointComparison[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = 10 + i * 0.1;
      const dt = +(i * 0.05); // +0.5s/s rate
      const pt = createMockPoint(t);
      points.push(pt);
      comparisons.push(createMockComparison(pt, dt));
    }

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    const activeStops = result.deltaGradientStops.filter(s => s.opacity > 0.4);
    expect(activeStops.length).toBeGreaterThan(0);
    activeStops.forEach(s => {
      expect(s.color).toBe('#ef4444');
      expect(s.opacity).toBeGreaterThanOrEqual(0.4);
    });
  });

  it('fades to zero opacity when delta is flat/steady down a straight', () => {
    // Driver is already ahead by 1.5s, but delta remains completely flat
    const points: ReplayTrajectoryPoint[] = [];
    const comparisons: PointComparison[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = 10 + i * 0.1;
      const dt = -1.50; // flat delta
      const pt = createMockPoint(t);
      points.push(pt);
      comparisons.push(createMockComparison(pt, dt));
    }

    const result = computeTelemetryChartPaths(points, comparisons, 0, 30, 30);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // All stops in the flat zone should be faded to 0 opacity
    result.deltaGradientStops.forEach(s => {
      expect(s.opacity).toBe(0);
    });
    // Fallback trapezoids should also be omitted in flat zone to avoid barcode stripes
    expect(result.deltaGainArea).toBe('');
    expect(result.deltaLossArea).toBe('');
  });

  it('smoothly transitions between gaining and losing via zero-opacity transition stops', () => {
    // First 10 points gaining, next 10 points losing
    const points: ReplayTrajectoryPoint[] = [];
    const comparisons: PointComparison[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = 10 + i * 0.1;
      // parabolic delta: gains from 0 to 10, loses from 10 to 20
      const dt = Math.pow((i - 10) / 10, 2) * 0.5;
      const pt = createMockPoint(t);
      points.push(pt);
      comparisons.push(createMockComparison(pt, dt));
    }

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // Verify there are both green stops (during gain) and red stops (during loss)
    const hasGreen = result.deltaGradientStops.some(s => s.color === '#10b981' && s.opacity > 0.1);
    const hasRed = result.deltaGradientStops.some(s => s.color === '#ef4444' && s.opacity > 0.1);
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);

    // Verify transition region has zero opacity stops to prevent color bleed
    const zeroStops = result.deltaGradientStops.filter(s => s.opacity === 0);
    expect(zeroStops.length).toBeGreaterThan(0);
  });

  it('constructs airtight deltaTimeArea closing along the zero baseline', () => {
    const p0 = createMockPoint(10.0);
    const p1 = createMockPoint(10.5);
    const p2 = createMockPoint(11.0);
    const points: ReplayTrajectoryPoint[] = [p0, p1, p2];
    const comparisons: PointComparison[] = [
      createMockComparison(p0, -0.2),
      createMockComparison(p1, -0.5),
      createMockComparison(p2, -0.3),
    ];

    const result = computeTelemetryChartPaths(points, comparisons, 0, 2, 2);
    expect(result.deltaTimeArea).toContain('50 Z');
    expect(result.deltaTimeArea).toMatch(/^M \d+\.\d+ \d+\.\d+ L .* L \d+\.\d+ 50 L \d+\.\d+ 50 Z$/);
  });
});
