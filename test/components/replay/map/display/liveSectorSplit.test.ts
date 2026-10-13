import { describe, expect, it } from 'vitest';
import { liveSectorSplit } from '../../../../../src/components/replay/map/display/liveSectorSplit.js';
import type { PointComparison } from '../../../../../src/utils/replayComparison.js';

const comparisons = [0, 0.1, 0.2, 0.5, 0.4, 0.3, 0.9, 1.0].map(deltaTimeSec => ({ deltaTimeSec }) as PointComparison);
const sectors = { s1Frame: 3, s2Frame: 6 };

describe('liveSectorSplit', () => {
  it('reports the cursor sector and the delta change since its start line', () => {
    expect(liveSectorSplit(sectors, 2, comparisons, 0.2)).toEqual({ sector: 1, deltaSec: 0.2 });
    // S2 began at a +0.5 s delta; now +0.3 s, so 0.2 s gained within S2.
    expect(liveSectorSplit(sectors, 5, comparisons, 0.3)?.sector).toBe(2);
    expect(liveSectorSplit(sectors, 5, comparisons, 0.3)?.deltaSec).toBeCloseTo(-0.2);
    expect(liveSectorSplit(sectors, 6, comparisons, 0.9)?.sector).toBe(3);
    expect(liveSectorSplit(sectors, 7, comparisons, 1.0)?.deltaSec).toBeCloseTo(0.1);
  });

  it('keeps the sector without a baseline and gives up without usable sector lines', () => {
    expect(liveSectorSplit(sectors, 4, null, null)).toEqual({ sector: 2, deltaSec: null });
    expect(liveSectorSplit(sectors, 4, comparisons, NaN)).toEqual({ sector: 2, deltaSec: null });
    expect(liveSectorSplit(undefined, 4, comparisons, 0.4)).toBeNull();
    expect(liveSectorSplit({ s1Frame: 0, s2Frame: 6 }, 4, comparisons, 0.4)).toBeNull();
    expect(liveSectorSplit({ s1Frame: 6, s2Frame: 3 }, 4, comparisons, 0.4)).toBeNull();
  });
});
