import { describe, it, expect } from 'vitest';
import { computeTelemetryChartPaths, DeltaGradientStop } from '../../src/components/replay/index.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';
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
    const result = computeTelemetryChartPaths([], [], 0, 0);
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

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // Active stops should be emerald green with high opacity (> 0.4)
    const activeStops = result.deltaGradientStops.filter((s: DeltaGradientStop) => s.opacity > 0.4);
    expect(activeStops.length).toBeGreaterThan(0);
    activeStops.forEach((s: DeltaGradientStop) => {
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

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    const activeStops = result.deltaGradientStops.filter((s: DeltaGradientStop) => s.opacity > 0.4);
    expect(activeStops.length).toBeGreaterThan(0);
    activeStops.forEach((s: DeltaGradientStop) => {
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

    const result = computeTelemetryChartPaths(points, comparisons, 0, 30);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // All stops in the flat zone should be faded to 0 opacity
    result.deltaGradientStops.forEach((s: DeltaGradientStop) => {
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

    const result = computeTelemetryChartPaths(points, comparisons, 0, 20);
    expect(result.deltaGradientStops.length).toBeGreaterThan(0);

    // Verify there are both green stops (during gain) and red stops (during loss)
    const hasGreen = result.deltaGradientStops.some((s: DeltaGradientStop) => s.color === '#10b981' && s.opacity > 0.1);
    const hasRed = result.deltaGradientStops.some((s: DeltaGradientStop) => s.color === '#ef4444' && s.opacity > 0.1);
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);

    // Verify transition region has zero opacity stops to prevent color bleed
    const zeroStops = result.deltaGradientStops.filter((s: DeltaGradientStop) => s.opacity === 0);
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

    const result = computeTelemetryChartPaths(points, comparisons, 0, 2);
    expect(result.deltaTimeArea).toContain('50 Z');
    expect(result.deltaTimeArea).toMatch(/^M \d+\.\d+ \d+\.\d+ L .* L \d+\.\d+ 50 L \d+\.\d+ 50 Z$/);
  });

  it('computes 4-corner paths and dynamic boundaries for suspension, wheel speeds, tire pressures, wear, temps, and brakes', () => {
    const ptA: ReplayTrajectoryPoint = {
      x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.0,
      rideHeight: [20, 22, 30, 32],
      wheelSpeeds: [180, 181, 185, 186],
      tirePressures: [180, 181, 190, 191],
      tireWear: [99.5, 99.2, 98.8, 98.5],
      tireTemps: [82, 84, 90, 92],
      brakeTemps: [420, 410, 360, 350],
    };

    const ptB: ReplayTrajectoryPoint = {
      x: 50, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, steerYaw: 0, timeSec: 11.0,
      rideHeight: [25, 27, 35, 37],
      wheelSpeeds: [200, 202, 205, 207],
      tirePressures: [182, 183, 192, 193],
      tireWear: [99.0, 98.7, 98.2, 98.0],
      tireTemps: [86, 88, 94, 96],
      brakeTemps: [500, 490, 410, 400],
    };

    const compA: PointComparison = {
      primary: ptA,
      deltaTimeSec: 0,
      deltaSpeedKmh: 0,
      deltaThrottle: 0,
      deltaBrake: 0,
      deltaSteer: 0,
      baseline: {
        timeSec: 10.0, speedKmh: 180, throttle: 100, brake: 0, gear: 4, steerYaw: 0, x: 0, y: 0, z: 0,
        rideHeight: [19, 21, 29, 31],
        wheelSpeeds: [179, 180, 184, 185],
        tirePressures: [179, 180, 189, 190],
        tireWear: [99.8, 99.6, 99.1, 99.0],
        tireTemps: [80, 82, 88, 90],
        brakeTemps: [400, 390, 340, 330],
      },
    };

    const compB: PointComparison = {
      primary: ptB,
      deltaTimeSec: 0,
      deltaSpeedKmh: 0,
      deltaThrottle: 0,
      deltaBrake: 0,
      deltaSteer: 0,
      baseline: {
        timeSec: 11.0, speedKmh: 200, throttle: 100, brake: 0, gear: 4, steerYaw: 0, x: 50, y: 0, z: 0,
        rideHeight: [24, 26, 34, 36],
        wheelSpeeds: [199, 201, 204, 206],
        tirePressures: [181, 182, 191, 192],
        tireWear: [99.2, 99.0, 98.6, 98.4],
        tireTemps: [84, 86, 92, 94],
        brakeTemps: [480, 470, 390, 380],
      },
    };

    const result = computeTelemetryChartPaths([ptA, ptB], [compA, compB], 0, 1);

    // Verify all corner paths exist for both primary and baseline
    (['fl', 'fr', 'rl', 'rr'] as const).forEach((corner) => {
      expect(result.suspPosPaths[corner]).toContain('M ');
      expect(result.baselineSuspPosPaths[corner]).toContain('M ');

      expect(result.wheelSpeedsPaths[corner]).toContain('M ');
      expect(result.baselineWheelSpeedsPaths[corner]).toContain('M ');

      expect(result.tirePressuresPaths[corner]).toContain('M ');
      expect(result.baselineTirePressuresPaths[corner]).toContain('M ');

      expect(result.tireWearPaths[corner]).toContain('M ');
      expect(result.baselineTireWearPaths[corner]).toContain('M ');

      expect(result.tireTempsPaths[corner]).toContain('M ');
      expect(result.baselineTireTempsPaths[corner]).toContain('M ');

      expect(result.brakeTempsPaths[corner]).toContain('M ');
      expect(result.baselineBrakeTempsPaths[corner]).toContain('M ');
    });

    // Verify dynamic bounds
    expect(result.minSuspPos).toBeLessThanOrEqual(20);
    expect(result.maxSuspPos).toBeGreaterThanOrEqual(37);

    expect(result.maxWheelSpeed).toBeGreaterThanOrEqual(207);

    expect(result.minTirePressure).toBeLessThanOrEqual(180);
    expect(result.maxTirePressure).toBeGreaterThanOrEqual(193);

    expect(result.minTireWear).toBeLessThanOrEqual(98.0);
    expect(result.maxTireWear).toBe(100);

    expect(result.minTireTemp).toBeLessThanOrEqual(82);
    expect(result.maxTireTemp).toBeGreaterThanOrEqual(96);

    expect(result.maxBrakeTemp).toBeGreaterThanOrEqual(500);
  });

  it('inverts steering graph so Left is UP (lower SVG Y) and Right is BOTTOM (higher SVG Y)', () => {
    const leftPoint: ReplayTrajectoryPoint = { timeSec: 0, x: 0, y: 0, z: 0, speedKmh: 100, steerYaw: -270 };
    const centerPoint: ReplayTrajectoryPoint = { timeSec: 1, x: 50, y: 0, z: 0, speedKmh: 100, steerYaw: 0 };
    const rightPoint: ReplayTrajectoryPoint = { timeSec: 2, x: 100, y: 0, z: 0, speedKmh: 100, steerYaw: 270 };

    const comparisons: PointComparison[] = [
      createMockComparison(leftPoint, 0),
      createMockComparison(centerPoint, 0),
      createMockComparison(rightPoint, 0),
    ];

    const result = computeTelemetryChartPaths([leftPoint, centerPoint, rightPoint], comparisons, 0, 2);
    // Parse SVG Y coordinates from result.steerPath: "M 0.0 10.0 L 500.0 50.0 L 1000.0 90.0 "
    const tokens = result.steerPath.trim().split(/\s+/);
    const y1 = parseFloat(tokens[2]); // left
    const y2 = parseFloat(tokens[5]); // center
    const y3 = parseFloat(tokens[8]); // right

    expect(y1).toBeCloseTo(10.0, 1); // Left steer is at the top (Y = 10)
    expect(y2).toBeCloseTo(50.0, 1); // Center steer is at center (Y = 50)
    expect(y3).toBeCloseTo(90.0, 1); // Right steer is at the bottom (Y = 90)
  });
});
