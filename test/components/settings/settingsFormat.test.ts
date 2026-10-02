import { describe, it, expect } from 'vitest';
import { formatBytes, formatDateTime, formatNumber, pluralize } from '../../../src/components/settings/settingsFormat.js';

describe('settingsFormat', () => {
  it('formats numbers with separators and a dash for unknown values', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });

  it('pluralizes by count, including zero and irregular words', () => {
    expect(pluralize(1, 'replay')).toBe('1 replay');
    expect(pluralize(0, 'replay')).toBe('0 replays');
    expect(pluralize(1200, 'lap')).toBe('1,200 laps');
    expect(pluralize(2, 'category', 'categories')).toBe('2 categories');
  });

  it('formats bytes across units and survives invalid input', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.00 GB');
    expect(formatBytes(2 * 1024 ** 5)).toBe('2,048.00 TB');
    for (const bad of [0, -5, Number.NaN, Infinity, null, undefined]) expect(formatBytes(bad)).toBe('0 B');
  });

  it('formats dates and falls back for missing, invalid or epoch values', () => {
    expect(formatDateTime(Date.UTC(2026, 8, 28, 12, 0))).toMatch(/2026/);
    for (const bad of [null, undefined, '', 'nope', 0, 1000, Number.NaN]) expect(formatDateTime(bad)).toBe('—');
    expect(formatDateTime('x', 'Unknown date')).toBe('Unknown date');
  });
});
