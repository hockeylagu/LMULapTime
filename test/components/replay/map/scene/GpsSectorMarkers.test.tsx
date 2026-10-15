import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsSectorMarkers, placeSectorMarkers, type SectorMapMarker } from '../../../../../src/components/replay/map/scene/GpsSectorMarkers.js';

describe('sector label clearance', () => {
  const gates: SectorMapMarker[] = [{ key: 's1', left: { sx: 100, sy: 100 }, right: { sx: 140, sy: 100 } }];

  it('keeps the badge edge off the ribbon at every zoom and increases overview spacing', () => {
    const detailed = placeSectorMarkers(gates, 0.1, 8)[0];
    const overview = placeSectorMarkers(gates, 1.2, 0.7)[0];
    const detailedGapPx = (detailed.x - detailed.hw - 140) / 0.1;
    const overviewGapPx = (overview.x - overview.hw - 140) / 1.2;
    expect(detailedGapPx).toBeGreaterThanOrEqual(18);
    expect(overviewGapPx).toBeGreaterThan(detailedGapPx + 5);
  });

  it('keeps a recorded crossing anchored while drawing the label and connector outside it', () => {
    const markers = placeSectorMarkers([{ key: 's2', point: { sx: 200, sy: 300 } }], 0.5, 1);
    render(<svg><GpsSectorMarkers markers={markers} markerScale={0.5} /></svg>);
    const marker = screen.getByTestId('map-sector-s2');
    expect(marker.querySelector('circle')).toHaveAttribute('cy', '300');
    expect(markers[0].y + markers[0].hh).toBeLessThan(300 - 10);
    expect(marker.querySelector('line')).toHaveAttribute('y1', '300');
  });

  it('moves the sector badge past crowded braking boards without changing the boards or timing cut', () => {
    const original = placeSectorMarkers(gates, 0.2, 6)[0];
    const boards = [{ x: original.x, y: original.y, hw: 3, hh: 2 },
      { x: original.x + 12, y: original.y, hw: 8, hh: 2 }];
    const snapshot = structuredClone(boards);
    const moved = placeSectorMarkers(gates, 0.2, 6, boards)[0];
    expect(boards).toEqual(snapshot);
    expect(moved.right).toEqual(gates[0].right);
    expect(moved.x !== original.x || moved.y !== original.y).toBe(true);
    // It may step sideways around the gate, but stays near it instead of being pushed down the ray.
    expect(Math.hypot(moved.x - moved.right!.sx, moved.y - moved.right!.sy))
      .toBeLessThan(2 * Math.hypot(original.x - moved.right!.sx, original.y - moved.right!.sy) + 30 * 0.2);
    for (const board of boards) {
      expect(Math.abs(moved.x - board.x) >= moved.hw + board.hw + 1
        || Math.abs(moved.y - board.y) >= moved.hh + board.hh + 1).toBe(true);
    }
  });
});
