import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsSceneMarkers } from '../../src/components/replay/map/GpsSceneMarkers.js';
import type { CornerMarkerPoint, PedalMarkerPoint } from '../../src/components/replay/map/GpsSceneMarkers.js';

describe('GpsSceneMarkers', () => {
  const mockCorner: CornerMarkerPoint = {
    cornerNumber: 1,
    sx: 140,
    sy: 140,
    idx: 10,
    actualSx: 100,
    actualSy: 100,
  };

  const mockPedals: PedalMarkerPoint[] = [
    { cornerNumber: 1, kind: 'brake', sx: 80, sy: 80, nx: 0, ny: 1 },
    { cornerNumber: 1, kind: 'throttle', sx: 110, sy: 110, nx: 0, ny: 1 },
  ];

  it('renders corner marker with world-coordinate tether line and invokes callbacks on click', () => {
    const onSelectCornerNumber = vi.fn();
    const onSelectIndex = vi.fn();

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={[mockCorner]}
          pedalMarkers={[]}
          onSelectCornerNumber={onSelectCornerNumber}
          onSelectIndex={onSelectIndex}
        />
      </svg>
    );

    const cornerGroup = container.querySelector('[data-testid="corner-flag-1"]');
    expect(cornerGroup).toBeInTheDocument();

    // World-coordinate tether line from (m.sx, m.sy) to (m.actualSx, m.actualSy)
    const tether = cornerGroup?.querySelector('line');
    expect(tether).toHaveAttribute('x1', '140');
    expect(tether).toHaveAttribute('y1', '140');
    expect(tether).toHaveAttribute('x2', '100');
    expect(tether).toHaveAttribute('y2', '100');
    expect(tether).toHaveAttribute('vector-effect', 'non-scaling-stroke');

    // Clicking fires selection callbacks
    fireEvent.click(cornerGroup!);
    expect(onSelectCornerNumber).toHaveBeenCalledWith(1);
    expect(onSelectIndex).toHaveBeenCalledWith(10);
  });

  it('renders primary brake in vibrant rose (#f43f5e) and throttle in emerald (#10b981)', () => {
    const { container } = render(
      <svg>
        <GpsSceneMarkers
          pedalMarkers={mockPedals}
        />
      </svg>
    );

    const brakeGroup = container.querySelector('[data-testid="pedal-marker-brake-1"]');
    const throttleGroup = container.querySelector('[data-testid="pedal-marker-throttle-1"]');

    const brakeLine = brakeGroup?.querySelector('line[stroke="#f43f5e"]');
    const throttleLine = throttleGroup?.querySelector('line[stroke="#10b981"]');

    expect(brakeLine).toBeInTheDocument();
    expect(throttleLine).toBeInTheDocument();

    expect(brakeGroup?.querySelector('text')?.textContent).toBe('B');
    expect(throttleGroup?.querySelector('text')?.textContent).toBe('T');
  });

  it('renders baseline pedal markers with red tint (#f87171) for brake and green tint (#4ade80) for throttle with enlarged r=9.5 badge', () => {
    const baselinePedals: PedalMarkerPoint[] = [
      { cornerNumber: 1, kind: 'brake', sx: 80, sy: 80, nx: 0, ny: 1, isBaseline: true },
      { cornerNumber: 1, kind: 'throttle', sx: 110, sy: 110, nx: 0, ny: 1, isBaseline: true },
    ];

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          pedalMarkers={baselinePedals}
        />
      </svg>
    );

    const baseBrake = container.querySelector('[data-testid="pedal-marker-baseline-brake-1"]');
    const baseThrottle = container.querySelector('[data-testid="pedal-marker-baseline-throttle-1"]');

    // Baseline Brake uses soft coral-red tint #f87171 with dashed styling
    const brakeLine = baseBrake?.querySelector('line[stroke="#f87171"][stroke-dasharray="4 3"]');
    expect(brakeLine).toBeInTheDocument();

    // Baseline Throttle uses spring-green tint #4ade80 with dashed styling
    const throttleLine = baseThrottle?.querySelector('line[stroke="#4ade80"][stroke-dasharray="4 3"]');
    expect(throttleLine).toBeInTheDocument();

    // Badges use enlarged r=9.5 and font-size 10.5
    const badgeCircle = baseThrottle?.querySelector('circle[r="9.5"]');
    expect(badgeCircle).toBeInTheDocument();
    expect(badgeCircle).toHaveAttribute('stroke-dasharray', '3.5 2.5');

    const badgeText = baseThrottle?.querySelector('text');
    expect(badgeText).toHaveAttribute('font-size', '10.5');
  });

  it('flips pedal badge to opposite side when default side collides within 34px of a corner marker', () => {
    // Corner marker placed at (100, 126)
    const collidingCorner: CornerMarkerPoint = {
      cornerNumber: 2,
      sx: 100,
      sy: 126,
      idx: 5,
      actualSx: 100,
      actualSy: 100,
    };

    // Pedal marker at (100, 100) with normal nx=0, ny=1.
    // Default tag placement (+ny) puts tag at (100, 100 + 26 = 126), directly on the corner marker (distance 0px)!
    const pedal: PedalMarkerPoint = {
      cornerNumber: 2,
      kind: 'throttle',
      sx: 100,
      sy: 100,
      nx: 0,
      ny: 1,
    };

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={[collidingCorner]}
          pedalMarkers={[pedal]}
        />
      </svg>
    );

    const pedalGroup = container.querySelector('[data-testid="pedal-marker-throttle-2"]');
    const badgeGroup = pedalGroup?.querySelector('circle[r="9.5"]')?.parentElement;
    const transform = badgeGroup?.getAttribute('transform')!;
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const tagY = Number(match![2]);

    // Because default side (+26) collided with corner marker at y=126, it flipped to -ny (y < 100)
    expect(tagY).toBeLessThan(100);
  });

  it('adapts corner marker proximity when zoomed so it stays close to the corner without drifting far away', () => {
    // Corner with natural world offset at distance 50 from apex (100, 100) -> (150, 100)
    const corner: CornerMarkerPoint = {
      cornerNumber: 3,
      sx: 150,
      sy: 100,
      idx: 8,
      actualSx: 100,
      actualSy: 100,
    };

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={[corner]}
          pedalMarkers={[]}
          zoomLevel={4.5}
        />
      </svg>
    );

    const cornerGroup = container.querySelector('[data-testid="corner-flag-3"]');
    const tether = cornerGroup?.querySelector('line');
    const x1 = Number(tether?.getAttribute('x1'));

    // Without adaptive proximity, x1 would be 150 (dist = 50 world units = 225 screen px at 4.5x).
    // With adaptive proximity, on screen it stays around ~54px, so in SVG units x1 is ~112 (dist ~12 SVG units).
    expect(x1).toBeLessThan(130);
    expect(x1).toBeGreaterThan(105);
  });

  it('dims non-selected corners instead of removing them when a corner is selected', () => {
    const onSelectCornerNumber = vi.fn();
    const onSelectIndex = vi.fn();
    const corners: CornerMarkerPoint[] = [
      { cornerNumber: 1, sx: 50, sy: 50, idx: 5, actualSx: 50, actualSy: 50 },
      { cornerNumber: 2, sx: 100, sy: 100, idx: 10, actualSx: 100, actualSy: 100 },
    ];
    const pedals: PedalMarkerPoint[] = [
      { cornerNumber: 1, kind: 'brake', sx: 45, sy: 45 },
      { cornerNumber: 2, kind: 'brake', sx: 95, sy: 95 },
    ];

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={corners}
          pedalMarkers={pedals}
          selectedCornerNumber={2}
          dimNonSelectedTrack={true}
          onSelectCornerNumber={onSelectCornerNumber}
          onSelectIndex={onSelectIndex}
        />
      </svg>
    );

    // Selected corner 2 has full opacity 1, non-selected corner 1 is dimmed (opacity 0.6) but not removed
    const corner1 = container.querySelector('[data-testid="corner-flag-1"]');
    const corner2 = container.querySelector('[data-testid="corner-flag-2"]');
    expect(corner1).toBeInTheDocument();
    expect(corner2).toBeInTheDocument();
    expect(corner1).toHaveAttribute('opacity', '0.6');
    expect(corner2).toHaveAttribute('opacity', '1');
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();

    // Dimmed corner is still clickable
    fireEvent.click(corner1!);
    expect(onSelectCornerNumber).toHaveBeenCalledWith(1);
    expect(onSelectIndex).toHaveBeenCalledWith(5);

    // Pedal markers for non-selected corners remain filtered to keep corner analysis uncluttered
    expect(container.querySelector('[data-testid="pedal-marker-brake-2"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="pedal-marker-brake-1"]')).not.toBeInTheDocument();
  });

  it('dims non-selected apex markers when showCornerFlags is false and a corner is selected', () => {
    const corners: CornerMarkerPoint[] = [
      { cornerNumber: 1, sx: 50, sy: 50, idx: 5, actualSx: 50, actualSy: 50 },
      { cornerNumber: 2, sx: 100, sy: 100, idx: 10, actualSx: 100, actualSy: 100 },
    ];

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={corners}
          pedalMarkers={[]}
          showCornerFlags={false}
          selectedCornerNumber={2}
        />
      </svg>
    );

    const apex1 = container.querySelector('[data-testid="apex-marker-1"]');
    const apex2 = container.querySelector('[data-testid="apex-marker-2"]');
    expect(apex1).toBeInTheDocument();
    expect(apex2).toBeInTheDocument();
    expect(apex1).toHaveAttribute('opacity', '0.6');
    expect(apex2).toHaveAttribute('opacity', '1');
  });

  it('renders dedicated APEX identification badge and guide line when showCornerFlags is false', () => {
    const corner: CornerMarkerPoint = {
      cornerNumber: 4,
      sx: 120,
      sy: 80,
      idx: 12,
      actualSx: 100,
      actualSy: 100,
    };

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={[corner]}
          pedalMarkers={[]}
          showCornerFlags={false}
        />
      </svg>
    );

    // Should NOT render balloon flag with T4
    expect(container.querySelector('[data-testid="corner-flag-4"]')).not.toBeInTheDocument();
    expect(screen.queryByText('T4')).not.toBeInTheDocument();

    // Should render APEX identification marker
    const apexGroup = container.querySelector('[data-testid="apex-marker-4"]');
    expect(apexGroup).toBeInTheDocument();
    expect(screen.getByText('APEX')).toBeInTheDocument();

    // Should have apex circle on track scaled to constant screen size (zoom agnostic)
    const apexCircle = apexGroup?.querySelector('circle[fill="#f43f5e"]');
    expect(apexCircle).toBeInTheDocument();
    expect(apexCircle?.parentElement).toHaveAttribute('transform', expect.stringContaining('scale(1)'));
    const tether = apexGroup?.querySelector('line[stroke-dasharray="2.5 2"]');
    expect(tether).toBeInTheDocument();
  });

  it('renders zoom-agnostic apex red dot scaled by markerScale', () => {
    const corner: CornerMarkerPoint = {
      cornerNumber: 3,
      sx: 100,
      sy: 100,
      idx: 5,
      actualSx: 100,
      actualSy: 100,
    };

    const { container } = render(
      <svg>
        <GpsSceneMarkers
          cornerMarkers={[corner]}
          pedalMarkers={[]}
          showCornerFlags={false}
          markerScale={0.25}
        />
      </svg>
    );

    const apexGroup = container.querySelector('[data-testid="apex-marker-3"]');
    const apexCircle = apexGroup?.querySelector('circle[fill="#f43f5e"]');
    expect(apexCircle?.parentElement).toHaveAttribute('transform', 'translate(100, 100) scale(0.25)');
  });
});


