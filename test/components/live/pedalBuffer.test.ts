import { describe, expect, it, vi } from 'vitest';
import { PedalBuffer } from '../../../src/components/live/pedalBuffer.js';

const sample = (t: number) => ({ t, throttle: 0.5, brake: 0 });

describe('PedalBuffer', () => {
  it.each([5, 60, 120])('retains a complete %s-second history with a bounded sample count', seconds => {
    const buffer = new PedalBuffer(seconds);
    buffer.push(Array.from({ length: 15001 }, (_, i) => sample(i / 100)));
    expect(buffer.windowSeconds).toBe(seconds);
    expect(buffer.visible[0].t).toBeCloseTo(150 - seconds - 1);
    expect(buffer.visible.length).toBeLessThanOrEqual(seconds * 100 + 600);
  });
  it('keeps only the window plus a second and stays bounded', () => {
    const buffer = new PedalBuffer();
    buffer.push(Array.from({ length: 6000 }, (_, i) => sample(i / 100)));
    expect(buffer.latest).toBeCloseTo(59.99);
    expect(buffer.visible[0].t).toBeGreaterThanOrEqual(59.99 - buffer.windowSeconds - 1.01);
    // Keep the entire 30-second trace at 100 Hz, including the extra second for clipping at the left edge.
    expect(buffer.visible[0].t).toBeLessThanOrEqual(29);
    expect(buffer.visible.length).toBeLessThanOrEqual(3600);
  });

  it('ignores repeated times, starts over when the clock jumps back, and notifies subscribers', () => {
    const buffer = new PedalBuffer();
    const listener = vi.fn();
    const unsubscribe = buffer.subscribe(listener);
    buffer.push([sample(10), sample(10.1)]);
    buffer.push([sample(10.1), sample(10.2)]);
    expect(buffer.visible.map((s) => s.t)).toEqual([10, 10.1, 10.2]);
    buffer.push([sample(2)]);
    expect(buffer.visible.map((s) => s.t)).toEqual([2]);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    buffer.clear();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(buffer.latest).toBeNull();
  });
});
