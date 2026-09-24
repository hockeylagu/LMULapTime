import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTelemetryStripInteraction } from '../../src/components/replay/telemetry/useTelemetryStripInteraction.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

function makePoints(count: number): ReplayTrajectoryPoint[] {
  const pts: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      x: 0,
      y: 0,
      z: i * 10,
      speedKmh: 100,
      timeSec: i * 0.1,
      throttle: 100,
      brake: 0,
      steerYaw: 0,
    });
  }
  return pts;
}

describe('useTelemetryStripInteraction', () => {
  it('steps index backwards and forwards with onStepIndex', () => {
    const points = makePoints(50);
    const onSelectIndex = vi.fn();

    const { result } = renderHook(() =>
      useTelemetryStripInteraction({
        points,
        currentIndex: 25,
        onSelectIndex,
      })
    );

    // Step backward
    act(() => {
      result.current.onStepIndex(-1);
    });
    expect(onSelectIndex).toHaveBeenCalledWith(24);

    // Step forward
    act(() => {
      result.current.onStepIndex(1);
    });
    expect(onSelectIndex).toHaveBeenCalledWith(26);
  });

  it('clamps onStepIndex within points boundary [0, totalPoints - 1]', () => {
    const points = makePoints(10);
    const onSelectIndex = vi.fn();

    const { result } = renderHook(() =>
      useTelemetryStripInteraction({
        points,
        currentIndex: 0,
        onSelectIndex,
      })
    );

    act(() => {
      result.current.onStepIndex(-5);
    });
    expect(onSelectIndex).toHaveBeenCalledWith(0);

    const { result: resultEnd } = renderHook(() =>
      useTelemetryStripInteraction({
        points,
        currentIndex: 9,
        onSelectIndex,
      })
    );

    act(() => {
      resultEnd.current.onStepIndex(5);
    });
    expect(onSelectIndex).toHaveBeenCalledWith(9);
  });

  it('navigates scrub line via ArrowLeft and ArrowRight keyboard events', () => {
    const points = makePoints(50);
    const onSelectIndex = vi.fn();

    renderHook(() =>
      useTelemetryStripInteraction({
        points,
        currentIndex: 20,
        onSelectIndex,
      })
    );

    // Press ArrowLeft
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    expect(onSelectIndex).toHaveBeenCalledWith(19);

    // Press ArrowRight
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(onSelectIndex).toHaveBeenCalledWith(21);

    // Press Shift+ArrowRight (jump by 10)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    });
    expect(onSelectIndex).toHaveBeenCalledWith(30);

    // Press Shift+ArrowLeft (jump back by 10)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    });
    expect(onSelectIndex).toHaveBeenCalledWith(10);
  });

  it('creates a zoom range from a pointer drag and resets it when the data becomes invalid', () => {
    const points = makePoints(20);
    const onSelectIndex = vi.fn();
    const onZoomRangeChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ hookPoints }) => useTelemetryStripInteraction({
        points: hookPoints,
        currentIndex: 0,
        onSelectIndex,
        onZoomRangeChange,
      }),
      { initialProps: { hookPoints: points } }
    );
    result.current.containerRef.current = {
      getBoundingClientRect: () => ({ left: 0, width: 100 }),
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.setInteractionMode('zoom');
    });
    act(() => {
      result.current.handlePointerDown({ target: document.createElement('div'), clientX: 10, pointerId: 1 } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    act(() => {
      result.current.handlePointerMove({ clientX: 90 } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    act(() => {
      result.current.handlePointerUp({ target: document.createElement('div'), pointerId: 1 } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    expect(onZoomRangeChange).toHaveBeenCalledWith({ start: 2, end: 17 });
    expect(onSelectIndex).toHaveBeenCalledWith(2);

    rerender({ hookPoints: makePoints(2) });
    expect(onZoomRangeChange).toHaveBeenLastCalledWith(null);
  });

  it('does not move the scrub line for keyboard events from editable elements', () => {
    const onSelectIndex = vi.fn();
    renderHook(() => useTelemetryStripInteraction({ points: makePoints(10), currentIndex: 5, onSelectIndex }));
    const input = document.createElement('input');

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(onSelectIndex).not.toHaveBeenCalled();
  });
});
