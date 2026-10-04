import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsTrackMap, projectTrajectoryPoints } from '../../../../src/components/replay/index.js';
import { computeCumulativeDistances } from '../../../../src/utils/lapAlignment.js';
import { ReplayTrajectoryPoint } from '../../../../server/core/types.js';
import { mockPoints, mockBounds } from './gpsTrackMapFixtures.js';

describe('GpsTrackMap', () => {
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
    expect(markerGroup?.querySelector('circle')?.getAttribute('fill')).toBe('#F43F5E');
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
    expect(markerGroup?.querySelector('circle')?.getAttribute('fill')).toBe('#0F172A');
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

  it('keeps fixed dimensions on zoom buttons and zoom display so toolbar does not shift when zoom expands', () => {
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    const zoomInBtn = screen.getByTitle(/Zoom in/i);
    const zoomOutBtn = screen.getByTitle(/Zoom out/i);
    const resetBtn = screen.getByTitle(/Reset view/i);
    const zoomText = screen.getByText('1x');

    // Fixed dimensions ensure buttons do not jump or resize as digits expand
    expect(zoomInBtn.className).toContain('w-7');
    expect(zoomInBtn.className).toContain('h-7');
    expect(zoomInBtn.className).toContain('shrink-0');

    expect(zoomOutBtn.className).toContain('w-7');
    expect(zoomOutBtn.className).toContain('h-7');
    expect(zoomOutBtn.className).toContain('shrink-0');

    expect(resetBtn.className).toContain('w-7');
    expect(resetBtn.className).toContain('h-7');
    expect(resetBtn.className).toContain('shrink-0');

    expect(zoomText.className).toContain('w-11');
    expect(zoomText.className).toContain('tabular-nums');
    expect(zoomText.className).toContain('shrink-0');

    // Zooming in updates zoom text while preserving the fixed class layout
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('zooms in where the cursor is when double clicking on the map container', () => {
    const { container } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    expect(screen.getByText('1x')).toBeInTheDocument();

    const mapContainer = container.firstElementChild;
    expect(mapContainer).toBeInTheDocument();

    // Double click at (200, 300)
    fireEvent.doubleClick(mapContainer!, { clientX: 200, clientY: 300, button: 0 });

    // Zoom level increases to 3x (double click advances 2 steps)
    expect(screen.getByText('3x')).toBeInTheDocument();

    // Wheel scroll remains single step (3x -> 4.5x)
    fireEvent.wheel(mapContainer!, { deltaY: -100, clientX: 200, clientY: 300 });
    expect(screen.getByText('4.5x')).toBeInTheDocument();
  });

  it('keeps follow car mode active when clicking plus and minus zoom buttons', () => {
    const { getByRole, getByText } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
      />
    );

    const followBtn = getByRole('button', { name: 'Follow car' });
    expect(followBtn).toHaveAttribute('aria-pressed', 'false');

    // Activate follow car mode
    fireEvent.pointerDown(followBtn, { button: 0 });
    fireEvent.click(followBtn);
    expect(followBtn).toHaveAttribute('aria-pressed', 'true');

    const zoomInBtn = getByRole('button', { name: 'Zoom in' });
    const zoomOutBtn = getByRole('button', { name: 'Zoom out' });

    // Click Zoom In
    fireEvent.pointerDown(zoomInBtn, { button: 0 });
    fireEvent.click(zoomInBtn);
    expect(getByText('2x')).toBeInTheDocument();
    // Follow car must remain active!
    expect(followBtn).toHaveAttribute('aria-pressed', 'true');

    // Click Zoom Out
    fireEvent.pointerDown(zoomOutBtn, { button: 0 });
    fireEvent.click(zoomOutBtn);
    expect(getByText('1x')).toBeInTheDocument();
    // Follow car must remain active!
    expect(followBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('anchors a corner flag at its distance on the primary lap, whatever the baseline lap length', () => {
    // Corner distances are in the primary lap's frame: minDistM 50 is primary point index 1
    // (~53.9 m). A much shorter baseline (10 m) must not move it - rescaling by the lap-length
    // ratio would send it past the end of the lap (index 2).
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
        corners={[{ cornerNumber: 1, minDistM: 50 }]}
        onSelectIndex={onSelectIndex}
      />
    );

    fireEvent.click(screen.getByText('T1'));
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });

  it('shows play/pause button in full screen map and handles toggling playback', () => {
    const onTogglePlay = vi.fn();
    const { container, rerender } = render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        isPlaying={false}
        onTogglePlay={onTogglePlay}
      />
    );

    // In normal view, play/pause is hidden so it doesn't crowd sidebar controls
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();

    // Expand map to full screen
    const fullscreenButton = screen.getByRole('button', { name: 'Full screen map' });
    fireEvent.click(fullscreenButton);

    const map = container.querySelector('[data-replay-surface="map"]');
    expect(map).toHaveAttribute('data-map-expanded');

    // In full screen view, play button is visible
    const playButton = screen.getByRole('button', { name: 'Play' });
    expect(playButton).toBeInTheDocument();

    fireEvent.click(playButton);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    // When playing in full screen, pause button is visible
    rerender(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={0}
        isPlaying={true}
        onTogglePlay={onTogglePlay}
      />
    );

    const pauseButton = screen.getByRole('button', { name: 'Pause' });
    expect(pauseButton).toBeInTheDocument();
    fireEvent.click(pauseButton);
    expect(onTogglePlay).toHaveBeenCalledTimes(2);
  });

  it('handles keyboard shortcuts in full screen mode', () => {
    const onSelectIndex = vi.fn();
    const onTogglePlay = vi.fn();
    render(
      <GpsTrackMap
        points={mockPoints}
        bounds={mockBounds}
        currentIndex={1}
        isPlaying={false}
        onTogglePlay={onTogglePlay}
        onSelectIndex={onSelectIndex}
      />
    );

    // Expand map to full screen
    fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));

    // Arrow keys step replay index
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onSelectIndex).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onSelectIndex).toHaveBeenCalledWith(0);

    // Home jumps to start
    fireEvent.keyDown(window, { key: 'Home' });
    expect(onSelectIndex).toHaveBeenCalledWith(0);

    // End jumps to end
    fireEvent.keyDown(window, { key: 'End' });
    expect(onSelectIndex).toHaveBeenCalledWith(mockPoints.length - 1);

    // Space toggles play/pause in full screen
    fireEvent.keyDown(window, { key: ' ' });
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });
});
