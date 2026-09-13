import { describe, it, expect } from 'vitest';
import {
  unwrapAngle,
  computeLongitudinalG,
  computeYawRate,
  computeLateralG,
  computeSlipAngle,
  computeUnderOversteer,
  computeTireSlipAndLockup,
  computeVehicleDynamics,
} from '../../src/utils/computedTelemetry.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';

function makePoint(overrides: Partial<ReplayTrajectoryPoint>): ReplayTrajectoryPoint {
  return {
    x: 0,
    y: 0,
    z: 0,
    speedKmh: 100,
    timeSec: 0,
    throttle: 0,
    brake: 0,
    steerYaw: 0,
    rotY: 0,
    ...overrides,
  };
}

describe('computedTelemetry physics engine', () => {
  describe('unwrapAngle', () => {
    it('unwraps angles crossing pi boundary', () => {
      const diff1 = Math.PI + 0.1;
      expect(unwrapAngle(diff1)).toBeCloseTo(-Math.PI + 0.1, 5);

      const diff2 = -Math.PI - 0.2;
      expect(unwrapAngle(diff2)).toBeCloseTo(Math.PI - 0.2, 5);

      expect(unwrapAngle(0.5)).toBeCloseTo(0.5, 5);
    });
  });

  describe('computeLongitudinalG', () => {
    it('returns near 0G for constant speed', () => {
      const points = [
        makePoint({ timeSec: 0.0, speedKmh: 200 }),
        makePoint({ timeSec: 0.1, speedKmh: 200 }),
        makePoint({ timeSec: 0.2, speedKmh: 200 }),
        makePoint({ timeSec: 0.3, speedKmh: 200 }),
      ];
      const g = computeLongitudinalG(points);
      expect(g.every(val => Math.abs(val) < 0.05)).toBe(true);
    });

    it('returns negative G under heavy braking', () => {
      // 252 km/h (70 m/s) to 108 km/h (30 m/s) in 1.5 seconds -> dv/dt = -40 / 1.5 = -26.67 m/s^2 (~ -2.72G)
      const points: ReplayTrajectoryPoint[] = [];
      const n = 15;
      for (let i = 0; i < n; i++) {
        const t = i * 0.1;
        const spd = 252 - i * (144 / (n - 1));
        points.push(makePoint({ timeSec: t, speedKmh: spd, brake: 90 }));
      }
      const g = computeLongitudinalG(points);
      expect(g[7]).toBeLessThan(-2.0);
    });

    it('returns positive G under full acceleration', () => {
      // 100 km/h (27.78 m/s) to 150 km/h (41.67 m/s) in 2 seconds -> dv/dt = 13.89 / 2 = 6.94 m/s^2 (~ 0.71G)
      const points: ReplayTrajectoryPoint[] = [];
      const n = 20;
      for (let i = 0; i < n; i++) {
        const t = i * 0.1;
        const spd = 100 + i * (50 / (n - 1));
        points.push(makePoint({ timeSec: t, speedKmh: spd, throttle: 100 }));
      }
      const g = computeLongitudinalG(points);
      expect(g[10]).toBeGreaterThan(0.5);
      expect(g[10]).toBeLessThan(1.2);
    });
  });

  describe('computeYawRate & computeLateralG', () => {
    it('returns 0 yaw rate and 0 lateral G on straightaway', () => {
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 180, rotY: 0 }),
        makePoint({ x: 0, z: 5, timeSec: 0.1, speedKmh: 180, rotY: 0 }),
        makePoint({ x: 0, z: 10, timeSec: 0.2, speedKmh: 180, rotY: 0 }),
      ];
      const yawRates = computeYawRate(points);
      const latG = computeLateralG(points, yawRates);
      expect(yawRates[1]).toBe(0);
      expect(latG[1]).toBe(0);
    });

    it('computes positive yaw rate and lateral G in right turn', () => {
      // Speed 144 km/h (40 m/s), rotating right by 0.05 rad (~2.86 deg) per 0.1s -> yawRate = 28.6 deg/s (0.5 rad/s)
      // aLat = v * omega = 40 * 0.5 = 20 m/s^2 (~ 2.04G)
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 144, rotY: 0.0 }),
        makePoint({ x: 3.9, z: 1.0, timeSec: 0.1, speedKmh: 144, rotY: 0.05 }),
        makePoint({ x: 7.6, z: 2.2, timeSec: 0.2, speedKmh: 144, rotY: 0.10 }),
        makePoint({ x: 11.1, z: 3.5, timeSec: 0.3, speedKmh: 144, rotY: 0.15 }),
      ];
      const yawRates = computeYawRate(points);
      const latG = computeLateralG(points, yawRates);

      expect(yawRates[1]).toBeGreaterThan(20);
      expect(latG[1]).toBeGreaterThan(1.5);
      expect(latG[1]).toBeLessThan(2.5);
    });

    it('falls back to trajectory path tangent when rotY is missing', () => {
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 100 }),
        makePoint({ x: 1, z: 5, timeSec: 0.1, speedKmh: 100 }),
        makePoint({ x: 3, z: 9, timeSec: 0.2, speedKmh: 100 }),
        makePoint({ x: 6, z: 12, timeSec: 0.3, speedKmh: 100 }),
      ];
      const yawRates = computeYawRate(points);
      expect(yawRates.length).toBe(4);
      expect(yawRates.some(r => r !== 0)).toBe(true);
    });
  });

  describe('computeSlipAngle', () => {
    it('suppresses slip angle at near-stationary speeds', () => {
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 5, rotY: 0.5 }),
        makePoint({ x: 0.1, z: 0.1, timeSec: 0.1, speedKmh: 5, rotY: 0.5 }),
      ];
      const slip = computeSlipAngle(points);
      expect(slip[0]).toBe(0);
      expect(slip[1]).toBe(0);
    });

    it('detects vehicle slip angle when heading differs from velocity vector', () => {
      // Velocity direction along Z-axis (atan2(dx, dz) = 0), but car heading rotY is turned 0.1 rad (~5.73 deg)
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 120, rotY: 0.1 }),
        makePoint({ x: 0, z: 5, timeSec: 0.1, speedKmh: 120, rotY: 0.1 }),
        makePoint({ x: 0, z: 10, timeSec: 0.2, speedKmh: 120, rotY: 0.1 }),
        makePoint({ x: 0, z: 15, timeSec: 0.3, speedKmh: 120, rotY: 0.1 }),
      ];
      const slip = computeSlipAngle(points);
      expect(Math.abs(slip[1])).toBeGreaterThan(4.0);
      expect(Math.abs(slip[1])).toBeLessThan(7.0);
    });

    it('detects vehicle slip angle on native LMU replays with PI offset without binary clamping', () => {
      // Native LMU coordinates where car forward is -Z (rotY ~ PI when moving along +Z)
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 120, rotY: Math.PI + 0.05 }),
        makePoint({ x: 0, z: 5, timeSec: 0.1, speedKmh: 120, rotY: Math.PI + 0.05 }),
        makePoint({ x: 0, z: 10, timeSec: 0.2, speedKmh: 120, rotY: Math.PI + 0.05 }),
        makePoint({ x: 0, z: 15, timeSec: 0.3, speedKmh: 120, rotY: Math.PI + 0.05 }),
      ];
      const slip = computeSlipAngle(points);
      expect(Math.abs(slip[1])).toBeGreaterThan(2.0);
      expect(Math.abs(slip[1])).toBeLessThan(4.0);
    });

    it('approximates slip angle from lateral acceleration when rotY is missing', () => {
      const points = [
        makePoint({ x: 0, z: 0, timeSec: 0.0, speedKmh: 120, accelLatG: 2.0 }),
        makePoint({ x: 1, z: 5, timeSec: 0.1, speedKmh: 120, accelLatG: 2.0 }),
        makePoint({ x: 3, z: 10, timeSec: 0.2, speedKmh: 120, accelLatG: 2.0 }),
      ];
      const slip = computeSlipAngle(points);
      expect(slip[1]).toBeCloseTo(1.7, 1);
    });
  });

  describe('computeUnderOversteer', () => {
    it('returns 0 when driving straight on straightaways', () => {
      const points = [
        makePoint({ speedKmh: 200, steerYaw: 0 }),
        makePoint({ speedKmh: 200, steerYaw: 0.5 }),
      ];
      const balance = computeUnderOversteer(points, [0, 0]);
      expect(balance).toEqual([0, 0]);
    });

    it('detects understeer when driver steers heavily into corner without proportional yaw rate', () => {
      // Steering wheel at 60 deg (road wheel = 4 deg), but vehicle only turning at 5 deg/s at 100 km/h (27.8 m/s)
      // Kinematic requirement: (2.7 * (5 * PI/180) / 27.8) * 180/PI = ~0.49 deg
      // Difference: 4.0 - 0.49 = +3.51 deg Understeer
      const points = [
        makePoint({ speedKmh: 100, steerYaw: 60 }),
        makePoint({ speedKmh: 100, steerYaw: 60 }),
        makePoint({ speedKmh: 100, steerYaw: 60 }),
      ];
      const balance = computeUnderOversteer(points, [5, 5, 5]);
      expect(balance[1]).toBeGreaterThan(2.0);
    });

    it('detects oversteer when vehicle yaw rotation exceeds steering lock (loose rear)', () => {
      // Steering wheel at 15 deg (road wheel = ~0.68 deg), but yaw rate is high (45 deg/s) at 100 km/h
      // Kinematic requirement: ~4.37 deg
      // Difference: (0.68 - 4.37) * +1 = -3.69 deg Oversteer
      const points = [
        makePoint({ speedKmh: 100, steerYaw: 15 }),
        makePoint({ speedKmh: 100, steerYaw: 15 }),
        makePoint({ speedKmh: 100, steerYaw: 15 }),
      ];
      const balance = computeUnderOversteer(points, [45, 45, 45]);
      expect(balance[1]).toBeLessThan(-1.5);
    });

    it('detects corner exit oversteer slide when driver countersteers against yaw rotation', () => {
      // Car is rotating right (+35 deg/s) on throttle exit at 90 km/h,
      // driver countersteers left (steerYaw = -30 deg) to catch the slide
      const points = [
        makePoint({ speedKmh: 90, steerYaw: -30, throttle: 100 }),
        makePoint({ speedKmh: 90, steerYaw: -30, throttle: 100 }),
        makePoint({ speedKmh: 90, steerYaw: -30, throttle: 100 }),
      ];
      const balance = computeUnderOversteer(points, [35, 35, 35]);
      // Must report negative (Oversteer), NOT inverted to positive Understeer
      expect(balance[1]).toBeLessThan(-3.0);
    });

    it('correctly detects left-hand corner oversteer slide symmetrically', () => {
      // Car is rotating left (-35 deg/s) on throttle exit at 90 km/h,
      // driver countersteers right (steerYaw = +30 deg)
      const points = [
        makePoint({ speedKmh: 90, steerYaw: 30, throttle: 100 }),
        makePoint({ speedKmh: 90, steerYaw: 30, throttle: 100 }),
        makePoint({ speedKmh: 90, steerYaw: 30, throttle: 100 }),
      ];
      const balance = computeUnderOversteer(points, [-35, -35, -35]);
      expect(balance[1]).toBeLessThan(-3.0);
    });
  });

  describe('computeTireSlipAndLockup', () => {
    it('detects ABS active wheel lockup and boosts slip percentage', () => {
      const points = [makePoint({ brake: 80, absActive: true })];
      const result = computeTireSlipAndLockup(points, [-1.5], [0], [0], [0]);
      expect(result.wheelLockActive[0]).toBe(true);
      expect(result.tireSlipPct[0]).toBeGreaterThanOrEqual(90);
    });

    it('detects non-ABS wheel lockup under severe deceleration saturation', () => {
      // Non-ABS car: absActive is false, but deceleration is -2.8G with 85% brake
      const points = [makePoint({ brake: 85, absActive: false, speedKmh: 160 })];
      const result = computeTireSlipAndLockup(points, [-2.8], [0], [0], [0]);
      expect(result.wheelLockActive[0]).toBe(true);
      expect(result.tireSlipPct[0]).toBeGreaterThanOrEqual(90);
    });

    it('detects non-ABS kinetic skid where deceleration drops under high brake pedal', () => {
      // Driver stomping on brake (75%), but deceleration drops to -0.8G because tires are skidding
      const points = [makePoint({ brake: 75, absActive: false, speedKmh: 120 })];
      const result = computeTireSlipAndLockup(points, [-0.8], [0], [0], [0]);
      expect(result.wheelLockActive[0]).toBe(true);
      expect(result.tireSlipPct[0]).toBeGreaterThanOrEqual(90);
    });

    it('detects non-ABS front wheel lockup plow (steering applied but no yaw rotation under brake)', () => {
      // Braking at 60%, steering wheel turned 40 degrees, but yaw rate is 1 deg/s (locked front axle)
      const points = [makePoint({ brake: 60, absActive: false, steerYaw: 40, speedKmh: 90 })];
      const result = computeTireSlipAndLockup(points, [-1.5], [0], [0], [1.0]);
      expect(result.wheelLockActive[0]).toBe(true);
      expect(result.tireSlipPct[0]).toBeGreaterThanOrEqual(90);
    });

    it('detects traction control wheelspin and boosts slip percentage', () => {
      const points = [makePoint({ throttle: 100, tcActive: true })];
      const result = computeTireSlipAndLockup(points, [0.8], [0], [0], [0]);
      expect(result.wheelLockActive[0]).toBe(false);
      expect(result.tireSlipPct[0]).toBeGreaterThanOrEqual(80);
    });
  });

  describe('computeVehicleDynamics integrated pipeline', () => {
    it('enriches points with all computed telemetry fields', () => {
      const points = [
        makePoint({ timeSec: 0.0, speedKmh: 150, steerYaw: 10, rotY: 0.0, x: 0, z: 0 }),
        makePoint({ timeSec: 0.1, speedKmh: 155, steerYaw: 15, rotY: 0.02, x: 1, z: 4.5 }),
        makePoint({ timeSec: 0.2, speedKmh: 160, steerYaw: 15, rotY: 0.04, x: 2, z: 9.0 }),
      ];
      const enriched = computeVehicleDynamics(points);
      expect(enriched.length).toBe(3);
      for (const p of enriched) {
        expect(p.accelLonG).toBeDefined();
        expect(p.accelLatG).toBeDefined();
        expect(p.accelTotalG).toBeDefined();
        expect(p.yawRateDeg).toBeDefined();
        expect(p.slipAngleDeg).toBeDefined();
        expect(p.understeerDeg).toBeDefined();
        expect(p.tireSlipPct).toBeDefined();
        expect(p.wheelLockActive).toBeDefined();
      }
    });
  });
});
