import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsOfficialTurns, projectOfficialTurns } from '../../../../../src/components/replay/map/scene/GpsOfficialTurns.js';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';

/** A rounded square, 200 m sides and 40 m corners, centred on the origin, sampled every 2 m. */
function roundedSquare(): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [[100, 100, 0], [-100, 100, 90], [-100, -100, 180], [100, -100, 270]];
  corners.forEach(([cx, cy, fromDeg], index) => {
    for (let deg = fromDeg; deg < fromDeg + 90; deg += 2.865) {
      const a = deg * Math.PI / 180;
      points.push([cx + 40 * Math.cos(a), cy + 40 * Math.sin(a)]);
    }
    const [nx, ny] = corners[(index + 1) % 4];
    const end: [number, number] = [cx + 40 * Math.cos((fromDeg + 90) * Math.PI / 180), cy + 40 * Math.sin((fromDeg + 90) * Math.PI / 180)];
    const next: [number, number] = [nx + 40 * Math.cos((fromDeg + 90) * Math.PI / 180), ny + 40 * Math.sin((fromDeg + 90) * Math.PI / 180)];
    for (let f = 0; f < 1; f += 0.01) points.push([end[0] + (next[0] - end[0]) * f, end[1] + (next[1] - end[1]) * f]);
  });
  return points;
}

const centerline = roundedSquare();
const geometry = { layoutKey: 'test_square', centerline } as unknown as TrackBoundaryGeometry;
const centerSvg = centerline.map(([x, z]) => ({ sx: x, sy: z }));

describe('official turns on the map', () => {
  it('puts a mark outside each bend and a boundary tick between turns', () => {
    const { marks, ticks } = projectOfficialTurns(geometry, centerSvg);
    expect(marks).toHaveLength(4);
    for (const mark of marks) {
      // Outside points away from the square's centre.
      expect(mark.apex.sx * mark.outside.sx + mark.apex.sy * mark.outside.sy).toBeGreaterThan(0);
      expect(Math.hypot(mark.apex.sx, mark.apex.sy)).toBeGreaterThan(150);
    }
    // The first segment starts at the start line, which is no tick.
    expect(ticks).toHaveLength(3);
  });

  it('draws nothing without a centre line matching its projection', () => {
    expect(projectOfficialTurns(geometry, centerSvg.slice(1)).marks).toEqual([]);
    expect(projectOfficialTurns(null, []).marks).toEqual([]);
  });

  it('keeps the ticks but no badge for turns without a number or a name', () => {
    render(<svg><GpsOfficialTurns geometry={geometry} centerSvg={centerSvg} markerScale={1} /></svg>);
    expect(screen.queryAllByTestId('official-turn')).toHaveLength(0);
    expect(screen.getAllByTestId('official-turn-boundary')).toHaveLength(3);
  });

  it('labels a listed layout with its official numbers', () => {
    // Monza's list has eleven turns; a square has four bends, so four list entries take them.
    render(<svg><GpsOfficialTurns geometry={{ ...geometry, layoutKey: 'monza_gp' }} centerSvg={centerSvg} markerScale={1} /></svg>);
    const labels = screen.getAllByTestId('official-turn').map(node => node.querySelector('text')?.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every(label => /^T\d+$/.test(label ?? ''))).toBe(true);
  });
});
