import { describe, it, expect } from 'vitest';
import { applyTelemetryPostProcessing, applyTelemetryPostProcessingToTrajectory } from '../../src/utils/telemetryPostProcessing.js';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/core/types.js';

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

  describe('windows are durations, not sample counts', () => {
    // The same throttle event sampled every `dtSec` (the server resamples each lap to a fixed
    // point count, so spacing is ~40 ms on a short lap and ~100 ms at Le Mans).
    const sampled = (dtSec: number, durationSec: number, at: (t: number) => Partial<ReplayTrajectoryPoint>) =>
      Array.from({ length: Math.round(durationSec / dtSec) + 1 }, (_, i) => point({ timeSec: 100 + i * dtSec, ...at(i * dtSec) }));
    const dipBetween = (from: number, to: number) => (t: number) => ({ throttle: t >= from && t < to ? 10 : 100, brake: 0 });

    it.each([0.04, 0.1])('bridges a 0.1 s upshift cut at %s s spacing', dtSec => {
      const result = applyTelemetryPostProcessing(sampled(dtSec, 1, dipBetween(0.5, 0.6)));
      expect(Math.min(...result.map(p => p.throttle ?? 0))).toBeGreaterThanOrEqual(90);
    });

    it.each([0.04, 0.1])('keeps a genuine 0.4 s lift at %s s spacing', dtSec => {
      const result = applyTelemetryPostProcessing(sampled(dtSec, 1.5, dipBetween(0.5, 0.9)));
      expect(result.filter(p => p.throttle === 10).length).toBeGreaterThanOrEqual(3);
    });

    it.each([0.04, 0.1])('removes a 0.2 s rev-match blip under braking but keeps 0.8 s of overlap at %s s spacing', dtSec => {
      const underBrake = (from: number, to: number) => (t: number) => ({ brake: 60, throttle: t >= from && t < to ? 60 : 0 });
      const blip = applyTelemetryPostProcessing(sampled(dtSec, 1.5, underBrake(0.5, 0.7)));
      expect(blip.every(p => p.throttle === 0)).toBe(true);
      const overlap = applyTelemetryPostProcessing(sampled(dtSec, 2, underBrake(0.5, 1.3)));
      expect(overlap.some(p => p.throttle === 60)).toBe(true);
    });

    it.each([0.04, 0.1])('bridges a 0.2 s neutral gap but keeps 1 s in neutral at %s s spacing', dtSec => {
      const neutralBetween = (from: number, to: number) => (t: number) => ({ gear: t >= from && t < to ? 0 : t < from ? 3 : 4 });
      expect(applyTelemetryPostProcessing(sampled(dtSec, 1, neutralBetween(0.5, 0.7))).some(p => p.gear === 0)).toBe(false);
      expect(applyTelemetryPostProcessing(sampled(dtSec, 2, neutralBetween(0.5, 1.5))).some(p => p.gear === 0)).toBe(true);
    });

    it.each([0.04, 0.1])('leaves a steady speed ramp unchanged at %s s spacing', dtSec => {
      const result = applyTelemetryPostProcessing(sampled(dtSec, 2, t => ({ speedKmh: 100 + 50 * t })));
      result.forEach((p, i) => expect(p.speedKmh).toBeCloseTo(Math.round(100 + 50 * i * dtSec), 0));
    });
  });

  it('smooths speed over a short time window and zeroes out noise for near-stationary points', () => {
    const points = [
      point({ timeSec: 0, speedKmh: 0 }),
      point({ timeSec: 0.05, speedKmh: 1 }),
      point({ timeSec: 0.1, speedKmh: 0 }),
      point({ timeSec: 0.15, speedKmh: 100 }),
      point({ timeSec: 0.2, speedKmh: 102 }),
      point({ timeSec: 0.25, speedKmh: 101 }),
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
