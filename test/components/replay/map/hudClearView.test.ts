import { describe, expect, it } from 'vitest';
import { hudClearView } from '../../../../src/components/replay/map/hudClearView.js';

/** Where a view box point lands in a `width` × `height` area under `view` (the pan-zoom hook's view box, drawn to fit). */
function toPixels(view: {zoom: number; x: number; y: number}, width: number, height: number, [x, y]: [number, number]): [number, number] {
  const visible = 800 / (view.zoom * 1.5), scale = Math.min(width, height) / visible;
  return [width / 2 + (x - (400 + view.x)) * scale, height / 2 + (y - (400 + view.y)) * scale];
}

describe('map view clear of the HUD', () => {
  // A tall circuit (Barcelona's shape) as the race map projects it, and the race map's HUD (controls and timing) top right.
  const track = {minX: 117, maxX: 683, minY: 60, maxY: 740};

  it('fits a tall circuit whole beside the HUD, as large as fits', () => {
    const view = hudClearView({width: 1222, height: 1094}, {left: 860, bottom: 297}, track, 800, 1.5, 24)!;
    const [left, top] = toPixels(view, 1222, 1094, [track.minX, track.minY]), [right, bottom] = toPixels(view, 1222, 1094, [track.maxX, track.maxY]);
    // The width sets the size: from the margin to the margin before the HUD, the height within the area.
    expect(left).toBeCloseTo(24, 6); expect(right).toBeCloseTo(860 - 24, 6);
    expect(top).toBeGreaterThanOrEqual(24); expect(bottom).toBeLessThanOrEqual(1094 - 24);
    expect((top + bottom) / 2).toBeCloseTo(1094 / 2, 6);
  });

  it('fits a wide circuit under the HUD when that leaves it larger', () => {
    const wide = {minX: 60, maxX: 740, minY: 250, maxY: 550};
    const view = hudClearView({width: 1222, height: 1094}, {left: 860, bottom: 297}, wide, 800, 1.5, 24)!;
    const [left, top] = toPixels(view, 1222, 1094, [wide.minX, wide.minY]), [right] = toPixels(view, 1222, 1094, [wide.maxX, wide.maxY]);
    expect(left).toBeCloseTo(24, 6); expect(right).toBeCloseTo(1222 - 24, 6);
    expect(top).toBeGreaterThanOrEqual(297 + 24);
  });

  it('has no view while the map has no size', () => {
    expect(hudClearView({width: 0, height: 0}, {left: 0, bottom: 0}, track, 800, 1.5, 24)).toBeNull();
  });
});
