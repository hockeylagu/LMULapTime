import { describe, it, expect } from 'vitest';
import { applyTelemetryPostProcessing, applyTelemetryPostProcessingToTrajectory } from '../../src/utils/telemetryPostProcessing';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/types';

function point(overrides: Partial<ReplayTrajectoryPoint>): ReplayTrajectoryPoint {
  return { x: 0, y: 0, z: 0, ...overrides };
}

describe('applyTelemetryPostProcessing', () => {
  it('bridges a short neutral (clutch) gap between two real gears to the new gear', () => {
    const points = [
      point({ gear: 2 }),
      point({ gear: 2 }),
      point({ gear: 0 }),
      point({ gear: 0 }),
      point({ gear: 3 }),
      point({ gear: 3 }),
    ];
    const result = applyTelemetryPostProcessing(points);
    expect(result.map(p => p.gear)).toEqual([2, 2, 3, 3, 3, 3]);
  });

  it('leaves a long neutral stretch (parked / coasting) untouched', () => {
    const points = Array.from({ length: 10 }, () => point({ gear: 0 }));
    const result = applyTelemetryPostProcessing(points);
    expect(result.every(p => p.gear === 0)).toBe(true);
  });

  it('corrects a momentary 1-frame gear flicker back to the surrounding gear', () => {
    const points = [
      point({ gear: 3 }),
      point({ gear: 3 }),
      point({ gear: 2 }),
      point({ gear: 3 }),
      point({ gear: 3 }),
    ];
    const result = applyTelemetryPostProcessing(points);
    expect(result.map(p => p.gear)).toEqual([3, 3, 3, 3, 3]);
  });

  it('filters out downshift rev-match throttle blips during heavy braking', () => {
    const points = [
      point({ throttle: 0, brake: 50 }),
      point({ throttle: 0, brake: 50 }),
      point({ throttle: 65, brake: 50 }), // blip
      point({ throttle: 0, brake: 50 }),
      point({ throttle: 0, brake: 50 }),
    ];
    const result = applyTelemetryPostProcessing(points);
    expect(result[2].throttle).toBe(0);
  });

  it('interpolates brief upshift ignition cuts to preserve full throttle intent', () => {
    const points = [
      point({ throttle: 100, brake: 0 }),
      point({ throttle: 100, brake: 0 }),
      point({ throttle: 10, brake: 0 }), // upshift cut
      point({ throttle: 100, brake: 0 }),
      point({ throttle: 100, brake: 0 }),
    ];
    const result = applyTelemetryPostProcessing(points);
    expect(result[2].throttle).toBeGreaterThanOrEqual(90);
  });

  it('smooths speed over a 3-frame window and zeroes out noise for near-stationary points', () => {
    const points = [
      point({ speedKmh: 0 }),
      point({ speedKmh: 1 }),
      point({ speedKmh: 0 }),
      point({ speedKmh: 100 }),
      point({ speedKmh: 102 }),
      point({ speedKmh: 101 }),
    ];
    const result = applyTelemetryPostProcessing(points);
    expect(result[0].speedKmh).toBe(0);
    expect(result[1].speedKmh).toBe(0);
    expect(result[4].speedKmh).toBeCloseTo(101, 0);
  });

  it('does not mutate the input points array', () => {
    const points = [point({ gear: 2 }), point({ gear: 0 }), point({ gear: 0 }), point({ gear: 3 })];
    const snapshot = points.map(p => ({ ...p }));
    applyTelemetryPostProcessing(points);
    expect(points).toEqual(snapshot);
  });

  it('returns the same empty array reference for an empty input', () => {
    const points: ReplayTrajectoryPoint[] = [];
    expect(applyTelemetryPostProcessing(points)).toBe(points);
  });
});

describe('applyTelemetryPostProcessingToTrajectory', () => {
  it('passes through null/undefined without throwing', () => {
    expect(applyTelemetryPostProcessingToTrajectory(null)).toBeNull();
    expect(applyTelemetryPostProcessingToTrajectory(undefined)).toBeUndefined();
  });

  it('applies post-processing to the trajectory points without mutating the original', () => {
    const trajectory: ReplayTrajectoryData = {
      replayName: 'Test.Vcr',
      pointsCount: 2,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      points: [point({ gear: 2 }), point({ gear: 0 })],
    };
    const result = applyTelemetryPostProcessingToTrajectory(trajectory);
    expect(result).not.toBe(trajectory);
    expect(result?.points).not.toBe(trajectory.points);
    expect(trajectory.points.map(p => p.gear)).toEqual([2, 0]);
  });
});
