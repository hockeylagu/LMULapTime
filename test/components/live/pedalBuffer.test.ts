import { describe, expect, it, vi } from 'vitest';
import { PedalBuffer, PEDAL_WINDOW_SECONDS } from '../../../src/components/live/pedalBuffer.js';

const sample = (t: number) => ({ t, throttle: 0.5, brake: 0 });

describe('PedalBuffer', () => {
  it('keeps only the window plus a second and stays bounded', () => {
    const buffer = new PedalBuffer();
    buffer.push(Array.from({ length: 6000 }, (_, i) => sample(i / 100)));
    expect(buffer.latest).toBeCloseTo(59.99);
    expect(buffer.visible[0].t).toBeGreaterThanOrEqual(59.99 - PEDAL_WINDOW_SECONDS - 1.01);
    expect(buffer.visible.length).toBeLessThanOrEqual(2600);
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
