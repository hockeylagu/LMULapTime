import { describe, expect, it } from 'vitest';
import { costChangeTone } from '../../../src/components/common/CostSparkline.js';

describe('costChangeTone', () => {
  it('greens a gain from 0.05 s and reds only a rise from 0.15 s, so a progression is not overly negative', () => {
    expect(costChangeTone(-0.05)).toBe('text-lmu-gain');
    expect(costChangeTone(-0.04)).toBe('text-lmu-text-soft');
    expect(costChangeTone(0.11)).toBe('text-lmu-text-soft');
    expect(costChangeTone(0.15)).toBe('text-lmu-loss');
  });
});
