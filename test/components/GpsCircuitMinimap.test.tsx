import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsCircuitMinimap } from '../../src/components/replay/map/GpsCircuitMinimap.js';

describe('GpsCircuitMinimap', () => {
  const mockBoundaryPathD = 'M 100 100 L 200 100 L 200 200 Z';

  it('returns null if trackBoundaryPathD is empty or undefined', () => {
    const { container } = render(<GpsCircuitMinimap trackBoundaryPathD="" />);
    expect(container.querySelector('[data-testid="gps-circuit-minimap"]')).toBeNull();

    const { container: containerEmpty } = render(<GpsCircuitMinimap />);
    expect(containerEmpty.querySelector('[data-testid="gps-circuit-minimap"]')).toBeNull();
  });

  it('renders track boundary path and car position marker', () => {
    const { container } = render(
      <GpsCircuitMinimap
        trackBoundaryPathD={mockBoundaryPathD}
        currentPos={{ sx: 150, sy: 150 }}
        baselineGhostPos={{ sx: 160, sy: 160 }}
      />
    );

    const minimap = container.querySelector('[data-testid="gps-circuit-minimap"]');
    expect(minimap).toBeInTheDocument();

    // Primary car dot is cyan (#38bdf8)
    const cyanDot = container.querySelector('circle[fill="#38bdf8"]');
    expect(cyanDot).toBeInTheDocument();
    expect(cyanDot).toHaveAttribute('cx', '150');
    expect(cyanDot).toHaveAttribute('cy', '150');

    // Ghost car dot is amber (#f59e0b)
    const amberDot = container.querySelector('circle[fill="#f59e0b"]');
    expect(amberDot).toBeInTheDocument();
    expect(amberDot).toHaveAttribute('cx', '160');
    expect(amberDot).toHaveAttribute('cy', '160');
  });

  it('renders viewport rectangle when zoomed in and hides it at 1x overview', () => {
    // Zoomed in (viewBox smaller than 530x530 threshold)
    const { container, rerender } = render(
      <GpsCircuitMinimap
        trackBoundaryPathD={mockBoundaryPathD}
        currentViewBox="100 100 200 200"
      />
    );

    let rect = container.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('width', '200');
    expect(rect).toHaveAttribute('height', '200');

    // Default overview (>= 530x530)
    rerender(
      <GpsCircuitMinimap
        trackBoundaryPathD={mockBoundaryPathD}
        currentViewBox="0 0 800 800"
      />
    );
    rect = container.querySelector('rect');
    expect(rect).toBeNull();
  });

  it('renders with layoutPathD as track boundary when provided', () => {
    const layoutBoundaryPath = 'M 50 50 L 150 50 L 150 150 Z';

    const { container } = render(
      <GpsCircuitMinimap
        layoutPathD={layoutBoundaryPath}
      />
    );

    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('d', layoutBoundaryPath);
    expect(paths[1]).toHaveAttribute('d', layoutBoundaryPath);
  });

  it('prioritizes trackBoundaryPathD over layoutPathD', () => {
    const layoutPath = 'M 50 50 L 150 50 L 150 150 Z';
    const boundaryPath = 'M 100 100 L 200 100 L 200 200 Z';

    const { container } = render(
      <GpsCircuitMinimap
        layoutPathD={layoutPath}
        trackBoundaryPathD={boundaryPath}
      />
    );

    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths[0]).toHaveAttribute('d', boundaryPath);
    expect(paths[1]).toHaveAttribute('d', boundaryPath);
  });
});
