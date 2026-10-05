// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableCullViewBox } from '../../../../src/components/replay/map/useStableCullViewBox.js';
import { nextCullViewBox, parseViewBox } from '../../../../src/components/replay/map/replayMapUtils.js';

describe('nextCullViewBox', () => {
  it('keeps the previous box for small camera moves', () => {
    const prev = '100.000 100.000 200.000 200.000';
    expect(nextCullViewBox(prev, '101.500 100.250 200.000 200.000')).toBe(prev);
    expect(nextCullViewBox(prev, '250.000 -50.000 205.000 205.000')).toBe(prev);
  });

  it('adopts the live box when the view leaves the safe area or the zoom changes', () => {
    const prev = '100 100 200 200';
    expect(nextCullViewBox(prev, '320 100 200 200')).toBe('320 100 200 200');
    expect(nextCullViewBox(prev, '100 -120 200 200')).toBe('100 -120 200 200');
    expect(nextCullViewBox(prev, '90 90 240 240')).toBe('90 90 240 240');
    expect(nextCullViewBox(prev, '130 130 90 90')).toBe('130 130 90 90');
    expect(nextCullViewBox(null, prev)).toBe(prev);
  });

  it('never culls anything on screen: the live view stays inside the kept box margin', () => {
    let kept = '0 0 200 200';
    for (let x = 0; x <= 2000; x += 7) {
      const live = `${x} ${x / 3} 200 200`;
      kept = nextCullViewBox(kept, live);
      const rect = parseViewBox(kept)!;
      expect(rect.minX).toBeLessThanOrEqual(x);
      expect(rect.maxX).toBeGreaterThanOrEqual(x + 200);
      expect(rect.minY).toBeLessThanOrEqual(x / 3);
      expect(rect.maxY).toBeGreaterThanOrEqual(x / 3 + 200);
    }
  });
});

describe('useStableCullViewBox', () => {
  it('returns an unchanged value across follow-mode frames and a new one after a big move', () => {
    const { result, rerender } = renderHook(({ vb, on }) => useStableCullViewBox(vb, on), {
      initialProps: { vb: '100.000 100.000 200.000 200.000', on: true },
    });
    const first = result.current;
    for (let i = 1; i <= 20; i++) rerender({ vb: `${100 + i * 0.7} ${100 + i * 0.3} 200 200`, on: true });
    expect(result.current).toBe(first);
    rerender({ vb: '600 100 200 200', on: true });
    expect(result.current).toBe('600 100 200 200');
  });

  it('is undefined when culling is off', () => {
    const { result } = renderHook(() => useStableCullViewBox('0 0 800 800', false));
    expect(result.current).toBeUndefined();
  });
});
