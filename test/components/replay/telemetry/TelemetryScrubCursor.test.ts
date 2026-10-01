import { describe, expect, it } from 'vitest';
import { pixelAlignedCursor } from '../../../../src/components/replay/telemetry/TelemetryScrubCursor.js';

describe('scrub cursor pixel alignment', () => {
  it('keeps both edges on physical pixels across motion, fractional origins and display scaling', () => {
    for (const ratio of [1, 1.25, 1.5, 2]) {
      for (const pct of [0, 12.345, 50.1, 99.99]) {
        const style = pixelAlignedCursor(pct, 23.375, 1049.5, ratio);
        const start = (style.left + 23.375) * ratio;
        const end = (style.left + 23.375 + style.width) * ratio;
        expect(start).toBeCloseTo(Math.round(start), 8);
        expect(end).toBeCloseTo(Math.round(end), 8);
        expect(style.width * ratio).toBe(Math.max(1, Math.round(ratio)));
      }
    }
  });
});
