import { expect, it } from 'vitest';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { createWheelTravel } from '../../../../src/components/replay/view3d/wheelMotion.js';

const a: ReplayTrajectoryPoint = {x: 0, y: 1, z: 0, rotY: 0, timeSec: 0};
const b: ReplayTrajectoryPoint = {...a, z: -10, timeSec: 1};

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
  const travel = createWheelTravel([{...a, wheelSpeeds: speeds, liveWheelSlip: slip([-1, -0.2, 0.5, null])}, {...b, wheelSpeeds: speeds, liveWheelSlip: slip([-1, -0.2, 0.5, null])}]);
  expect(travel(1, 0, 0)).toBe(0); expect(travel(1, 0, 1)).toBeCloseTo(8); expect(travel(1, 0, 2)).toBeCloseTo(15); expect(travel(1, 0, 3)).toBeCloseTo(10);
  // Replay-only laps scale the travelled distance the same way, ramping between samples.
  const replay = createWheelTravel([{...a, liveWheelSlip: slip([0, 0, 0, 0])}, {...b, liveWheelSlip: slip([-1, -1.5, 1, 0])}]);
  expect(replay(1, 0, 0)).toBeCloseTo(5); expect(replay(1, 0, 1)).toBeCloseTo(5); expect(replay(1, 0, 2)).toBeCloseTo(15);
  // A sample without a ratio holds its neighbour's: a locked tyre stays locked through the gap.
  const gap = createWheelTravel([{...a, wheelSpeeds: speeds, liveWheelSlip: slip([-1, null, null, null])}, {...b, wheelSpeeds: speeds, liveWheelSlip: slip([null, -1, null, null])}]);
  expect(gap(1, 0, 0)).toBe(0); expect(gap(1, 0, 1)).toBe(0); expect(gap(1, 0, 2)).toBeCloseTo(10);
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
