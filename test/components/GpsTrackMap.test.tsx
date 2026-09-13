import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsTrackMap, projectTrajectoryPoints } from '../../src/components/replay/index.js';
import { computeCumulativeDistances } from '../../src/utils/replayComparison';
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
    ] as Array<[number, number]>,
    rightBoundary: [
      [110, 210],
      [160, 230],
    ] as Array<[number, number]>,
    centerline: [
      [100, 200],
      [150, 220],
      [200, 240],
    ] as Array<[number, number]>,
  };

  it('renders SVG track map and perpendicular start/finish line with start label beside the line', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    expect(container.querySelector('[data-testid="start-finish-line"]')).toBeInTheDocument();
    expect(screen.getByText('START')).toBeInTheDocument();
    expect(screen.getByText(/Pedal:/i)).toBeInTheDocument();
  });

  it('keeps the heatmap legend on the circuit map and does not render speed, throttle, or brake overlays', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={1}
        colorBy="speed"
      />
    );

    // Legend is present
    expect(screen.getByText(/Speed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Apex/i)).toBeInTheDocument();

    // No floating speed/throttle/brake telemetry overlay
    expect(screen.queryByText(/THR:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/BRK:/i)).not.toBeInTheDocument();
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

  it('renders the dashed baseline above the primary line when both laps overlap', () => {
    const continuousPoints: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 101, y: 10, z: 201, rotY: 0, speedKmh: 160, throttle: 80, brake: 0, timeSec: 0.1 },
      { x: 102, y: 10, z: 202, rotY: 0, speedKmh: 170, throttle: 80, brake: 0, timeSec: 0.2 },
    ];
    const { container } = render(
      <GpsTrackMap
        points={continuousPoints}
        bounds={mockBounds}
        currentIndex={0}
        baselinePoints={continuousPoints}
      />
    );

    const primaryLine = container.querySelector('[data-track-line="primary"]');
    const baselineLine = container.querySelector('[data-track-line="baseline"]');
    expect(primaryLine).toBeTruthy();
    expect(baselineLine).toBeTruthy();
    expect(primaryLine?.compareDocumentPosition(baselineLine!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('differentiates primary and baseline lines and uses clean blue and orange car markers without text labels', () => {
    const continuousPoints: ReplayTrajectoryPoint[] = [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 101, y: 10, z: 201, rotY: 0, speedKmh: 160, throttle: 80, brake: 0, timeSec: 0.1 },
      { x: 102, y: 10, z: 202, rotY: 0, speedKmh: 170, throttle: 80, brake: 0, timeSec: 0.2 },
    ];
    const { container } = render(
      <GpsTrackMap
        points={continuousPoints}
        bounds={mockBounds}
        currentIndex={0}
        baselinePoints={continuousPoints}
      />
    );

    // Car markers rely cleanly on blue and orange glowing dots without text clutter
    expect(screen.queryByText('MINE')).not.toBeInTheDocument();
    expect(screen.queryByText('GHOST')).not.toBeInTheDocument();

    // Primary and baseline track lines are rendered with pure heatmap colors without underlays
    const primaryLine = container.querySelector('[data-track-line="primary"]');
    const baselineLine = container.querySelector('[data-track-line="baseline"]');
    expect(primaryLine).toBeTruthy();
    expect(baselineLine).toBeTruthy();
    expect(baselineLine?.getAttribute('stroke-dasharray')).toBe('8 6');
    expect(container.querySelector('line[stroke-width="3.6"]')).toBeNull();
    expect(container.querySelector('line[stroke-width="3.4"]')).toBeNull();
  });

  it('renders a T# marker for each detected corner, matching the corner analysis table', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }, { cornerNumber: 2, minDistM: 100 }]}
      />
    );

    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
  });

  it('offsets corner markers away from the racing line to avoid clustering', () => {
    const cornerPoints: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, rotY: 0, speedKmh: 60, throttle: 40, brake: 0, timeSec: 0.0 },
      { x: 5, y: 0, z: 1, rotY: 0, speedKmh: 70, throttle: 50, brake: 0, timeSec: 0.1 },
      { x: 10, y: 0, z: 3, rotY: 0, speedKmh: 80, throttle: 60, brake: 0, timeSec: 0.2 },
      { x: 15, y: 0, z: 7, rotY: 0, speedKmh: 90, throttle: 70, brake: 0, timeSec: 0.3 },
      { x: 20, y: 0, z: 12, rotY: 0, speedKmh: 100, throttle: 80, brake: 0, timeSec: 0.4 },
      { x: 25, y: 0, z: 18, rotY: 0, speedKmh: 90, throttle: 70, brake: 0, timeSec: 0.5 },
    ];
    const bounds = { minX: 0, maxX: 25, minZ: 0, maxZ: 18, spanX: 25, spanZ: 18 };
    const projected = projectTrajectoryPoints(cornerPoints, bounds, 800, 60);
    const cornerDist = computeCumulativeDistances(cornerPoints)[3];

    render(
      <GpsTrackMap
        points={cornerPoints}
        bounds={bounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: cornerDist }]}
      />
    );

    const label = screen.getByText('T1');
    const markerGroup = label.closest('g');
    expect(markerGroup).not.toBeNull();
    const transform = markerGroup!.getAttribute('transform') ?? '';
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    expect(match).not.toBeNull();

    const markerX = Number(match![1]);
    const markerY = Number(match![2]);
    const trackPoint = projected[3];
    expect(Math.hypot(markerX - trackPoint.sx, markerY - trackPoint.sy)).toBeGreaterThan(12);
  });

  it('highlights the selected corner marker and clicking it selects the corner and jumps the scrubber', () => {
    const onSelectCornerNumber = vi.fn();
    const onSelectIndex = vi.fn();
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        selectedCornerNumber={1}
        onSelectCornerNumber={onSelectCornerNumber}
        onSelectIndex={onSelectIndex}
      />
    );

    const markerText = screen.getByText('T1');
    const markerGroup = markerText.closest('g');
    expect(markerGroup?.querySelector('circle')?.getAttribute('fill')).toBe('#f43f5e');
    expect(markerGroup?.querySelector('circle')?.getAttribute('r')).toBe('16.5');

    fireEvent.click(markerText);
    expect(onSelectCornerNumber).toHaveBeenCalledWith(1);
    expect(onSelectIndex).toHaveBeenCalledWith(0);
  });

  it('renders unselected corner markers with the default (non-highlighted) style and clear 13.5px radius', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
        selectedCornerNumber={null}
      />
    );

    const markerGroup = screen.getByText('T1').closest('g');
    expect(markerGroup?.querySelector('circle')?.getAttribute('fill')).toBe('#0f172a');
    expect(markerGroup?.querySelector('circle')?.getAttribute('r')).toBe('13.5');
  });

  it('maintains safe clearance from the racing line when zoomed in and does not collapse onto apex', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        corners={[{ cornerNumber: 1, minDistM: 0 }]}
      />
    );

    const zoomInBtn = screen.getByTitle(/Zoom in/i);
    const initialTransform = screen.getByText('T1').closest('g')!.getAttribute('transform')!;
    const initialMatch = initialTransform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const initialX = Number(initialMatch![1]);
    const initialY = Number(initialMatch![2]);

    // Zoom in multiple times
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);

    const zoomedTransform = screen.getByText('T1').closest('g')!.getAttribute('transform')!;
    const zoomedMatch = zoomedTransform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const zoomedX = Number(zoomedMatch![1]);
    const zoomedY = Number(zoomedMatch![2]);

    // Projected point index 0 coordinates
    const projected0 = projectTrajectoryPoints(mockPoints, mockBounds, 800, 60)[0];
    const initialDist = Math.hypot(initialX - projected0.sx, initialY - projected0.sy);
    const zoomedDist = Math.hypot(zoomedX - projected0.sx, zoomedY - projected0.sy);

    // Marker maintains safe clearance from the apex and adapts proximity when zoomed so it does not drift far away
    expect(initialDist).toBeGreaterThanOrEqual(30);
    expect(zoomedDist).toBeGreaterThanOrEqual(15);
    expect(zoomedDist).toBeLessThan(initialDist);
    // Visual badge scale adapts with zoom to keep constant physical size
    expect(zoomedTransform).toMatch(/scale\(/);
  });

  it('rescales a corner\'s baseline-lap distance onto the primary lap so the marker lands on the same physical corner', () => {
    // minDistM (5) is measured along a much shorter baseline lap (total 10m); on the ~107.7m
    // primary lap that same 50%-of-lap point falls near primary point index 1, not index 0
    // (which is where a naive un-rescaled lookup of raw distance 5 would land).
    const shortBaselinePoints: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 10, y: 0, z: 0, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.1 },
    ];
    const onSelectIndex = vi.fn();

    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        baselinePoints={shortBaselinePoints}
        corners={[{ cornerNumber: 1, minDistM: 5 }]}
        onSelectIndex={onSelectIndex}
      />
    );

    fireEvent.click(screen.getByText('T1'));
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });

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
    expect(dashedLine?.getAttribute('stroke')).toBe('#f87171');

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
    expect(dashedLine?.getAttribute('stroke')).toBe('#4ade80');

    // Badge circle is enlarged to r=9.5
    const badgeCircle = baselineThrottle?.querySelector('circle[r="9.5"]');
    expect(badgeCircle).toBeInTheDocument();
    expect(badgeCircle?.getAttribute('stroke')).toBe('#4ade80');
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
    const cornerViewBox = svgEl?.getAttribute('viewBox');
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
    expect(paths.length).toBeGreaterThanOrEqual(3); // Asphalt surface + 2 boundary limits
    expect(paths[0].getAttribute('fill')).toBe('#0c121e');
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

    const pX1 = parseFloat(primLine.getAttribute('x1') || '0');
    const bX1 = parseFloat(baseLine.getAttribute('x1') || '0');

    const svgDiff = Math.abs(bX1 - pX1);
    expect(svgDiff).toBeGreaterThan(0);
    expect(svgDiff).toBeLessThan(30);
  });
});



