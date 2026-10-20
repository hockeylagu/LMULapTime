import { afterEach, describe, expect, it, vi } from 'vitest';
import { startYieldSlice } from '../../../server/core/yieldSlice.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('startYieldSlice', () => {
  it('reports a used slice once 5 ms have passed, then starts a new slice', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const sliceUsed = startYieldSlice();
    clock = 4;
    expect(sliceUsed()).toBe(false);
    clock = 5;
    expect(sliceUsed()).toBe(true);
    clock = 9;
    expect(sliceUsed()).toBe(false);
    clock = 10;
    expect(sliceUsed()).toBe(true);
  });
});
