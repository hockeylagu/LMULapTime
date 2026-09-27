import { describe, it, expect } from 'vitest';
import { formatSessionAxisLabel } from '../../../src/components/track-detail/improvement-chart/improvementChartUtils.js';

describe('formatSessionAxisLabel', () => {
  it('puts the month and day in front of the session name', () => {
    expect(formatSessionAxisLabel('2026/09/25 18:27:33', 'R1')).toBe('09/25 R1');
    expect(formatSessionAxisLabel('2026-08-28 20:51:52', 'P1')).toBe('08/28 P1');
  });

  it('keeps the session name alone when the date cannot be read', () => {
    expect(formatSessionAxisLabel('', 'Q1')).toBe('Q1');
  });
});
