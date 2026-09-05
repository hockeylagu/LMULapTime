import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsTrackMap } from '../../src/components/replay/GpsTrackMap';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('GpsTrackMap', () => {
  const mockPoints: ReplayTrajectoryPoint[] = [
    { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, inPit: false, timeSec: 0.0 },
    { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, inPit: false, timeSec: 0.5 },
    { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, inPit: false, timeSec: 1.0 },
  ];

  const mockBounds = {
    minX: 100,
    maxX: 200,
    minZ: 200,
    maxZ: 240,
    spanX: 100,
    spanZ: 40,
  };

  it('renders SVG track map and start indicator', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    expect(screen.getByText(/START/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SPEED/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/150/i)).toBeInTheDocument();
  });

  it('displays telemetry badge with current point metrics', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={1}
      />
    );

    expect(screen.getByText(/180/i)).toBeInTheDocument();
    expect(screen.getByText(/100%/i)).toBeInTheDocument();
  });

  it('handles empty points gracefully', () => {
    render(
      <GpsTrackMap
        points={[]}
        bounds={{ minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 }}
        currentIndex={0}
      />
    );

    expect(screen.getByText(/No GPS trajectory data available/i)).toBeInTheDocument();
  });

  it('does not draw a connecting line across teleport jumps or garage returns', () => {
    const pointsWithJump: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 105, y: 10, z: 205, rotY: 0.1, speedKmh: 160, throttle: 85, brake: 0, timeSec: 0.2 },
      // Jump 100m to garage:
      { x: 200, y: 10, z: 300, rotY: 0, speedKmh: 0, throttle: 0, brake: 0, isTeleport: true, timeSec: 0.4 },
      { x: 200, y: 10, z: 300, rotY: 0, speedKmh: 0, throttle: 0, brake: 0, inGarage: true, timeSec: 0.6 },
    ];

    const { container } = render(
      <GpsTrackMap
        points={pointsWithJump}
        bounds={{ minX: 100, maxX: 200, minZ: 200, maxZ: 300, spanX: 100, spanZ: 100 }}
        currentIndex={0}
      />
    );

    const lines = container.querySelectorAll('line');
    for (const line of lines) {
      const x1 = parseFloat(line.getAttribute('x1') || '0');
      const x2 = parseFloat(line.getAttribute('x2') || '0');
      const y1 = parseFloat(line.getAttribute('y1') || '0');
      const y2 = parseFloat(line.getAttribute('y2') || '0');
      const lineLen = Math.hypot(x2 - x1, y2 - y1);
      expect(lineLen).toBeLessThan(400);
    }
  });
});
