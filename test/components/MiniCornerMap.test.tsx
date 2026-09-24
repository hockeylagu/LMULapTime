import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MiniCornerMap } from '../../src/components/replay/map/MiniCornerMap.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

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
    expect(circle).toHaveAttribute('fill', '#f43f5e');
  });
});
