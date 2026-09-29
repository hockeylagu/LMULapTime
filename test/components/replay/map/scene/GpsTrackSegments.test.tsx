import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { GpsTrackSegments } from '../../../../../src/components/replay/map/scene/GpsTrackSegments.js';
import type { ProjectedPoint } from '../../../../../src/components/replay/map/replayMapUtils.js';

/** jsdom has no layout: give the path an identity screen transform so clicks map 1:1 to SVG space. */
function withIdentityCtm(el: Element): Element {
  Object.assign(el, { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }) });
  return el;
}

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

  it('renders one solid path per colour run and selects the nearest sample on click', () => {
    const onSelectIndex = vi.fn();
    const { container } = render(
      <svg>
        <GpsTrackSegments svgPoints={mockPrimaryPoints} colorBy="speed" onSelectIndex={onSelectIndex} />
      </svg>
    );

    // 120 and 140 km/h are different speed colours: two runs.
    const primaryPaths = container.querySelectorAll('path[data-track-line="primary"]');
    expect(primaryPaths).toHaveLength(2);
    expect(primaryPaths[0]).toHaveAttribute('d', 'M 100.00 100.00 L 110.00 110.00');
    expect(primaryPaths[0]).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(primaryPaths[0]).toHaveAttribute('stroke-width', '2');

    fireEvent.click(withIdentityCtm(primaryPaths[0]), { clientX: 108, clientY: 109 });
    expect(onSelectIndex).toHaveBeenCalledWith(1);
    fireEvent.click(withIdentityCtm(primaryPaths[1]), { clientX: 119, clientY: 121 });
    expect(onSelectIndex).toHaveBeenLastCalledWith(2);
  });

  it('merges consecutive segments of the same colour into one path', () => {
    const fullThrottle: ProjectedPoint[] = [0, 1, 2, 3].map(i => (
      { sx: 100 + 10 * i, sy: 100, idx: i, x: 2 * i, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, timeSec: i }
    ));
    const { container } = render(<svg><GpsTrackSegments svgPoints={fullThrottle} colorBy="pedal" /></svg>);
    const paths = container.querySelectorAll('path[data-track-line="primary"]');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('d', 'M 100.00 100.00 L 110.00 100.00 L 120.00 100.00 L 130.00 100.00');
  });

  it('renders baseline dashed paths with strokeDasharray="8 6" when baselineSvgPoints are passed', () => {
    const { container } = render(
      <svg>
        <GpsTrackSegments svgPoints={mockPrimaryPoints} baselineSvgPoints={mockBaselinePoints} colorBy="pedal" baselineOpacity={0.7} />
      </svg>
    );

    const baselinePaths = container.querySelectorAll('path[data-track-line="baseline"]');
    expect(baselinePaths).toHaveLength(1);
    expect(baselinePaths[0]).toHaveAttribute('stroke-dasharray', '8 6');
    expect(baselinePaths[0]).toHaveAttribute('stroke-width', '1.8');
    expect(Number(baselinePaths[0].getAttribute('stroke-opacity'))).toBeCloseTo(0.9 * 0.7);
  });

  it('breaks the line at teleports and distant discontinuities', () => {
    const teleportPoints: ProjectedPoint[] = [
      { sx: 100, sy: 100, idx: 0, x: 10, y: 0, z: 10, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0 },
      { sx: 500, sy: 500, idx: 1, x: 200, y: 0, z: 200, isTeleport: true, speedKmh: 0, throttle: 0, brake: 0, timeSec: 1 },
    ];
    const { container } = render(<svg><GpsTrackSegments svgPoints={teleportPoints} colorBy="speed" /></svg>);
    expect(container.querySelectorAll('path[data-track-line="primary"]')).toHaveLength(0);
  });

  it('starts a new path after a gap even when the colour is unchanged', () => {
    const gapped: ProjectedPoint[] = [
      { sx: 100, sy: 100, idx: 0, x: 0, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, timeSec: 0 },
      { sx: 110, sy: 100, idx: 1, x: 2, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, timeSec: 1 },
      { sx: 200, sy: 100, idx: 2, x: 100, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, timeSec: 2 },
      { sx: 210, sy: 100, idx: 3, x: 102, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, timeSec: 3 },
    ];
    const { container } = render(<svg><GpsTrackSegments svgPoints={gapped} colorBy="pedal" /></svg>);
    const paths = container.querySelectorAll('path[data-track-line="primary"]');
    expect([...paths].map(p => p.getAttribute('d'))).toEqual(['M 100.00 100.00 L 110.00 100.00', 'M 200.00 100.00 L 210.00 100.00']);
  });

  it('dims non-selected track segments outside highlightDistRange', () => {
    const multiPoints: ProjectedPoint[] = [
      { sx: 10, sy: 10, idx: 0, x: 0, y: 0, z: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0 },
      { sx: 20, sy: 20, idx: 1, x: 10, y: 0, z: 10, speedKmh: 100, throttle: 100, brake: 0, timeSec: 1 },
      { sx: 30, sy: 30, idx: 2, x: 20, y: 0, z: 20, speedKmh: 80, throttle: 0, brake: 100, timeSec: 2 },
    ];
    const primaryDists = [50, 150, 250];

    const { container } = render(
      <svg>
        <GpsTrackSegments
          svgPoints={multiPoints}
          colorBy="pedal"
          primaryDists={primaryDists}
          highlightDistRange={{ startDistM: 100, endDistM: 200 }}
          dimNonSelectedTrack={true}
        />
      </svg>
    );

    const paths = container.querySelectorAll('path[data-track-line="primary"]');
    expect(paths).toHaveLength(2);
    // Segment 0->1 ends at 150 m (inside 100..200): highlighted, bold 3.2 stroke
    expect(paths[0]).toHaveAttribute('stroke-width', '3.2');
    expect(Number(paths[0].getAttribute('stroke-opacity'))).toBe(1);
    // Segment 1->2 ends at 250 m (outside): dimmed, 1.4 stroke at 0.45 opacity
    expect(paths[1]).toHaveAttribute('stroke-width', '1.4');
    expect(Number(paths[1].getAttribute('stroke-opacity'))).toBeCloseTo(0.45);
    expect(paths[1].getAttribute('stroke')).not.toBe('#334155');
  });
});
