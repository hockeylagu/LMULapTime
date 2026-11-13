import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, renderHook, act, screen } from '@testing-library/react';
import { PanelResizeHandle, usePanelWidth } from '../../../../src/components/replay/inspector/PanelResizeHandle.js';

/** A 400 px minimum panel showing `width` px, in a 1400 px row: the charts keep 560, so the panel tops out at 840. */
function Harness({width, onResize}: {width: number; onResize: (width: number | null) => void}) {
  const panel = useRef<HTMLDivElement>(null);
  return <div ref={row => { if (row) Object.defineProperty(row, 'clientWidth', {value: 1400, configurable: true}); }}>
    <div ref={node => {
      panel.current = node;
      if (node) Object.defineProperty(node, 'getBoundingClientRect', {value: () => ({width}), configurable: true});
    }} style={{minWidth: '400px'}}>
      <PanelResizeHandle panel={panel} onResize={onResize} onDragging={() => {}} />
    </div>
  </div>;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('panel resize handle', () => {
  it('widens with ArrowLeft, narrows with ArrowRight, and keeps between the minimum and the charts', () => {
    const onResize = vi.fn();
    const {rerender} = render(<Harness width={500} onResize={onResize} />);
    const handle = screen.getByRole('separator', {name: 'Resize map panel'});
    fireEvent.keyDown(handle, {key: 'ArrowLeft'});
    expect(onResize).toHaveBeenLastCalledWith(532);
    fireEvent.keyDown(handle, {key: 'End'});
    expect(onResize).toHaveBeenLastCalledWith(840);
    rerender(<Harness width={410} onResize={onResize} />);
    fireEvent.keyDown(handle, {key: 'ArrowRight'});
    expect(onResize).toHaveBeenLastCalledWith(null); // Back at the minimum: the default width.
  });

  it('drags left to widen, and double-click resets', () => {
    const onResize = vi.fn();
    render(<Harness width={500} onResize={onResize} />);
    const handle = screen.getByRole('separator', {name: 'Resize map panel'});
    Object.defineProperty(handle, 'setPointerCapture', {value: () => {}, configurable: true});
    fireEvent.pointerDown(handle, {button: 0, clientX: 900, pointerId: 1});
    fireEvent.pointerMove(handle, {clientX: 700, pointerId: 1});
    expect(onResize).toHaveBeenLastCalledWith(700);
    fireEvent.pointerUp(handle, {pointerId: 1});
    fireEvent.pointerMove(handle, {clientX: 600, pointerId: 1});
    expect(onResize).toHaveBeenCalledTimes(1); // No drag after release.
    fireEvent.doubleClick(handle);
    expect(onResize).toHaveBeenLastCalledWith(null);
  });
});

describe('panel width', () => {
  it('remembers a width per layout and forgets it on reset', () => {
    const single = renderHook(() => usePanelWidth('single'));
    expect(single.result.current[0]).toBeNull();
    act(() => single.result.current[1](812.4));
    expect(single.result.current[0]).toBe(812);
    expect(renderHook(() => usePanelWidth('single')).result.current[0]).toBe(812);
    expect(renderHook(() => usePanelWidth('double')).result.current[0]).toBeNull();
    act(() => single.result.current[1](null));
    expect(renderHook(() => usePanelWidth('single')).result.current[0]).toBeNull();
  });
});
