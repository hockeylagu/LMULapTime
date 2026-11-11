import { describe, expect, it } from 'vitest';
import { withReplayWheelSlip } from '../../../shared/domain/live/replayWheelSlip.js';
import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';

const RADIUS = 0.34;

/** 50 Hz samples at `v` m/s; `omega(i)` gives the four wheel speeds (rad/s) of sample i; no brake, straight. */
function lap(count: number, v: number, omega: (i: number) => [number, number, number, number]): ReplayTrajectoryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0, y: 0, z: 0, speedKmh: v * 3.6, timeSec: i * 0.02, throttle: 0, brake: 0, steerYaw: 0,
    yawRateDeg: 0, velocityLon: v, velocityLat: 0, wheelAngularSpeeds: omega(i),
  }));
}

describe('replay wheel slip', () => {
  it('measures each wheel against its free-rolling radius and finds a front-left lockup', () => {
    const free = 30 / RADIUS;
    // Samples 100-104 (80 ms) brake with the front-left wheel at half speed, a -50 % ratio.
    const points = lap(200, 30, i => [i >= 100 && i <= 104 ? -free / 2 : -free, -free, -free, -free]);
    for (let i = 100; i <= 104; i++) points[i].brake = 1;
    const slip = withReplayWheelSlip(points);
    for (const ratio of slip[50].wheelSlip!.ratios) expect(ratio).toBeCloseTo(0, 9);
    expect(slip[50].wheelSlip).toMatchObject({ lockup: [], wheelspin: [] });
    expect(slip[102].wheelSlip?.ratios[0]).toBeCloseTo(-0.5, 6);
    expect(slip[102].wheelSlip?.lockup).toEqual(['fl']);
    expect(slip[110].wheelSlip?.lockup).toEqual([]);
  });

  it('finds wheelspin as a positive ratio', () => {
    const free = 30 / RADIUS;
    const slip = withReplayWheelSlip(lap(200, 30, i => [free, free, free, i >= 120 && i <= 125 ? free * 1.3 : free]));
    expect(slip[122].wheelSlip?.ratios[3]).toBeCloseTo(0.3, 6);
    expect(slip[122].wheelSlip?.wheelspin).toEqual(['rr']);
  });

  it('has no ratio below 5 m/s or without enough free rolling for a radius', () => {
    const slow = lap(200, 30, () => [88, 88, 88, 88]).map((p, i) => (i === 10 ? { ...p, velocityLon: 4 } : p));
    expect(withReplayWheelSlip(slow)[10].wheelSlip).toBeUndefined();
    const short = lap(40, 30, () => [88, 88, 88, 88]);
    expect(withReplayWheelSlip(short)).toBe(short);
  });

  it('keeps a lap that already has slip from a live capture, or has no wheel speeds', () => {
    const live = lap(200, 30, () => [88, 88, 88, 88]);
    live[0] = { ...live[0], wheelSlip: { ratios: [0.01, 0, 0, 0], lockup: [], wheelspin: [] } };
    expect(withReplayWheelSlip(live)).toBe(live);
    const older = lap(200, 30, () => [88, 88, 88, 88]).map(p => ({ ...p, wheelAngularSpeeds: undefined }));
    expect(withReplayWheelSlip(older)).toBe(older);
  });
});
