import { expect, it } from 'vitest';
import { LapDisplayClock } from '../../../../src/components/live/timing/lapDisplayClock.js';

it('ticks between game frames without stepping backward when delayed frames arrive', () => {
  const clock = new LapDisplayClock();
  clock.update(1, 10, 0);
  expect(clock.read(100)).toBeCloseTo(10.1);
  expect(clock.read(210)).toBeCloseTo(10.21);
  clock.update(1, 10.18, 220);
  expect(clock.read(220)).toBeCloseTo(10.22);
  expect(clock.read(300)).toBeCloseTo(10.3);
  clock.update(1, 10.4, 400);
  expect(clock.read(500)).toBeCloseTo(10.5);
});

it('bounds extrapolation (a frozen game freezes it) and resets cleanly for another lap or missing data', () => {
  const clock = new LapDisplayClock();
  clock.update(1, 10, 0);
  expect(clock.read(10_000)).toBeCloseTo(10.25);
  clock.update(1, 10, 10_001);
  expect(clock.read(20_000)).toBeCloseTo(10.25);
  clock.update(1, 10.5, 20_001);
  expect(clock.read(30_000)).toBeCloseTo(10.75);
  clock.update(2, 0.1, 30_001);
  expect(clock.read(30_001)).toBeCloseTo(0.1);
  clock.update(2, null, 30_002);
  expect(clock.read(40_000)).toBeNull();
  expect(clock.advancing(40_000)).toBe(false);
});
