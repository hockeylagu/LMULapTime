import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { GpsTrackSegments } from '../../src/components/replay/map/GpsTrackSegments.js';
import type { ProjectedPoint } from '../../src/components/replay/map/replayMapUtils.js';

describe('GpsTrackSegments', () => {
  const mockPrimaryPoints: ProjectedPoint[] = [
    { sx: 100, sy: 100, idx: 0, x: 10, y: 0, z: 10, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0 },
    { sx: 110, sy: 110, idx: 1, x: 12, y: 0, z: 12, speedKmh: 120, throttle: 100, brake: 0, timeSec: 0.5 },
    { sx: 120, sy: 120, idx: 2, x: 14, y: 0, z: 14, speedKmh: 140, throttle: 0, brake: 80, timeSec: 1.0 },
  ];

  const mockBaselinePoints: ProjectedPoint[] = [
    { sx: 105, sy: 105, idx: 0, x: 11, y: 0, z: 11, speedKmh: 110, throttle: 100, brake: 0, timeSec: 0 },
    { sx: 115, sy: 115, idx: 1, x: 13, y: 0, z: 13, speedKmh: 130, throttle: 100, brake: 0, timeSec: 0.5 },
  ];

  it('renders primary solid lines and triggers onSelectIndex on click', () => {
    const onSelectIndex = vi.fn();
    const { container } = render(
      <svg>
        <GpsTrackSegments
          svgPoints={mockPrimaryPoints}
          colorBy="speed"
          onSelectIndex={onSelectIndex}
        />
      </svg>
    );

    const primaryLines = container.querySelectorAll('line[data-track-line="primary"]');
    expect(primaryLines).toHaveLength(2);

    expect(primaryLines[0]).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(primaryLines[0]).toHaveAttribute('stroke-width', '2');

    fireEvent.click(primaryLines[0]);
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });

  it('renders baseline dashed lines with strokeDasharray="8 6" when baselineSvgPoints are passed', () => {
    const { container } = render(
      <svg>
        <GpsTrackSegments
          svgPoints={mockPrimaryPoints}
          baselineSvgPoints={mockBaselinePoints}
          colorBy="pedal"
          baselineOpacity={0.7}
        />
      </svg>
    );

    const baselineLines = container.querySelectorAll('line[data-track-line="baseline"]');
    expect(baselineLines).toHaveLength(1);

    expect(baselineLines[0]).toHaveAttribute('stroke-dasharray', '8 6');
    expect(baselineLines[0]).toHaveAttribute('stroke-width', '1.8');
    expect(Number(baselineLines[0].getAttribute('stroke-opacity'))).toBeCloseTo(0.9 * 0.7);
  });

  it('filters out teleport points and distant discontinuities', () => {
    const teleportPoints: ProjectedPoint[] = [
      { sx: 100, sy: 100, idx: 0, x: 10, y: 0, z: 10, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0 },
      { sx: 500, sy: 500, idx: 1, x: 200, y: 0, z: 200, isTeleport: true, speedKmh: 0, throttle: 0, brake: 0, timeSec: 1 },
    ];

    const { container } = render(
      <svg>
        <GpsTrackSegments
          svgPoints={teleportPoints}
          colorBy="speed"
        />
      </svg>
    );

    const lines = container.querySelectorAll('line[data-track-line="primary"]');
    expect(lines).toHaveLength(0);
  });
});
