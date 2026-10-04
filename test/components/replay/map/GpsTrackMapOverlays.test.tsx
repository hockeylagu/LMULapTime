import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsTrackMap, projectTrajectoryPoints } from '../../../../src/components/replay/index.js';
import { ReplayTrajectoryPoint } from '../../../../server/core/types.js';
import { mockPoints, mockBounds, mockGeometry } from './gpsTrackMapFixtures.js';

describe('GpsTrackMap overlays and geometry', () => {
  it('renders perpendicular pedal marker lines and outside badges when showPedalMarkers is true', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        pedalMarkers={[
          { cornerNumber: 1, distM: 0, kind: 'brake' },
          { cornerNumber: 1, distM: 10, kind: 'throttle' },
        ]}
        showPedalMarkers={true}
      />
    );

    const brakeGroup = container.querySelector('[data-testid="pedal-marker-brake-1"]');
    const throttleGroup = container.querySelector('[data-testid="pedal-marker-throttle-1"]');
    expect(brakeGroup).toBeInTheDocument();
    expect(throttleGroup).toBeInTheDocument();

    // Contains the perpendicular marker lines extending across and outside the racing line
    const lines = brakeGroup?.querySelectorAll('line');
    expect(lines && lines.length >= 2).toBe(true);

    // Verify outer badge text 'B' and 'T'
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('does not render pedal markers when showPedalMarkers is false', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        pedalMarkers={[
          { cornerNumber: 1, distM: 0, kind: 'brake' },
          { cornerNumber: 1, distM: 10, kind: 'throttle' },
        ]}
        showPedalMarkers={false}
      />
    );

    expect(container.querySelector('[data-testid="pedal-marker-brake-1"]')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('renders baseline pedal points with dashed amber styling and staggers overlapping markers', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        pedalMarkers={[
          { cornerNumber: 1, distM: 0, kind: 'brake', isBaseline: false },
          { cornerNumber: 1, distM: 2, kind: 'brake', isBaseline: true },
        ]}
        showPedalMarkers={true}
        baselineOpacity={0.8}
      />
    );

    const primaryBrake = container.querySelector('[data-testid="pedal-marker-brake-1"]');
    const baselineBrake = container.querySelector('[data-testid="pedal-marker-baseline-brake-1"]');
    expect(primaryBrake).toBeInTheDocument();
    expect(baselineBrake).toBeInTheDocument();

    // Baseline brake marker uses red-tinted color (#f87171) and dashed stroke
    const baseLines = baselineBrake?.querySelectorAll('line');
    const dashedLine = Array.from(baseLines || []).find(l => l.getAttribute('stroke-dasharray') === '4 3');
    expect(dashedLine).toBeTruthy();
    expect(dashedLine?.getAttribute('stroke')).toBe('#F87171');

    // Baseline group has opacity from baselineOpacity
    expect(baselineBrake).toHaveAttribute('opacity', '0.8');

    // Staggered connecting guide stem exists because primary and baseline are adjacent (< 22px)
    const guideStem = Array.from(baseLines || []).find(l => l.getAttribute('stroke-dasharray') === '2 2');
    expect(guideStem).toBeTruthy();
  });

  it('renders baseline throttle markers with green-tinted styling (#4ade80) and larger badge', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        baselinePoints={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        pedalMarkers={[
          { cornerNumber: 1, kind: 'throttle', distM: 0 },
          { cornerNumber: 1, kind: 'throttle', distM: 1, isBaseline: true },
        ]}
        showPedalMarkers={true}
      />
    );

    const baselineThrottle = container.querySelector('[data-testid="pedal-marker-baseline-throttle-1"]');
    expect(baselineThrottle).toBeInTheDocument();

    const baseLines = baselineThrottle?.querySelectorAll('line');
    const dashedLine = Array.from(baseLines || []).find(l => l.getAttribute('stroke-dasharray') === '4 3');
    expect(dashedLine).toBeTruthy();
    expect(dashedLine?.getAttribute('stroke')).toBe('#4ADE80');

    // Badge circle is enlarged to r=9.5
    const badgeCircle = baselineThrottle?.querySelector('circle[r="9.5"]');
    expect(badgeCircle).toBeInTheDocument();
    expect(badgeCircle?.getAttribute('stroke')).toBe('#4ADE80');
  });

  it('centers the corner marker text inside the indicator circle', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
      />
    );

    const textEl = screen.getByText('T1');
    expect(textEl).toHaveAttribute('text-anchor', 'middle');
    expect(textEl).toHaveAttribute('dominant-baseline', 'central');
    expect(textEl).toHaveAttribute('x', '0');
    expect(textEl).toHaveAttribute('y', '0');
  });

  it('disperses close chicane corner markers so they do not overlap each other', () => {
    // Two chicane corners closely placed at 0m and 8m
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[
          { cornerNumber: 1, minDistM: 0 },
          { cornerNumber: 2, minDistM: 8 },
        ]}
      />
    );

    const t1Group = screen.getByText('T1').closest('g');
    const t2Group = screen.getByText('T2').closest('g');
    expect(t1Group).not.toBeNull();
    expect(t2Group).not.toBeNull();

    const m1 = t1Group!.getAttribute('transform')!.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const m2 = t2Group!.getAttribute('transform')!.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    expect(m1).not.toBeNull();
    expect(m2).not.toBeNull();

    const dist = Math.hypot(Number(m1![1]) - Number(m2![1]), Number(m1![2]) - Number(m2![2]));
    // Distance between centers must be at least 22px so circles (radius 7.5px) never overlap
    expect(dist).toBeGreaterThanOrEqual(21.9);
  });

  it('renders the fixed circuit minimap in the top-left corner by default and honors showMinimap=false', () => {
    const { rerender } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        trackGeometry={mockGeometry}
      />
    );

    const minimap = screen.getByTestId('gps-circuit-minimap');
    expect(minimap).toBeInTheDocument();
    expect(minimap.className).toContain('absolute');
    expect(minimap.className).toContain('top-2.5');
    expect(minimap.className).toContain('left-2.5');

    rerender(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        trackGeometry={mockGeometry}
        showMinimap={false}
      />
    );

    expect(screen.queryByTestId('gps-circuit-minimap')).not.toBeInTheDocument();
  });

  it('anchors zoom to the mouse cursor position on wheel scroll', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    const mapContainer = container.firstChild as HTMLDivElement;
    const svgEl = container.querySelector('svg.drop-shadow-md');
    expect(svgEl).toBeInTheDocument();

    // Mock container rect as 800x800
    vi.spyOn(mapContainer, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const initialViewBox = svgEl?.getAttribute('viewBox');

    // Scroll wheel UP (zoom in) anchored towards top-left quadrant (clientX: 200, clientY: 200)
    fireEvent.wheel(mapContainer, { deltaY: -100, clientX: 200, clientY: 200 });

    const zoomedViewBox = svgEl?.getAttribute('viewBox');
    expect(zoomedViewBox).not.toEqual(initialViewBox);

    // With cursor at (200, 200) [top-left], the camera shifts left towards the cursor
    const [vx, vy, vw, vh] = (zoomedViewBox || '').split(' ').map(Number);
    expect(vw).toBeCloseTo(266.7, 1);
    expect(vh).toBeCloseTo(266.7, 1);
    expect(vx).toBeLessThan(266.7);
    expect(vy).toBeLessThan(266.7);
    expect(vx).toBeGreaterThan(133.3);
    expect(vy).toBeGreaterThan(133.3);

    // Scroll wheel DOWN (zoom out back to 1x) resets to default centered viewBox
    fireEvent.wheel(mapContainer, { deltaY: 100, clientX: 200, clientY: 200 });
    const resetViewBox = svgEl?.getAttribute('viewBox');
    expect(resetViewBox).toEqual(initialViewBox);
  });

  it('automatically zooms and centers on a corner when selected and resets on deselect', () => {
    const { container, rerender } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        selectedCornerNumber={null}
      />
    );

    const svgEl = container.querySelector('svg.drop-shadow-md');
    expect(svgEl).toBeInTheDocument();
    const defaultViewBox = svgEl?.getAttribute('viewBox');
    expect(screen.getByText('1x')).toBeInTheDocument();

    // Select Corner 1
    rerender(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        selectedCornerNumber={1}
      />
    );

    // Zoom increases to 4.5x
    expect(screen.getByText('4.5x')).toBeInTheDocument();
    const cornerViewBox = container.querySelector('svg.drop-shadow-md')?.getAttribute('viewBox');
    expect(cornerViewBox).not.toEqual(defaultViewBox);
    const [, , vw, vh] = (cornerViewBox || '').split(' ').map(Number);
    expect(vw).toBeLessThan(150);
    expect(vh).toBeLessThan(150);

    // Deselect corner
    rerender(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        selectedCornerNumber={null}
      />
    );

    // Resets back to 1x
    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(svgEl?.getAttribute('viewBox')).toEqual(defaultViewBox);
  });

  it('places corner indicator with safe clearance from both primary and baseline racing lines', () => {
    const baselinePoints: ReplayTrajectoryPoint[] = [
      { x: 115, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, inPit: false, timeSec: 0.0 },
      { x: 165, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, inPit: false, timeSec: 0.5 },
      { x: 215, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, inPit: false, timeSec: 1.0 },
    ];

    render(
      <GpsTrackMap
        points={mockPoints}
        baselinePoints={baselinePoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
      />
    );

    const transform = screen.getByText('T1').closest('g')!.getAttribute('transform')!;
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const badgeX = Number(match![1]);
    const badgeY = Number(match![2]);

    const projectedPrimary = projectTrajectoryPoints(mockPoints, mockBounds, 800, 60);
    const projectedBaseline = projectTrajectoryPoints(baselinePoints, mockBounds, 800, 60);

    const minPrimDist = projectedPrimary.reduce((minD, p) => Math.min(minD, Math.hypot(badgeX - p.sx, badgeY - p.sy)), Infinity);
    const minBaseDist = projectedBaseline.reduce((minD, p) => Math.min(minD, Math.hypot(badgeX - p.sx, badgeY - p.sy)), Infinity);

    // Indicator must not be on top of either primary or baseline racing line (at least 25 SVG units clear)
    expect(minPrimDist).toBeGreaterThanOrEqual(25);
    expect(minBaseDist).toBeGreaterThanOrEqual(25);
  });

  it('ensures corner indicators and nearby pedal marker badges do not overlap', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        pedalMarkers={[{ cornerNumber: 1, kind: 'throttle', distM: 0 }]}
        showPedalMarkers={true}
      />
    );

    const cornerTransform = screen.getByText('T1').closest('g')!.getAttribute('transform')!;
    const cornerMatch = cornerTransform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const cornerX = Number(cornerMatch![1]);
    const cornerY = Number(cornerMatch![2]);

    const pedalGroup = screen.getByTestId('pedal-marker-throttle-1');
    const pedalBadge = pedalGroup.querySelector('circle[r="9.5"]')?.parentElement;
    const pedalTransform = pedalBadge?.getAttribute('transform')!;
    const pedalMatch = pedalTransform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const pedalX = Number(pedalMatch![1]);
    const pedalY = Number(pedalMatch![2]);

    const distance = Math.hypot(cornerX - pedalX, cornerY - pedalY);
    // Badges must maintain adequate separation and never overlap (>= 22px apart)
    expect(distance).toBeGreaterThanOrEqual(22);
  });

  it('renders track boundary road ribbon when trackGeometry is provided', () => {
    const mockGeometry = {
      layoutKey: 'monza_gp',
      circuitId: 'monza',
      layoutId: 'gp',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Autodromo Nazionale Monza',
      lengthM: 5787,
      bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
      leftBoundary: [
        [90, 190],
        [140, 210],
        [190, 230],
      ] as Array<[number, number]>,
      rightBoundary: [
        [110, 210],
        [160, 230],
        [210, 250],
      ] as Array<[number, number]>,
      centerline: [
        [100, 200],
        [150, 220],
        [200, 240],
      ] as Array<[number, number]>,
    };

    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        trackGeometry={mockGeometry}
      />
    );

    const roadRibbon = screen.getByTestId('gps-track-road-ribbon');
    expect(roadRibbon).toBeInTheDocument();

    const paths = roadRibbon.querySelectorAll('path');
    expect(paths).toHaveLength(3); // Fill and both track edges (always drawn); the centerline is optional.
    expect(paths[0].getAttribute('fill')).toBe('#0C121E');
    expect(paths[0].getAttribute('stroke')).toBe('none');
    expect(paths[0].getAttribute('fill-rule')).toBe('evenodd');
  });

  it('renders circuit minimap using track layout geometry when available', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        trackGeometry={mockGeometry}
      />
    );

    const minimap = screen.getByTestId('gps-circuit-minimap');
    expect(minimap).toBeInTheDocument();
    const minimapSvg = minimap.querySelector('svg');
    expect(minimapSvg).toBeInTheDocument();

    const paths = minimap.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    // Track boundary geometry path is closed with 'Z'
    expect(paths[0].getAttribute('d')).toContain('Z');
    // Ensure it is not using the unclosed racing line
    expect(paths[0].getAttribute('d')?.trim().endsWith('Z')).toBe(true);
  });

  it('renders circuit minimap using derived track boundary when centerline is omitted', () => {
    const mockGeometryWithoutCenterline = {
      layoutKey: 'custom_layout',
      circuitId: 'custom',
      layoutId: 'full',
      trackVenue: 'Custom Venue',
      trackCourse: 'Custom Course',
      lengthM: 3000,
      bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
      leftBoundary: [
        [90, 190],
        [140, 210],
      ] as Array<[number, number]>,
      rightBoundary: [
        [110, 210],
        [160, 230],
      ] as Array<[number, number]>,
      centerline: [] as Array<[number, number]>,
    };

    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        trackGeometry={mockGeometryWithoutCenterline}
      />
    );

    const minimap = screen.getByTestId('gps-circuit-minimap');
    expect(minimap).toBeInTheDocument();
    const paths = minimap.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths[0].getAttribute('d')?.trim().endsWith('Z')).toBe(true);
  });

  it('correctly aligns both primary and baseline racing lines with identical projection within the road ribbon', () => {
    const primaryPoints: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 102, y: 10, z: 202, rotY: 0.1, speedKmh: 160, throttle: 80, brake: 0, timeSec: 0.1 },
      { x: 104, y: 10, z: 204, rotY: 0.2, speedKmh: 170, throttle: 80, brake: 0, timeSec: 0.2 },
    ];

    const baselinePoints: ReplayTrajectoryPoint[] = [
      { x: 101, y: 10, z: 201, rotY: 0, speedKmh: 155, throttle: 85, brake: 0, timeSec: 0.0 },
      { x: 103, y: 10, z: 203, rotY: 0.1, speedKmh: 165, throttle: 85, brake: 0, timeSec: 0.1 },
      { x: 105, y: 10, z: 205, rotY: 0.2, speedKmh: 175, throttle: 85, brake: 0, timeSec: 0.2 },
    ];

    const mockGeometry = {
      layoutKey: 'monza_gp',
      circuitId: 'monza',
      layoutId: 'gp',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Autodromo Nazionale Monza',
      lengthM: 5787,
      bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
      leftBoundary: [
        [90, 190],
        [140, 210],
        [190, 230],
      ] as Array<[number, number]>,
      rightBoundary: [
        [110, 210],
        [160, 230],
        [210, 250],
      ] as Array<[number, number]>,
      centerline: [
        [100, 200],
        [150, 220],
        [200, 240],
      ] as Array<[number, number]>,
    };

    const { container } = render(
      <GpsTrackMap
        points={primaryPoints}
        bounds={mockBounds}
        currentIndex={0}
        baselinePoints={baselinePoints}
        trackGeometry={mockGeometry}
      />
    );

    const primaryLines = container.querySelectorAll('[data-track-line="primary"]');
    const baselineLines = container.querySelectorAll('[data-track-line="baseline"]');
    expect(primaryLines.length).toBeGreaterThan(0);
    expect(baselineLines.length).toBeGreaterThan(0);

    expect(screen.getByTestId('gps-track-road-ribbon')).toBeInTheDocument();

    const primLine = primaryLines[0];
    const baseLine = baselineLines[0];

    // Each line is drawn as paths starting "M x y": compare the start x.
    const startX = (el: Element) => parseFloat((el.getAttribute('d') || 'M 0').split(' ')[1]);
    const pX1 = startX(primLine);
    const bX1 = startX(baseLine);

    const svgDiff = Math.abs(bX1 - pX1);
    expect(svgDiff).toBeGreaterThan(0);
    expect(svgDiff).toBeLessThan(30);
  });

  it('aligns baseline pedal points by station with the trajectory track length (no boundary geometry)', () => {
    // Primary along +x with station = x; the baseline starts at station 11 and its odometer
    // reads 5% long, so only station alignment puts its 30 m brake point at x = 30.
    const line = (fromX: number, distScale: number): ReplayTrajectoryPoint[] =>
      Array.from({ length: 101 - fromX }, (_, i) => ({
        x: fromX + i, y: 0, z: 50, stationM: fromX + i, distM: i * distScale, timeSec: i * 0.02, speedKmh: 180,
      }));
    const bounds = { minX: 0, maxX: 100, spanX: 100, minZ: 0, maxZ: 100, spanZ: 100 };
    const { container } = render(
      <GpsTrackMap
        points={line(0, 1)}
        baselinePoints={line(11, 1.05)}
        bounds={bounds}
        currentIndex={0}
        trackLengthM={1000}
        pedalMarkers={[{ cornerNumber: 1, distM: 30, kind: 'brake', isBaseline: true }]}
        showPedalMarkers={true}
      />
    );
    const expectedSx = projectTrajectoryPoints([{ x: 30, y: 0, z: 50 }], bounds, 800, 60)[0].sx;
    const dot = container.querySelector('[data-testid="pedal-marker-baseline-brake-1"] circle[r="2.8"]');
    expect(Number(dot?.getAttribute('cx'))).toBeCloseTo(expectedSx, 0);
  });
});
