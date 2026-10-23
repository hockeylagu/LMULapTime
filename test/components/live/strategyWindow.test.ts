import { describe, expect, it } from 'vitest';
import { demoLapStart, showsStrategy } from '../../../src/components/live/demo/strategyWindow.js';

/** One sample every 0.1 s from `from` to `to`, at the given pedals. */
const run = (from: number, to: number, throttle: number, brake = 0) =>
  Array.from({ length: Math.round((to - from) * 10) }, (_, i) => ({ t: from + i / 10, throttle, brake }));

describe('showsStrategy', () => {
  it('shows the strip after a second flat out past the line, until the first braking', () => {
    const straight = run(9, 12.5, 1);
    expect(showsStrategy(straight.slice(0, 15), 10)).toBe(false);
    expect(showsStrategy(straight, 10)).toBe(true);
    expect(showsStrategy([...straight, ...run(12.5, 13, 0, 0.8)], 10)).toBe(false);
    expect(showsStrategy([...straight, ...run(12.5, 13, 0, 0.8), ...run(13, 16, 1)], 10)).toBe(false);
  });

  it('keeps it through a lift, and waits for a straight when the lap starts under braking', () => {
    expect(showsStrategy([...run(10, 11.5, 1), ...run(11.5, 12, 0.6)], 10)).toBe(true);
    expect(showsStrategy([...run(10, 11, 0, 0.5), ...run(11, 11.5, 0.5), ...run(11.5, 13, 1)], 10)).toBe(true);
    expect(showsStrategy([...run(10, 11, 0, 0.5), ...run(11, 11.5, 1), ...run(11.5, 12, 0.5)], 10)).toBe(false);
  });
});

describe('demoLapStart', () => {
  it('finds the last crossing, 6 s into each 10 s demo lap', () => {
    expect(demoLapStart(38)).toBe(36);
    expect(demoLapStart(36)).toBe(36);
    expect(demoLapStart(35.9)).toBe(26);
    expect(demoLapStart(2)).toBe(-4);
  });
});
