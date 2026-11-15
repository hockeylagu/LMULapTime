import { expect, it } from 'vitest';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { createWheelRoll } from '../../../../../src/components/replay/view3d/cars/wheelMotion.js';

const a: ReplayTrajectoryPoint = {x: 0, y: 1, z: 0, rotY: 0, timeSec: 0};
const b: ReplayTrajectoryPoint = {...a, z: -10, timeSec: 1};
/** Wheels of 1 m radius: the radians rolled equal the metres travelled. */
const createWheelTravel = (points: ReplayTrajectoryPoint[]) => createWheelRoll(points, [1, 1, 1, 1]);

it('matches the displayed car travel at fractional and whole frames even when wheel speed telemetry disagrees', () => {
  const travel = createWheelTravel([{...a, wheelSpeeds: [36, 0, 18, 72]}, {...b, wheelSpeeds: [72, 0, 18, 36]}]);
  for (const corner of [0, 1, 2, 3]) {
    expect(travel(0, 0.5, corner)).toBeCloseTo(5);
    expect(travel(0, 1, corner)).toBeCloseTo(10);
    expect(travel(1, 0, corner)).toBeCloseTo(10);
  }
});

it('rolls backward in reverse and stays still during vertical heave', () => {
  expect(createWheelTravel([a, {...b, z: 10}])(1, 0, 0)).toBeCloseTo(-10);
  expect(createWheelTravel([a, {...b, z: 0, y: 1.05}])(1, 0, 0)).toBe(0);
});

it('rolls each tyre at road speed times one plus its measured slip ratio: locked tyres stop, spinning ones overrun', () => {
  const slip = (ratios: [number | null, number | null, number | null, number | null]) => ({ratios, lockup: [], wheelspin: []});
  const speeds: [number, number, number, number] = [36, 36, 36, 36];
  const travel = createWheelTravel([{...a, wheelSpeeds: speeds, wheelSlip: slip([-1, -0.2, 0.5, null])}, {...b, wheelSpeeds: speeds, wheelSlip: slip([-1, -0.2, 0.5, null])}]);
  expect(travel(1, 0, 0)).toBe(0); expect(travel(1, 0, 1)).toBeCloseTo(8); expect(travel(1, 0, 2)).toBeCloseTo(15); expect(travel(1, 0, 3)).toBeCloseTo(10);
  // Replay-only laps scale the travelled distance the same way, ramping between samples.
  const replay = createWheelTravel([{...a, wheelSlip: slip([0, 0, 0, 0])}, {...b, wheelSlip: slip([-1, -1.5, 1, 0])}]);
  expect(replay(1, 0, 0)).toBeCloseTo(5); expect(replay(1, 0, 1)).toBeCloseTo(5); expect(replay(1, 0, 2)).toBeCloseTo(15);
  // A sample without a ratio holds its neighbour's: a locked tyre stays locked through the gap.
  const gap = createWheelTravel([{...a, wheelSpeeds: speeds, wheelSlip: slip([-1, null, null, null])}, {...b, wheelSpeeds: speeds, wheelSlip: slip([null, -1, null, null])}]);
  expect(gap(1, 0, 0)).toBe(0); expect(gap(1, 0, 1)).toBe(0); expect(gap(1, 0, 2)).toBeCloseTo(10);
});

it('turns each wheel by its recorded angular speed where the samples hold it, whatever the car travels', () => {
  // Stored negative rolling forward: 20 rad/s rolling, a front wheel locking (0), a rear one spinning up, one turning backwards.
  const spin = (speeds: [number, number, number, number]): ReplayTrajectoryPoint['wheelAngularSpeeds'] => speeds.map(speed => -speed) as [number, number, number, number];
  const roll = createWheelRoll([{...a, wheelAngularSpeeds: spin([20, 20, 20, -4])}, {...b, timeSec: 0.5, wheelAngularSpeeds: spin([20, 0, 60, -4])}], [0.3, 0.3, 0.3, 0.3]);
  expect(roll(1, 0, 0)).toBeCloseTo(10); // 20 rad/s for 0.5 s, not the 10 m over the radius
  expect(roll(1, 0, 1)).toBeCloseTo(5); // locking: the mean of 20 and 0
  expect(roll(1, 0, 2)).toBeCloseTo(20);
  expect(roll(1, 0, 3)).toBeCloseTo(-2);
  expect(roll(0, 0.5, 1)).toBeCloseTo(3.75); // 20t - 20t², halfway through the half second
  // Without a speed at both ends, the wheel rolls the travel over its radius.
  const partial = createWheelRoll([{...a, wheelAngularSpeeds: spin([20, 20, 20, 20])}, b], [0.5, 0.5, 0.5, 0.5]);
  expect(partial(1, 0, 0)).toBeCloseTo(20);
});

it('is deterministic on pause, seek and loop, and never rolls through teleports, time gaps or invalid positions', () => {
  const travel = createWheelTravel([a, b, {...b, z: -15, timeSec: 1.5}]);
  const halfway = travel(0, 0.5, 0); travel(2, 0, 0); expect(travel(0, 0.5, 0)).toBe(halfway);
  expect(travel(0, 0, 0)).toBe(0); expect(travel(2, 0, 0)).toBeCloseTo(15);
  for (const patch of [{isTeleport: true}, {timeSec: 3}, {x: 1000}, {z: NaN}, {timeSec: 0}]) {
    const invalid = createWheelTravel([a, {...b, ...patch}]);
    expect(invalid(1, 0, 0)).toBe(0); expect(invalid(0, 0.5, 0)).toBe(0);
  }
});
