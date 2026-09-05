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
});
