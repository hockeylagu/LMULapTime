import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GpsMapTelemetryDock } from '../../../../../src/components/replay/map/telemetry/GpsMapTelemetryDock.js';
import { GpsTrackMapScene } from '../../../../../src/components/replay/map/scene/GpsTrackMapScene.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import type { ComponentProps } from 'react';
import { useStoredToggle } from '../../../../../src/components/replay/map/useStoredToggle.js';
import { chooseValue, selectedValue } from '../../../../helpers/selectControl.js';

const points: ReplayTrajectoryPoint[] = Array.from({ length: 10 }, (_, index) => ({
  x: index * 20, y: 0, z: index * 10, timeSec: index, speedKmh: 100 + index,
  throttle: index * 10, brake: 100 - index * 10,
}));

/** The scene owns the trace's hidden state (shared with the T shortcut); mirror that here. */
function Dock(props: Omit<ComponentProps<typeof GpsMapTelemetryDock>, 'traceHidden' | 'onToggleTrace'>) {
  const [hidden, toggle] = useStoredToggle('lmu-map-trace-collapsed-v1', false);
  return <GpsMapTelemetryDock {...props} traceHidden={hidden} onToggleTrace={toggle} />;
}

describe('fullscreen map telemetry', () => {
  beforeEach(() => localStorage.clear());

  it('keeps combined pedals in one chart and remembers the selection and collapsed state', () => {
    const props = { points, currentIndex: 0, onSelectIndex: vi.fn(), hud: <span>Driving readouts</span> };
    const first = render(<Dock {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Throttle + Brake' }));
    expect(screen.getByLabelText('Combined throttle and brake traces')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Fullscreen telemetry chart')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hide telemetry trace' }));
    expect(screen.getByText('Driving readouts')).toBeVisible();
    first.unmount();
    render(<Dock {...props} />);
    expect(screen.getByRole('button', { name: 'Throttle + Brake' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Show telemetry trace' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Show telemetry trace' }));
    expect(screen.getByLabelText('Fullscreen telemetry chart')).toBeVisible();
  });

  it('offers delta only for a comparison and restores that choice when a baseline returns', () => {
    const props = { points, currentIndex: 0, onSelectIndex: vi.fn() };
    const { rerender } = render(<Dock {...props} baselinePoints={points} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delta' }));
    expect(screen.getByRole('button', { name: 'Delta' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<Dock {...props} />);
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Delta' })).toBeDisabled();
    rerender(<Dock {...props} baselinePoints={points} />);
    expect(screen.getByRole('button', { name: 'Delta' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers remaining channels through More and returns to quick traces without moving the cursor', () => {
    const onSelectIndex = vi.fn();
    const props = { points, currentIndex: 4, onSelectIndex };
    const first = render(<Dock {...props} />);
    const more = screen.getByRole('combobox', { name: 'More telemetry channels' });
    expect(more).toHaveTextContent('More');
    chooseValue(more, 'rpm');
    expect(selectedValue(more)).toBe('rpm');
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveAttribute('aria-pressed', 'false');
    first.unmount();
    render(<Dock {...props} />);
    expect(selectedValue(screen.getByRole('combobox', { name: 'More telemetry channels' }))).toBe('rpm');
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    expect(screen.getByLabelText('Speed trace')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'More telemetry channels' })).toHaveTextContent('More');
    expect(onSelectIndex).not.toHaveBeenCalled();
  });

  it('scrubs by distance without bubbling gestures into the map', () => {
    const onSelectIndex = vi.fn();
    const onMapPointerDown = vi.fn();
    render(<div onPointerDown={onMapPointerDown}><Dock points={points}
      currentIndex={0} onSelectIndex={onSelectIndex} /></div>);
    const chart = screen.getByLabelText('Fullscreen telemetry chart');
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, height: 84,
      right: 1000, top: 0, bottom: 84, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(chart, { button: 0, clientX: 500, pointerId: 1 });
    expect(onSelectIndex).toHaveBeenCalledWith(4);
    expect(onMapPointerDown).not.toHaveBeenCalled();
    fireEvent.pointerUp(chart, { pointerId: 1 });
  });

  it('shows the reset only after selecting a zoom range', () => {
    const onSelectIndex = vi.fn();
    render(<Dock points={points} currentIndex={0} onSelectIndex={onSelectIndex} />);
    expect(screen.queryByRole('button', { name: 'Full lap' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom range' }));
    const chart = screen.getByLabelText('Fullscreen telemetry chart');
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000, height: 112,
      right: 1000, top: 0, bottom: 112, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(chart, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(chart, { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: 800, pointerId: 1 });
    expect(screen.getByRole('button', { name: 'Zoom range' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Full lap' })).toBeInTheDocument();
    onSelectIndex.mockClear();
    fireEvent.pointerDown(chart, { button: 0, clientX: 500, pointerId: 2 });
    expect(onSelectIndex).toHaveBeenCalledWith(4);
    fireEvent.pointerUp(chart, { pointerId: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Full lap' }));
    expect(screen.queryByRole('button', { name: 'Full lap' })).not.toBeInTheDocument();
  });

  it('always draws sector lines inside the lap, ignoring the former hidden preference', () => {
    localStorage.setItem('lmu-map-trace-sectors-v1', 'false');
    const props = { points, currentIndex: 0, onSelectIndex: vi.fn(), sectors: { s1Frame: 3, s2Frame: 6 } };
    const first = render(<Dock {...props} />);
    expect(screen.getByTestId('trace-sector-S1')).toHaveTextContent('S1');
    expect(screen.getByTestId('trace-sector-S2')).toHaveTextContent('S2');
    expect(screen.queryByRole('button', { name: 'Sectors' })).not.toBeInTheDocument();
    first.unmount();
    render(<Dock {...props} />);
    expect(screen.getByTestId('trace-sector-S1')).toBeVisible();
    expect(screen.getByTestId('trace-sector-S2')).toBeVisible();
  });

  it('offers no sector toggle without sector data', () => {
    render(<Dock points={points} currentIndex={0} onSelectIndex={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Sectors' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-sector-S1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-sector-S2')).not.toBeInTheDocument();
  });

  it('shows the dock only when expanded, handles chart keys once, and exits on Escape', () => {
    const onSelectIndex = vi.fn();
    render(<GpsTrackMapScene points={points} bounds={{ minX: 0, maxX: 180, minZ: 0, maxZ: 90, spanX: 180, spanZ: 90 }}
      currentIndex={0} onSelectIndex={onSelectIndex} />);
    expect(screen.queryByLabelText('Fullscreen telemetry')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Full screen map' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));
    const chart = screen.getByLabelText('Fullscreen telemetry chart');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(onSelectIndex).toHaveBeenCalledTimes(1);
    expect(onSelectIndex).toHaveBeenCalledWith(1);
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(screen.queryByLabelText('Fullscreen telemetry')).not.toBeInTheDocument();
    const map = screen.getByLabelText('Track map');
    expect(map).toHaveFocus();
    // Focus on the map, so M re-expands it; T then hides and shows the trace.
    fireEvent.keyDown(map, { key: 'm' });
    expect(screen.getByLabelText('Fullscreen telemetry')).toBeInTheDocument();
    fireEvent.keyDown(map, { key: 't' });
    expect(screen.getByRole('button', { name: 'Show telemetry trace' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(screen.getByLabelText('Fullscreen telemetry chart'), { key: 'T' });
    expect(screen.getByRole('button', { name: 'Hide telemetry trace' })).toHaveAttribute('aria-expanded', 'true');
  });
});
