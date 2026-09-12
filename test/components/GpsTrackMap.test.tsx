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

  it('renders SVG track map and start indicator', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    expect(screen.getByText(/START/i)).toBeInTheDocument();
    expect(screen.getByText(/Speed:/i)).toBeInTheDocument();
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

    fireEvent.click(markerText);
    expect(onSelectCornerNumber).toHaveBeenCalledWith(1);
    expect(onSelectIndex).toHaveBeenCalledWith(0);
  });

  it('renders unselected corner markers with the default (non-highlighted) style', () => {
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
});
