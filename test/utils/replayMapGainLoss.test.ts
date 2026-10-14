import { describe, expect, it } from 'vitest';
import { computeGainLossByIdx, getHeatmapColor } from '../../src/components/replay/map/replayMapUtils.js';
import type { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { TELEMETRY_COLORS } from '../../src/utils/themeColors.js';

const point = (timeSec: number): ReplayTrajectoryPoint => ({ x: timeSec * 10, y: 0, z: 0, timeSec });

describe('map local gain/loss', () => {
  it.each([0.01, 0.04, 0.2])('detects gaining while still behind at %s s sampling', step => {
    const points = Array.from({ length: Math.round(2 / step) + 1 }, (_, i) => point(i * step));
    const rates = computeGainLossByIdx(points, points.map(p => 2 - p.timeSec! * 0.16))!;
    for (const rate of rates) expect(rate).toBeCloseTo(-0.16);
    expect(getHeatmapColor(points[0], 'gainLoss', rates[0])).toBe('rgb(16, 185, 129)');
    expect(getHeatmapColor(points[0], 'delta', 2)).toBe('rgb(239, 68, 68)');
  });

  it('detects losing while still ahead and keeps a constant gap neutral', () => {
    const points = Array.from({ length: 11 }, (_, i) => point(i * 0.1));
    const rates = computeGainLossByIdx(points, points.map(p => -2 + p.timeSec! * 0.16))!;
    expect(getHeatmapColor(points[5], 'gainLoss', rates[5])).toBe('rgb(239, 68, 68)');
    const steady = computeGainLossByIdx(points, points.map(() => 3))!;
    expect(steady.every(rate => rate === 0)).toBe(true);
    expect(getHeatmapColor(points[0], 'gainLoss', steady[0])).toBe(TELEMETRY_COLORS.neutral);
  });

  it('does not smear a delta discontinuity across a recording gap or teleport', () => {
    const points = [point(0), point(0.1), { ...point(0.2), isTeleport: true }, point(0.3), point(5), point(5.1)];
    expect(computeGainLossByIdx(points, [0, 0, 10, 10, 20, 20])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('handles missing, invalid and repeated timestamps without fabricated rates', () => {
    expect(computeGainLossByIdx([], null)).toBeNull();
    expect(computeGainLossByIdx([], [])).toEqual([]);
    const rates = computeGainLossByIdx([point(0), point(0), { x: 0, y: 0, z: 0 }], [0, 1, 2])!;
    expect(rates.every(Number.isNaN)).toBe(true);
    for (const value of [undefined, Number.NaN, Infinity, 0.01, -0.01]) {
      expect(getHeatmapColor(point(0), 'gainLoss', value)).toBe(TELEMETRY_COLORS.neutral);
    }
  });
});
