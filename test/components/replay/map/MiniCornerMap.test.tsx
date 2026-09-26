import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MiniCornerMap } from '../../../../src/components/replay/map/MiniCornerMap.js';
import { projectTrajectoryPoints } from '../../../../src/components/replay/map/replayMapUtils.js';
import { ReplayTrajectoryPoint } from '../../../../server/core/types.js';

describe('MiniCornerMap component', () => {
  const bounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 };

  it('returns null when points array is empty', () => {
    const { container } = render(
      <MiniCornerMap points={[]} bounds={bounds} highlightDistM={50} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders SVG with trajectory paths and highlighted corner dot', () => {
    const points: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 100 },
      { x: 50, y: 0, z: 50, speedKmh: 120 },
      { x: 100, y: 0, z: 100, speedKmh: 150 },
    ];

    const { container } = render(
      <MiniCornerMap
        points={points}
        bounds={bounds}
        highlightDistM={60}
        className="w-16 h-16 custom-map"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('custom-map');

    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
    expect(circle).toHaveAttribute('fill', '#F43F5E');
  });

  it('places the corner dot in the S/F-zeroed frame for a lap recorded from before the line', () => {
    // Along +x, crossing the S/F line (station 0) between samples at x = 5: the first samples
    // are at the end of the previous lap (stations 995-999). Corner distances are measured from
    // the line, so distance 10 is x = 15 - without the track length the seam can't be unwrapped
    // and the dot lands at x = 10.
    const trackLengthM = 1000;
    const points: ReplayTrajectoryPoint[] = Array.from({ length: 21 }, (_, i) => ({
      x: i * 2, y: 0, z: 0, distM: i * 2, stationM: (i * 2 - 5 + trackLengthM) % trackLengthM, speedKmh: 150,
    }));
    const lineBounds = { minX: 0, maxX: 40, minZ: -20, maxZ: 20, spanX: 40, spanZ: 40 };
    const { container } = render(
      <MiniCornerMap points={points} bounds={lineBounds} highlightDistM={10} trackLengthM={trackLengthM} />
    );
    const [expected] = projectTrajectoryPoints([{ x: 15, y: 0, z: 0 }], lineBounds, 100, 12);
    // The dot snaps to the nearest sample (2 m apart, 1.9 px/m): within one sample of x = 15.
    expect(Math.abs(Number(container.querySelector('circle')?.getAttribute('cx')) - expected.sx)).toBeLessThan(2.5);
  });
});
