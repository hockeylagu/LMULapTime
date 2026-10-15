import { describe, expect, it } from 'vitest';
import { buildRibbonIndex, clearCornerRibbon } from '../../../../../src/components/replay/map/scene/cornerRibbonClearance.js';

const outer = [{ sx: 0, sy: 0 }, { sx: 200, sy: 0 }, { sx: 200, sy: 200 }, { sx: 0, sy: 200 }];
const inner = [{ sx: 50, sy: 50 }, { sx: 150, sy: 50 }, { sx: 150, sy: 150 }, { sx: 50, sy: 150 }];
const road = buildRibbonIndex(outer, inner);

describe('clearCornerRibbon', () => {
  it('moves a zoomed badge beyond the road edge with its radius and gap clear', () => {
    const position = clearCornerRibbon({ sx: 175, sy: 100 }, { sx: 1, sy: 0 }, 4, 3, road);
    expect(position.sx).toBeGreaterThanOrEqual(203);
    expect(position.sy).toBe(100);
  });

  it('allows labels in the empty infield of the evenodd ribbon', () => {
    const position = clearCornerRibbon({ sx: 175, sy: 100 }, { sx: -1, sy: 0 }, 4, 3, road);
    expect(position.sx).toBeLessThanOrEqual(147);
    expect(position.sx).toBeGreaterThan(100);
  });

  it('keeps the entire badge outside when only its center already clears the road', () => {
    const position = clearCornerRibbon({ sx: 175, sy: 100 }, { sx: 1, sy: 0 }, 30, 19.5, road);
    expect(position.sx).toBeGreaterThanOrEqual(219.5);
  });

  it('preserves nearby positions that already clear the ribbon', () => {
    expect(clearCornerRibbon({ sx: 175, sy: 100 }, { sx: 1, sy: 0 }, 45, 19.5, road))
      .toEqual({ sx: 220, sy: 100 });
  });

  it('clears a DIGI board beside the road', () => {
    const position = clearCornerRibbon({ sx: 175, sy: 100 }, { sx: 1, sy: 0 }, 32, 27.5,
      road, [{ x: 235, y: 100, hw: 17, hh: 9 }]);
    expect(position.sx).toBeGreaterThanOrEqual(279.5);
  });

  it('keeps the badge and a visible gap clear of a circuit line at 0.6x without boundaries', () => {
    const scale = 1 / 0.6;
    const position = clearCornerRibbon({ sx: 100, sy: 100 }, { sx: 1, sy: 0 }, 32 * scale, 27.5 * scale,
      buildRibbonIndex([], [], [[{ sx: 130, sy: 0 }, { sx: 130, sy: 200 }]]));
    expect((position.sx - 130) / scale - 13.5).toBeGreaterThanOrEqual(14);
  });
});
