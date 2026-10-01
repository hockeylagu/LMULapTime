import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTelemetryStripInteraction } from '../../../../src/components/replay/telemetry/useTelemetryStripInteraction.js';
import { normalizedWheelDelta, zoomDistanceWindow } from '../../../../src/components/replay/telemetry/telemetryViewport.js';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const points = Array.from({ length: 100 }, (_, i) => ({ x: 0, y: 0, z: i * 10, timeSec: i * 0.1, speedKmh: 100 }));
  const select = vi.fn();
  let navigation: ReturnType<typeof useTelemetryStripInteraction>;
  function Harness() {
    navigation = useTelemetryStripInteraction({ points, currentIndex: 50, onSelectIndex: select });
    return <div ref={navigation.containerRef} tabIndex={0} data-testid="chart" data-replay-surface="chart"
      onPointerDown={navigation.handlePointerDown} onPointerMove={navigation.handlePointerMove} onPointerUp={navigation.handlePointerUp}>
      <input aria-label="Typing" /><button>Native control</button>
    </div>;
  }
  render(<Harness />);
  const chart = screen.getByTestId('chart');
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, height: 500 } as DOMRect);
  const flush = () => act(() => frames.splice(0).forEach(callback => callback(16)));
  return { chart, select, flush, navigation: () => navigation };
}

describe('telemetry chart navigation', () => {
  it('anchors zoom to distance and normalizes horizontal, line and page wheel events', () => {
    const window = zoomDistanceWindow({ start: 0, end: 1000 }, 0.5, 0.25, 0, 1000);
    expect(window).toEqual({ start: 125, end: 625 });
    expect(zoomDistanceWindow(window, 10, 0.25, 0, 1000)).toEqual({ start: 0, end: 1000 });
    expect(normalizedWheelDelta({ deltaX: -3, deltaY: 0, deltaMode: 1 }, 500)).toBe(-48);
    expect(normalizedWheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 500)).toBe(500);
  });

  it('coalesces Shift-wheel, preserves the cursor and lets ordinary/browser scrolling through', () => {
    const { chart, flush, navigation, select } = setup();
    expect(fireEvent.wheel(chart, { deltaY: -100, clientX: 250, cancelable: true })).toBe(true);
    expect(fireEvent.wheel(chart, { shiftKey: true, ctrlKey: true, deltaY: -100, cancelable: true })).toBe(true);
    fireEvent.wheel(chart, { shiftKey: true, deltaY: -100, clientX: 250 });
    fireEvent.wheel(chart, { shiftKey: true, deltaY: -100, clientX: 250 });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    flush();
    const nav = navigation();
    const start = nav.cumDists[nav.viewStart]; const end = nav.cumDists[nav.viewEnd];
    expect(Math.abs(start + 0.25 * (end - start) - 247.5)).toBeLessThanOrEqual(10);
    expect(nav.isZoomed).toBe(true);
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(chart, { key: '0' });
    expect(navigation().isZoomed).toBe(false);
  });

  it('pans without seeking and handles keys only in the chart, respecting controls and dialogs', () => {
    const { chart, flush, navigation, select } = setup();
    fireEvent.keyDown(chart, { key: '+' }); flush();
    const before = navigation().viewStart;
    fireEvent.pointerDown(chart, { altKey: true, clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(chart, { clientX: 400, pointerId: 1 }); flush();
    fireEvent.pointerUp(chart, { pointerId: 1 });
    expect(navigation().viewStart).toBeGreaterThan(before);
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Home' });
    fireEvent.keyDown(screen.getByLabelText('Typing'), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Home' });
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(chart, { key: 'Home' }); expect(select).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(chart, { key: 'End' }); expect(select).toHaveBeenLastCalledWith(99);
    fireEvent.keyDown(chart, { key: 'ArrowRight', shiftKey: true }); expect(select).toHaveBeenLastCalledWith(55);
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog); select.mockClear();
    fireEvent.keyDown(chart, { key: 'Home' }); expect(select).not.toHaveBeenCalled();
    dialog.remove();
  });
});
