import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createPlaybackCursor, ReplayPlaybackCursorContext, usePlaybackPosition } from '../../../../src/components/replay/inspector/replayPlaybackCursor.js';

describe('playback visual cursor', () => {
  it('updates between samples and clears on stop, ignoring other laps and stale indices', () => {
    const points = [0, 0.2, 1].map(timeSec => ({ x: 0, y: 0, z: 0, timeSec, speedKmh: 100 }));
    const cursor = createPlaybackCursor();
    const { result, rerender } = renderHook(({ index }) => usePlaybackPosition(points, index), {
      initialProps: { index: 0 },
      wrapper: ({ children }) => createElement(ReplayPlaybackCursorContext.Provider, { value: cursor }, children),
    });
    act(() => cursor.publish(points, { index: 0, timeSec: 0.05 }));
    expect(result.current?.fraction).toBeCloseTo(0.25);
    act(() => cursor.publish(points, { index: 0, timeSec: 0.1 }));
    expect(result.current?.fraction).toBeCloseTo(0.5);
    rerender({ index: 1 });
    expect(result.current).toBeNull();
    act(() => cursor.publish([...points], { index: 1, timeSec: 0.6 }));
    expect(result.current).toBeNull();
    act(() => cursor.publish(points, { index: 1, timeSec: 0.6 }));
    expect(result.current?.fraction).toBeCloseTo(0.5);
    act(() => cursor.clear());
    expect(result.current).toBeNull();
  });

  it('preserves continuity when playback advances to the next sample before React rerenders the index', () => {
    const points = [0, 0.2, 1].map(timeSec => ({ x: 0, y: 0, z: 0, timeSec, speedKmh: 100 }));
    const cursor = createPlaybackCursor();
    const { result, rerender } = renderHook(({ index }) => usePlaybackPosition(points, index), {
      initialProps: { index: 0 },
      wrapper: ({ children }) => createElement(ReplayPlaybackCursorContext.Provider, { value: cursor }, children),
    });
    // Playback advances to sample 1 while React component still holds index 0
    act(() => cursor.publish(points, { index: 1, timeSec: 0.4 }));
    expect(result.current).not.toBeNull();
    expect(result.current?.index).toBe(1);
    expect(result.current?.fraction).toBeCloseTo(0.25);
    // Once React catches up and rerenders with index 1, position is maintained seamlessly
    rerender({ index: 1 });
    expect(result.current?.index).toBe(1);
    expect(result.current?.fraction).toBeCloseTo(0.25);
  });
});
