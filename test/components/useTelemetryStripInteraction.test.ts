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
});
