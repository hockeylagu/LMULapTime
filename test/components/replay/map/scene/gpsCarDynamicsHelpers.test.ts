import { describe, it, expect } from 'vitest';
import {
  resolveCarAcceleration,
  interpolatePrimaryPoint,
  computeLineSeparation,
  interpolateDeltaTime,
} from '../../../../../src/components/replay/map/scene/gpsCarDynamicsHelpers.js';
import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';

describe('resolveCarAcceleration', () => {
  it('returns undefined for empty points array', () => {
    expect(resolveCarAcceleration([], 0)).toBeUndefined();
  });

  it('uses existing telemetry accel channels when available and interpolates with fraction', () => {
    const points = [
      { x: 0, z: 0, accelLatG: 1.0, accelLonG: 0.5 },
      { x: 10, z: 0, accelLatG: 2.0, accelLonG: 1.5 },
    ];

    expect(resolveCarAcceleration(points, 0)).toEqual({ latG: 1.0, lonG: 0.5 });
    expect(resolveCarAcceleration(points, 0, 0.5)).toEqual({ latG: 1.5, lonG: 1.0 });
    expect(resolveCarAcceleration(points, 1)).toEqual({ latG: 2.0, lonG: 1.5 });
  });

  it('derives kinematic longitudinal and lateral acceleration when channels are missing', () => {
    // 3 samples: accelerating from 100 km/h to 136 km/h over 1 second (10 m/s^2 ≈ 1.02G)
    // while turning right at ~40 deg/s
    const points = [
      { x: 0, z: 0, speedKmh: 100, timeSec: 0.0, rotY: 0 },
      { x: 10, z: 20, speedKmh: 118, timeSec: 0.5, rotY: 0.35 },
      { x: 25, z: 45, speedKmh: 136, timeSec: 1.0, rotY: 0.70 },
    ];

    const accel = resolveCarAcceleration(points, 1);
    expect(accel).toBeDefined();
    // lonG should be ~1.02G
    expect(accel!.lonG).toBeGreaterThan(0.8);
    expect(accel!.lonG).toBeLessThan(1.2);
    // latG should be finite and non-zero
    expect(Number.isFinite(accel!.latG)).toBe(true);
  });

  it('derives negative lateral G in a right turn (ISO 8855), matching computeLateralG', () => {
    // Heading atan2(dx, dz) grows clockwise in LMU coordinates: rotY increasing is a right turn.
    const points = [
      { x: 0, z: 0, speedKmh: 144, timeSec: 0.0, rotY: 0.0 },
      { x: 3.9, z: 1.0, speedKmh: 144, timeSec: 0.1, rotY: 0.05 },
      { x: 7.6, z: 2.2, speedKmh: 144, timeSec: 0.2, rotY: 0.10 },
    ];
    expect(resolveCarAcceleration(points, 1)!.latG).toBeLessThan(-1.5);
    const mirrored = points.map(p => ({ ...p, x: -p.x, rotY: -p.rotY }));
    expect(resolveCarAcceleration(mirrored, 1)!.latG).toBeGreaterThan(1.5);
  });

  it('handles stationary or constant speed vehicle without NaN or Inf', () => {
    const points = [
      { x: 0, z: 0, speedKmh: 0, timeSec: 0.0, rotY: 0 },
      { x: 0, z: 0, speedKmh: 0, timeSec: 0.1, rotY: 0 },
    ];

    const accel = resolveCarAcceleration(points, 0);
    expect(accel).toEqual({ latG: 0, lonG: 0 });
  });

  it('resolves the full turn rate from path tangents without body orientation', () => {
    // Radius 80 m, speed 40 m/s: right turn r = 0.5 rad/s, a_y = -20 m/s².
    const points = Array.from({ length: 9 }, (_, i) => ({
      x: 80 * (1 - Math.cos(i * 0.05)), z: 80 * Math.sin(i * 0.05),
      timeSec: i * 0.1, speedKmh: 144,
    }));
    expect(resolveCarAcceleration(points, 4)).toEqual({ latG: -2.04, lonG: 0 });
    expect(resolveCarAcceleration(points.map(p => ({ ...p, x: -p.x })), 4))
      .toEqual({ latG: 2.04, lonG: 0 });
  });

  it('does not invent lateral G at either endpoint of a diagonal straight', () => {
    const points = Array.from({ length: 5 }, (_, i) => ({
      x: i * 3, z: i * 4, timeSec: i * 0.1, speedKmh: 180,
    }));
    for (const index of [0, 2, 4]) {
      expect(resolveCarAcceleration(points, index)).toEqual({ latG: 0, lonG: 0 });
    }
  });
});

describe('interpolatePrimaryPoint', () => {
  const p0: ReplayTelemetryPoint = { x: 10, y: 1, z: 20, speedKmh: 100, throttle: 50, brake: 0 };
  const p1: ReplayTelemetryPoint = { x: 20, y: 3, z: 40, speedKmh: 120, throttle: 100, brake: 20 };

  it('returns p0 when fraction is 0', () => {
    expect(interpolatePrimaryPoint([p0, p1], 0, 0)).toEqual(p0);
  });

  it('smoothly interpolates coordinates and telemetry at fraction 0.5', () => {
    const interpolated = interpolatePrimaryPoint([p0, p1], 0, 0.5);
    expect(interpolated).toBeDefined();
    expect(interpolated!.x).toBe(15);
    expect(interpolated!.y).toBe(2);
    expect(interpolated!.z).toBe(30);
    expect(interpolated!.speedKmh).toBe(110);
    expect(interpolated!.throttle).toBe(75);
    expect(interpolated!.brake).toBe(10);
  });

  it('handles boundary index at end of array', () => {
    expect(interpolatePrimaryPoint([p0, p1], 1, 0.5)).toEqual(p1);
  });
});

describe('computeLineSeparation', () => {
  it('computes Euclidean distance in meters between two points at the same station', () => {
    const pt1 = { x: 10, z: 20 };
    const pt2 = { x: 13, z: 24 };
    // hypot(3, 4) = 5.0
    expect(computeLineSeparation(pt1, pt2)).toBe(5);
  });

  it('returns null if either point is missing coordinates', () => {
    expect(computeLineSeparation(null, { x: 10, z: 20 })).toBeNull();
    expect(computeLineSeparation({ x: 10, z: 20 }, undefined)).toBeNull();
    expect(computeLineSeparation({ x: 10 }, { x: 10, z: 20 })).toBeNull();
  });
});

describe('interpolateDeltaTime', () => {
  it('interpolates delta time smoothly with fraction', () => {
    const comparisons = [{ deltaTimeSec: 0.20 }, { deltaTimeSec: 0.30 }];
    expect(interpolateDeltaTime(comparisons, 0, 0)).toBe(0.20);
    expect(interpolateDeltaTime(comparisons, 0, 0.5)).toBe(0.25);
    expect(interpolateDeltaTime(comparisons, 0, 1.0)).toBe(0.30);
  });

  it('handles empty or null comparisons safely', () => {
    expect(interpolateDeltaTime(null, 0)).toBeNull();
    expect(interpolateDeltaTime([], 0)).toBeNull();
  });
});
