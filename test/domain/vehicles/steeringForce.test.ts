import { describe, expect, it } from 'vitest';
import { computeSteeringForce, estimateFfbPct } from '../../../shared/domain/vehicles/steeringForce.js';

const RANGE_DEG = 540;
/** A 100 Hz trace from per-sample wheel angles (steering-wheel degrees, ISO) and FFB (% , ISO). */
function trace(seconds: number, wheelDeg: (t: number) => number, ffbPct: (t: number) => number | undefined, speedKmh = 120) {
  const timeSec = Array.from({ length: Math.round(seconds * 100) + 1 }, (_, i) => i / 100);
  return computeSteeringForce({
    timeSec,
    steer: timeSec.map(t => wheelDeg(t) / (RANGE_DEG / 2)),
    ffbPct: timeSec.map(ffbPct),
    speedKmh: timeSec.map(() => speedKmh),
    steeringWheelRangeDeg: RANGE_DEG,
  });
}
const count = (flags: boolean[]) => flags.filter(Boolean).length;

describe('computeSteeringForce', () => {
  it('follows the FFB, opposite in sign, while the wheel is held at a steady angle', () => {
    const force = trace(1, () => 30, () => -40);
    expect(force.driverForcePct[50]).toBe(40);
    expect(count(force.holdingStill)).toBe(0);
    expect(count(force.passiveCounterSteer)).toBe(0);
  });

  it('marks a force ramp at a fixed angle in a corner as holding still', () => {
    // The hands lighten from 50 % to 25 % over 0.5 s while the wheel stays at 30°.
    const force = trace(2, () => 30, t => -(t < 0.5 ? 50 : t < 1 ? 50 - (t - 0.5) * 50 : 25));
    expect(force.holdingStill[75]).toBe(true);
    expect(force.holdingStill[10]).toBe(false);
    expect(force.holdingStill[180]).toBe(false);
  });

  it('does not mark a force change while the wheel moves, or near the straight ahead', () => {
    const ramp = (t: number) => -(t < 0.5 ? 50 : t < 1 ? 50 - (t - 0.5) * 50 : 25);
    expect(count(trace(2, t => 30 + t * 20, ramp).holdingStill)).toBe(0);
    expect(count(trace(2, () => 5, ramp).holdingStill)).toBe(0);
    expect(count(trace(2, () => 30, ramp, 10).holdingStill)).toBe(0);
  });

  it('marks the hands pushing against the wheel angle as passive counter-steer', () => {
    // The wheel turns right (-20°) for 0.3 s while the hands still push left.
    const force = trace(1, t => (t >= 0.3 && t < 0.6 ? -20 : 20), () => -25);
    expect(force.passiveCounterSteer[45]).toBe(true);
    expect(force.passiveCounterSteer[10]).toBe(false);
    expect(count(trace(1, t => (t >= 0.3 && t < 0.35 ? -20 : 20), () => -25).passiveCounterSteer)).toBe(0);
  });

  it('does not mark a kerb strike', () => {
    // A 40 ms 60 % spike in the FFB at a steady 30° wheel.
    const force = trace(1, () => 30, t => (t >= 0.5 && t < 0.54 ? 20 : -40));
    expect(count(force.holdingStill)).toBe(0);
    expect(count(force.passiveCounterSteer)).toBe(0);
  });

  it('leaves samples without FFB undefined and unmarked', () => {
    const force = trace(1, () => 30, () => undefined);
    expect(force.driverForcePct.every(value => value === undefined)).toBe(true);
    expect(count(force.holdingStill) + count(force.passiveCounterSteer)).toBe(0);
  });
});

describe('estimateFfbPct', () => {
  const fit = { c1: 20, c2: 10 };
  it('opposes the lateral g with the full trail while the front tyres grip, and only c1 once they slide', () => {
    expect(estimateFfbPct(1.5, 0, fit)).toBeCloseTo(-45);
    // 0.05 rad (2.86°) of understeer: the trail term is gone; half of it, half the term.
    expect(estimateFfbPct(1.5, (0.05 * 180) / Math.PI, fit)).toBeCloseTo(-30);
    expect(estimateFfbPct(-1.5, (0.025 * 180) / Math.PI, fit)).toBeCloseTo(37.5);
  });

  it('keeps the full trail in oversteer: a rear slide does not lighten the front', () => {
    expect(estimateFfbPct(1, -5, fit)).toBeCloseTo(-30);
  });
});
