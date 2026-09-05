import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryStripCharts } from '../../src/components/replay/TelemetryStripCharts';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('TelemetryStripCharts', () => {
  const mockPoints: ReplayTrajectoryPoint[] = [
    { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, steerYaw: -45, timeSec: 0.0 },
    { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 0.5 },
    { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, steerYaw: 30, timeSec: 1.0 },
  ];

  it('renders all 5 channels: Speed, Throttle, Brake, Steering, Gear', () => {
    render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={0}
        onSelectIndex={vi.fn()}
      />
    );

    expect(screen.getByText(/SPEED/i)).toBeInTheDocument();
    expect(screen.getByText(/THROTTLE/i)).toBeInTheDocument();
    expect(screen.getByText(/BRAKE/i)).toBeInTheDocument();
    expect(screen.getByText(/STEERING/i)).toBeInTheDocument();
    expect(screen.getAllByText(/GEAR/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays active point metrics in telemetry badges', () => {
    render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={0}
        onSelectIndex={vi.fn()}
      />
    );

    // Speed 150 km/h
    expect(screen.getAllByText(/150/i).length).toBeGreaterThanOrEqual(1);
    // Steering 45 deg Left
    expect(screen.getAllByText(/45°/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/LEFT/i).length).toBeGreaterThanOrEqual(1);
  });

  it('triggers onSelectIndex when clicked or scrubbed', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={0}
        onSelectIndex={handleSelect}
      />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeTruthy();

    // Mock bounding rect
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      bottom: 500,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(root, { clientX: 500, clientY: 50 });
    expect(handleSelect).toHaveBeenCalledWith(1);
  });

  it('renders live value tags elevated with z-50 so they are not underneath the scrubber line', () => {
    const { container } = render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={1}
        onSelectIndex={vi.fn()}
      />
    );

    const z50Badges = container.querySelectorAll('.z-50');
    // All 5 channels (speed, throttle, brake, steering, gear) must have z-50 live tags
    expect(z50Badges.length).toBe(5);
    z50Badges.forEach(badge => {
      // Must have offset class (ml-2.5) to stay clear of the vertical scrubber line
      expect(badge.className).toContain('z-50');
      expect(badge.className).toContain('ml-2.5');
    });
  });

  it('renders empty message when no points provided', () => {
    render(
      <TelemetryStripCharts
        points={[]}
        currentIndex={0}
        onSelectIndex={vi.fn()}
      />
    );

    expect(screen.getByText(/No telemetry frames recorded for this car/i)).toBeInTheDocument();
  });

  it('renders dedicated TIME DELTA channel and baseline overlays when baselinePoints are supplied', () => {
    const mockBaselinePoints: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 140, throttle: 70, brake: 0, steerYaw: -40, timeSec: 0.0 },
      { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 170, throttle: 90, brake: 0, steerYaw: 0, timeSec: 0.6 },
      { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 80, throttle: 0, brake: 80, steerYaw: 25, timeSec: 1.2 },
    ];

    const { container } = render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={1}
        onSelectIndex={vi.fn()}
        baselinePoints={mockBaselinePoints}
        baselineLabel="Lap 2 (Best)"
        baselineLapNumber={2}
      />
    );

    // TIME DELTA channel header should be rendered
    expect(screen.getByText(/TIME DELTA \(Δt\)/i)).toBeInTheDocument();

    // Comparison legend should display Primary and Baseline label
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Lap 2 (Best)')).toBeInTheDocument();

    // Baseline live badges should be present in DOM (showing 'B: 170' for baseline speed at idx 1)
    expect(screen.getByText(/B: 170/i)).toBeInTheDocument();

    // Dashed amber curves should be rendered in the SVGs
    const dashedLines = container.querySelectorAll('path[stroke="#f59e0b"]');
    expect(dashedLines.length).toBeGreaterThanOrEqual(4);
  });

  it('preserves clean Δt scale without boundary glitch when laps have large session time offsets', () => {
    // Primary lap starting at session time 1800.0s (minute 30)
    const offsetPrimary: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1800.0 },
      { x: 120, y: 10, z: 220, rotY: 0, speedKmh: 160, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1800.5 },
      { x: 140, y: 10, z: 240, rotY: 0, speedKmh: 170, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1801.0 },
    ];

    // Baseline lap starting at session time 7200.0s (minute 120)
    const offsetBaseline: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 145, throttle: 75, brake: 0, steerYaw: 0, timeSec: 7200.0 },
      { x: 120, y: 10, z: 220, rotY: 0, speedKmh: 155, throttle: 90, brake: 0, steerYaw: 0, timeSec: 7200.6 },
      { x: 140, y: 10, z: 240, rotY: 0, speedKmh: 165, throttle: 90, brake: 0, steerYaw: 0, timeSec: 7201.2 },
    ];

    render(
      <TelemetryStripCharts
        points={offsetPrimary}
        currentIndex={0}
        onSelectIndex={vi.fn()}
        baselinePoints={offsetBaseline}
        baselineLabel="Lap 5"
      />
    );

    // Delta time scale should NOT be skewed to 8.0s by session timestamps
    // Grid lines should show realistic scale (e.g. -1.0s or similar, NOT distorted by 5400s difference)
    expect(screen.getByText(/-1\.0s \(Faster\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.0s \(Slower\)/i)).toBeInTheDocument();
  });

  it('allows toggling between Scrub and Zoom Range interaction modes', () => {
    render(
      <TelemetryStripCharts
        points={mockPoints}
        currentIndex={0}
        onSelectIndex={vi.fn()}
      />
    );

    const scrubBtn = screen.getByRole('button', { name: /scrub/i });
    const zoomBtn = screen.getByRole('button', { name: /zoom range/i });

    expect(scrubBtn).toBeInTheDocument();
    expect(zoomBtn).toBeInTheDocument();

    // Default is scrub mode
    expect(scrubBtn.className).toContain('bg-sky-500');

    // Switch to Zoom Range
    fireEvent.click(zoomBtn);
    expect(zoomBtn.className).toContain('bg-sky-500');
    expect(scrubBtn.className).not.toContain('bg-sky-500');

    // Switch back to Scrub
    fireEvent.click(scrubBtn);
    expect(scrubBtn.className).toContain('bg-sky-500');
  });

  it('allows selecting a range via drag in Zoom mode and zooming the charts', () => {
    const longerPoints: ReplayTrajectoryPoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: 100 + i * 10,
      y: 10,
      z: 200 + i * 10,
      rotY: 0,
      speedKmh: 100 + i * 5,
      throttle: 50,
      brake: 0,
      steerYaw: 0,
      timeSec: i * 0.1,
    }));

    const handleZoomChange = vi.fn();
    const handleSelectIndex = vi.fn();

    const { container } = render(
      <TelemetryStripCharts
        points={longerPoints}
        currentIndex={0}
        onSelectIndex={handleSelectIndex}
        onZoomRangeChange={handleZoomChange}
      />
    );

    const root = container.firstElementChild as HTMLElement;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      bottom: 500,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Switch to Zoom mode
    const zoomBtn = screen.getByRole('button', { name: /zoom range/i });
    fireEvent.click(zoomBtn);

    // Drag from 20% (x=200) to 80% (x=800)
    fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(root, { clientX: 800, clientY: 100 });
    fireEvent.pointerUp(root, { clientX: 800, clientY: 100 });

    // Should have triggered onZoomRangeChange with zoomed window
    expect(handleZoomChange).toHaveBeenCalled();
    const zoomedCall = handleZoomChange.mock.calls[0][0];
    expect(zoomedCall).not.toBeNull();
    expect(zoomedCall.start).toBeGreaterThanOrEqual(3);
    expect(zoomedCall.end).toBeLessThanOrEqual(16);

    // Should display Zoomed indicator and Reset Lap button
    expect(screen.getByText(/Zoomed:/i)).toBeInTheDocument();
    const resetBtn = screen.getByRole('button', { name: /✕ Reset Lap/i });
    expect(resetBtn).toBeInTheDocument();

    // Clicking Reset Lap resets the zoom
    fireEvent.click(resetBtn);
    expect(screen.queryByText(/Zoomed:/i)).not.toBeInTheDocument();
  });

  it('resets zoom back to whole lap when double-clicking anywhere on the charts', () => {
    const longerPoints: ReplayTrajectoryPoint[] = Array.from({ length: 15 }, (_, i) => ({
      x: 100 + i * 10,
      y: 10,
      z: 200,
      rotY: 0,
      speedKmh: 120,
      throttle: 80,
      brake: 0,
      steerYaw: 0,
      timeSec: i * 0.1,
    }));

    const handleZoomChange = vi.fn();
    const { container } = render(
      <TelemetryStripCharts
        points={longerPoints}
        currentIndex={5}
        onSelectIndex={vi.fn()}
        onZoomRangeChange={handleZoomChange}
      />
    );

    const root = container.firstElementChild as HTMLElement;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      bottom: 500,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Zoom in using Shift+drag in Scrub mode
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(root, { clientX: 700, clientY: 100 });
    fireEvent.pointerUp(root, { clientX: 700, clientY: 100 });

    expect(screen.getByText(/Zoomed:/i)).toBeInTheDocument();

    // Double-click to reset
    fireEvent.doubleClick(root);
    expect(screen.queryByText(/Zoomed:/i)).not.toBeInTheDocument();
  });

  it('supports controlled zoomRange prop', () => {
    const longerPoints: ReplayTrajectoryPoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: 100 + i * 10,
      y: 10,
      z: 200,
      rotY: 0,
      speedKmh: 120 + i * 2,
      throttle: 80,
      brake: 0,
      steerYaw: 0,
      timeSec: i * 0.1,
    }));

    const { rerender } = render(
      <TelemetryStripCharts
        points={longerPoints}
        currentIndex={4}
        onSelectIndex={vi.fn()}
        zoomRange={{ start: 4, end: 10 }}
      />
    );

    expect(screen.getByText(/Zoomed: Frames 5–11/i)).toBeInTheDocument();

    // Rerender with zoomRange = null resets the zoom banner
    rerender(
      <TelemetryStripCharts
        points={longerPoints}
        currentIndex={4}
        onSelectIndex={vi.fn()}
        zoomRange={null}
      />
    );

    expect(screen.queryByText(/Zoomed:/i)).not.toBeInTheDocument();
  });
});

