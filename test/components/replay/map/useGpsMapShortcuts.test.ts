// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGpsMapShortcuts } from '../../../../src/components/replay/map/useGpsMapShortcuts.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';

describe('useGpsMapShortcuts', () => {
  const points: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0.0 },
    { x: 10, y: 0, z: 0, speedKmh: 110, throttle: 100, brake: 0, timeSec: 0.2 },
    { x: 20, y: 0, z: 0, speedKmh: 120, throttle: 100, brake: 0, timeSec: 0.5 },
    { x: 30, y: 0, z: 0, speedKmh: 130, throttle: 100, brake: 0, timeSec: 0.8 },
    { x: 40, y: 0, z: 0, speedKmh: 140, throttle: 100, brake: 0, timeSec: 1.2 },
  ];

  it('steps to previous and next sample with ArrowLeft and ArrowRight', () => {
    const onSelectIndex = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 2,
        onSelectIndex,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(onSelectIndex).toHaveBeenCalledWith(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(onSelectIndex).toHaveBeenCalledWith(3);
  });

  it('steps by 0.5s when holding Shift with Arrow keys', () => {
    const onSelectIndex = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 0,
        onSelectIndex,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
      })
    );

    // 0.0 + 0.5 = 0.5s -> index 2
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    expect(onSelectIndex).toHaveBeenCalledWith(2);

    // From index 4 (1.2s), 1.2 - 0.5 = 0.7s -> index 2 (0.5s <= 0.7s)
    const onSelectIndexReverse = vi.fn();
    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 4,
        onSelectIndex: onSelectIndexReverse,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    expect(onSelectIndexReverse).toHaveBeenCalledWith(2);
  });

  it('jumps to start and end of lap with Home and End', () => {
    const onSelectIndex = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 2,
        onSelectIndex,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(onSelectIndex).toHaveBeenCalledWith(0);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(onSelectIndex).toHaveBeenCalledWith(points.length - 1);
  });

  it('handles zoom in, zoom out, and reset zoom with +, -, and 0', () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 0,
        onZoomIn,
        onZoomOut,
        onResetZoom,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    expect(onZoomIn).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
    expect(onZoomOut).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    expect(onResetZoom).toHaveBeenCalledTimes(1);
  });

  it('toggles playback with Space when in full screen', () => {
    const onTogglePlay = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 0,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
        onTogglePlay,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts when typing in input or form elements', () => {
    const onSelectIndex = vi.fn();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderHook(() =>
      useGpsMapShortcuts({
        isExpanded: true,
        containerRef,
        points,
        currentIndex: 2,
        onSelectIndex,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
      })
    );

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(onSelectIndex).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
