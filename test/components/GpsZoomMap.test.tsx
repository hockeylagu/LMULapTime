import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsZoomMap } from '../../src/components/replay/GpsZoomMap';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('GpsZoomMap', () => {
  const mockPoints: ReplayTrajectoryPoint[] = [
    { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, steerYaw: -20, timeSec: 0.0 },
    { x: 105, y: 10, z: 210, rotY: 0.2, speedKmh: 170, throttle: 95, brake: 0, steerYaw: -10, timeSec: 0.2 },
    { x: 110, y: 10, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 0.4 },
    { x: 112, y: 10, z: 230, rotY: 0.8, speedKmh: 120, throttle: 10, brake: 70, steerYaw: 35, timeSec: 0.6 },
  ];

  it('renders close-up apex detail map with zoom controls and distance markers', () => {
    render(
      <GpsZoomMap
        points={mockPoints}
        currentIndex={0}
        colorBy="speed"
      />
    );

    expect(screen.getByText(/Apex Detail/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '40m' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '80m' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '150m' })).toBeInTheDocument();
    expect(screen.getByText('25m')).toBeInTheDocument();
    expect(screen.getByText('50m')).toBeInTheDocument();
  });

  it('switches zoom presets when clicked', () => {
    render(
      <GpsZoomMap
        points={mockPoints}
        currentIndex={0}
        colorBy="speed"
      />
    );

    const btn40 = screen.getByText('40m');
    fireEvent.click(btn40);
    expect(screen.getByText(/Apex Detail \(40m\)/i)).toBeInTheDocument();

    const btn150 = screen.getByText('150m');
    fireEvent.click(btn150);
    expect(screen.getByText(/Apex Detail \(150m\)/i)).toBeInTheDocument();
  });

  it('displays live corner speed and steering telemetry', () => {
    render(
      <GpsZoomMap
        points={mockPoints}
        currentIndex={3}
        colorBy="steering"
      />
    );

    expect(screen.getByText(/120 km\/h/i)).toBeInTheDocument();
    expect(screen.getByText(/35°/i)).toBeInTheDocument();
    expect(screen.getByText(/RIGHT/i)).toBeInTheDocument();
  });

  it('allows zooming in and out independently using + and - buttons', () => {
    render(
      <GpsZoomMap
        points={mockPoints}
        currentIndex={0}
        colorBy="speed"
      />
    );

    // Initial is 80m
    expect(screen.getByText(/Apex Detail \(80m\)/i)).toBeInTheDocument();

    const zoomInBtn = screen.getByRole('button', { name: /Zoom in/i });
    fireEvent.click(zoomInBtn);
    // 80 * 0.8 = 64m
    expect(screen.getByText(/Apex Detail \(64m\)/i)).toBeInTheDocument();

    const zoomOutBtn = screen.getByRole('button', { name: /Zoom out/i });
    fireEvent.click(zoomOutBtn);
    // 64 * 1.25 = 80m
    expect(screen.getByText(/Apex Detail \(80m\)/i)).toBeInTheDocument();
  });

  it('handles empty points gracefully', () => {
    render(
      <GpsZoomMap
        points={[]}
        currentIndex={0}
      />
    );

    expect(screen.getByText(/No GPS telemetry points available/i)).toBeInTheDocument();
  });
});
