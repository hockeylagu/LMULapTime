import { describe, expect, it } from 'vitest';
import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { addSteeringForce, ffbPctOf, parseSetupSteering, steerTorqueNmOf } from '../../../server/telemetry/steeringChannels.js';

const setup = (stringValue: string) => JSON.stringify({ VM_STEER_LOCK: { stringValue, value: 5 } });

describe('steering channels', () => {
  it('reads the steering lock in each way the game writes it', () => {
    expect(parseSetupSteering(setup('524deg (18.5deg)'))).toEqual({ steeringWheelRangeDeg: 524, steeringRatio: 14.162 });
    expect(parseSetupSteering(setup('440 (17) deg'))).toEqual({ steeringWheelRangeDeg: 440, steeringRatio: 12.941 });
    expect(parseSetupSteering(setup('516 deg(19.7 )'))).toEqual({ steeringWheelRangeDeg: 516, steeringRatio: 13.096 });
  });

  it('gives no lock without both values', () => {
    expect(parseSetupSteering(undefined)).toBeUndefined();
    expect(parseSetupSteering('not json')).toBeUndefined();
    expect(parseSetupSteering(JSON.stringify({ VM_BRAKE_MIGRATION: { stringValue: '0.0' } }))).toBeUndefined();
    expect(parseSetupSteering(setup('524deg'))).toBeUndefined();
    expect(parseSetupSteering(setup('0 (17) deg'))).toBeUndefined();
  });

  it('stores the column channels ISO, positive left', () => {
    expect(ffbPctOf(25.04)).toBe(-25);
    expect(steerTorqueNmOf(-31.26)).toBe(31.3);
    expect(ffbPctOf(0)).toBe(0);
    expect(ffbPctOf(undefined)).toBeUndefined();
    expect(steerTorqueNmOf(Number.NaN)).toBeUndefined();
  });

  it('adds the driver force and its markers to the full-rate points, flags only where set', () => {
    // 100 Hz at a steady 30° wheel (of 540°), the hands lightening from 50 % to 25 % between 0.5 s and 1 s.
    const points: ReplayTrajectoryPoint[] = Array.from({ length: 201 }, (_, i) => {
      const t = i / 100;
      return { x: 0, y: 0, z: 0, timeSec: t, speedKmh: 120, steerYaw: 30 / 270, ffbPct: -(t < 0.5 ? 50 : t < 1 ? 50 - (t - 0.5) * 50 : 25) };
    });
    addSteeringForce(points, { steeringWheelRangeDeg: 540, steeringRatio: 13.5 });
    expect(points[10]).toMatchObject({ driverForcePct: 50 });
    expect(points[75].steerHoldStill).toBe(true);
    expect('steerHoldStill' in points[10]).toBe(false);
    expect('passiveCounterSteer' in points[75]).toBe(false);
    const withoutFfb = [{ x: 0, y: 0, z: 0, timeSec: 0 }];
    addSteeringForce(withoutFfb, undefined);
    expect(withoutFfb[0]).toEqual({ x: 0, y: 0, z: 0, timeSec: 0 });
  });
});
