import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsStartFinishLine } from '../../src/components/replay/map/GpsStartFinishLine.js';
import type { ProjectedPoint } from '../../src/components/replay/map/replayMapUtils.js';

describe('GpsStartFinishLine', () => {
  const mockPoints: ProjectedPoint[] = [
    { sx: 100, sy: 200, idx: 0, x: 10, y: 0, z: 20, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0 },
    { sx: 100, sy: 250, idx: 1, x: 10, y: 0, z: 25, speedKmh: 160, throttle: 100, brake: 0, timeSec: 0.5 },
    { sx: 100, sy: 300, idx: 2, x: 10, y: 0, z: 30, speedKmh: 170, throttle: 100, brake: 0, timeSec: 1.0 },
  ];

  it('returns null if points have fewer than 2 items', () => {
    const { container: emptyContainer } = render(
      <svg>
        <GpsStartFinishLine svgPoints={[]} />
      </svg>
    );
    expect(emptyContainer.querySelector('[data-testid="start-finish-line"]')).toBeNull();

    const { container: singleContainer } = render(
      <svg>
        <GpsStartFinishLine svgPoints={[mockPoints[0]]} />
      </svg>
    );
    expect(singleContainer.querySelector('[data-testid="start-finish-line"]')).toBeNull();
  });

  it('renders layered checkered perpendicular line across track coordinates', () => {
    const { container } = render(
      <svg>
        <GpsStartFinishLine svgPoints={mockPoints} />
      </svg>
    );

    const group = container.querySelector('[data-testid="start-finish-line"]');
    expect(group).toBeInTheDocument();

    const lines = group?.querySelectorAll('line');
    expect(lines).toHaveLength(3);

    // Black backing stroke
    expect(lines?.[0].getAttribute('stroke')).toBe('#000000');
    expect(lines?.[0].getAttribute('stroke-width')).toBe('4.5');
    expect(lines?.[0].getAttribute('vector-effect')).toBe('non-scaling-stroke');

    // White solid line
    expect(lines?.[1].getAttribute('stroke')).toBe('#ffffff');
    expect(lines?.[1].getAttribute('stroke-width')).toBe('2.2');
    expect(lines?.[1].getAttribute('vector-effect')).toBe('non-scaling-stroke');

    // Black dashed checkered pattern overlay
    expect(lines?.[2].getAttribute('stroke')).toBe('#000000');
    expect(lines?.[2].getAttribute('stroke-width')).toBe('2.2');
    expect(lines?.[2].getAttribute('stroke-dasharray')).toBe('4 4');
    expect(lines?.[2].getAttribute('vector-effect')).toBe('non-scaling-stroke');

    // Heading is vertical (dx=0, dy=100), so perpendicular line is horizontal (y1 === y2 === 200)
    expect(Number(lines?.[0].getAttribute('y1'))).toBe(200);
    expect(Number(lines?.[0].getAttribute('y2'))).toBe(200);
    const x1 = Number(lines?.[0].getAttribute('x1'));
    const x2 = Number(lines?.[0].getAttribute('x2'));
    expect(Math.min(x1, x2)).toBeLessThan(100);
    expect(Math.max(x1, x2)).toBeGreaterThan(100);

    // Renders START label beside the line
    const labelGroup = container.querySelector('[data-testid="start-finish-label"]');
    expect(labelGroup).toBeInTheDocument();
    expect(labelGroup?.querySelector('text')?.textContent).toBe('START');
  });

  it('scales line length down with zoom so it does not blow up across the screen', () => {
    const { container: zoomedContainer } = render(
      <svg>
        <GpsStartFinishLine svgPoints={mockPoints} zoomLevel={4.5} />
      </svg>
    );

    const group = zoomedContainer.querySelector('[data-testid="start-finish-line"]');
    const line = group?.querySelector('line');
    const x1 = Number(line?.getAttribute('x1'));
    const x2 = Number(line?.getAttribute('x2'));
    const zoomedHalfWidth = Math.abs(x2 - x1) / 2;

    // At 4.5x zoom, halfWidth is scaled (~3.1 SVG units) so on-screen length is bounded (~28px)
    expect(zoomedHalfWidth).toBeLessThan(5);
    expect(zoomedHalfWidth).toBeGreaterThan(2);

    // START label scale adapts to constant physical size
    const label = zoomedContainer.querySelector('[data-testid="start-finish-label"]');
    expect(label?.getAttribute('transform')).toMatch(/scale\(/);
  });

  it('places START label on the side away from colliding corner markers', () => {
    // Heading is vertical from (100, 200) to (100, 300).
    // Normal nx is -1, ny is 0.
    // Side +1 places label at x < 100, side -1 places label at x > 100.
    // If a corner marker is at (80, 200), side +1 would collide!
    const { container } = render(
      <svg>
        <GpsStartFinishLine
          svgPoints={mockPoints}
          cornerMarkers={[{ cornerNumber: 1, sx: 80, sy: 200, idx: 0, actualSx: 100, actualSy: 200 }]}
        />
      </svg>
    );

    const label = container.querySelector('[data-testid="start-finish-label"]');
    const transform = label?.getAttribute('transform')!;
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const labelX = Number(match![1]);

    // To avoid the corner marker at x=80, label placed at x > 100
    expect(labelX).toBeGreaterThan(100);
  });
});
