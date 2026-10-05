import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsCircuitMinimap } from '../../../../src/components/replay/map/GpsCircuitMinimap.js';

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

    // Primary car dot is cyan (#38BDF8)
    const cyanDot = container.querySelector('circle[fill="#38BDF8"]');
    expect(cyanDot).toBeInTheDocument();
    expect(cyanDot).toHaveAttribute('cx', '150');
    expect(cyanDot).toHaveAttribute('cy', '150');

    // Ghost car dot is amber (#F59E0B)
    const amberDot = container.querySelector('circle[fill="#F59E0B"]');
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

  it('calls onPanTo with converted SVG coordinates when clicked', () => {
    let pannedCoords: { x: number; y: number } | null = null;
    const { container } = render(
      <GpsCircuitMinimap
        trackBoundaryPathD={mockBoundaryPathD}
        onPanTo={(x, y) => { pannedCoords = { x, y }; }}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Mock getBoundingClientRect so SVG is 200x200 px on screen
    if (svg) {
      svg.getBoundingClientRect = () => ({
        left: 50,
        top: 50,
        right: 250,
        bottom: 250,
        width: 200,
        height: 200,
        x: 50,
        y: 50,
        toJSON: () => {},
      });
      // Click at clientX = 150 (midpoint X: (150-50)/200 * 800 = 400), clientY = 100 (quarter Y: (100-50)/200 * 800 = 200)
      const event = new MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 100, button: 0 });
      svg.dispatchEvent(event);
    }

    const coords = pannedCoords as { x: number; y: number } | null;
    expect(coords).not.toBeNull();
    expect(coords?.x).toBeCloseTo(400, 0);
    expect(coords?.y).toBeCloseTo(200, 0);
  });

  it('updates onPanTo coordinates when dragging with pointermove', () => {
    let pannedCoords: { x: number; y: number } | null = null;
    const { container } = render(
      <GpsCircuitMinimap
        trackBoundaryPathD={mockBoundaryPathD}
        onPanTo={(x, y) => { pannedCoords = { x, y }; }}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    if (svg) {
      svg.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointermove with buttons: 1 (drag event)
      const moveEvent = new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50, buttons: 1 });
      svg.dispatchEvent(moveEvent);
    }

    const coords = pannedCoords as { x: number; y: number } | null;
    expect(coords).not.toBeNull();
    // 100/200 * 800 = 400, 50/200 * 800 = 200
    expect(coords?.x).toBeCloseTo(400, 0);
    expect(coords?.y).toBeCloseTo(200, 0);
  });

  it('applies larger full-screen size classes when isExpanded is true', () => {
    const { container, rerender } = render(
      <GpsCircuitMinimap trackBoundaryPathD={mockBoundaryPathD} isExpanded={false} />
    );
    const minimap = container.querySelector('[data-testid="gps-circuit-minimap"]');
    expect(minimap).toHaveClass('w-28');

    rerender(
      <GpsCircuitMinimap trackBoundaryPathD={mockBoundaryPathD} isExpanded={true} />
    );
    expect(minimap).toHaveClass('w-48', 'sm:w-56', 'md:w-64');
  });
});
