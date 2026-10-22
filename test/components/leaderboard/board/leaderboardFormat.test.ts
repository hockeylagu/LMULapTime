import { describe, expect, it } from 'vitest';
import { formatDrivenAgo } from '../../../../src/components/leaderboard/board/leaderboardFormat.js';

describe('formatDrivenAgo', () => {
  it.each([1, 1000])('uses local calendar dates for timestamps scaled by %i', (scale) => {
    const now = new Date(2026, 9, 22, 0, 1).getTime();
    expect(formatDrivenAgo(new Date(2026, 9, 22, 0, 0).getTime() / scale, now)).toBe('today');
    expect(formatDrivenAgo(new Date(2026, 9, 21, 23, 59).getTime() / scale, now)).toBe('yesterday');
    expect(formatDrivenAgo(new Date(2026, 9, 20, 23, 59).getTime() / scale, now)).toBe('2 days ago');
  });

  it.each([
    [2026, 2, 9], // Previous day has 23 hours in America/Toronto.
    [2026, 10, 2], // Previous day has 25 hours in America/Toronto.
    [2026, 0, 1], // Year boundary.
    [2026, 9, 1], // Month boundary.
  ])('counts calendar days across the boundary at %i-%i-%i', (year, month, day) => {
    const now = new Date(year, month, day, 23, 59).getTime();
    expect(formatDrivenAgo(new Date(year, month, day, 0, 0).getTime(), now)).toBe('today');
    expect(formatDrivenAgo(new Date(year, month, day - 1, 0, 0).getTime(), now)).toBe('yesterday');
    expect(formatDrivenAgo(new Date(year, month, day - 2, 23, 59).getTime(), now)).toBe('2 days ago');
  });

  it.each([
    [5, '5 days ago'], [14, '2 weeks ago'], [60, '2 months ago'], [730, '2 years ago'],
  ] as const)('retains the age label for %i calendar days', (days, expected) => {
    const now = new Date(2026, 9, 22, 12).getTime();
    expect(formatDrivenAgo(new Date(2026, 9, 22 - days, 12).getTime(), now)).toBe(expected);
  });

  it('groups weeks in seven calendar days, including across daylight-saving changes', () => {
    const now = new Date(2026, 2, 16, 0, 1).getTime();
    expect(formatDrivenAgo(new Date(2026, 2, 2, 23, 59).getTime(), now)).toBe('2 weeks ago');
  });

  it.each([
    [new Date(2026, 0, 31), new Date(2026, 2, 1), '2 months ago'],
    [new Date(2024, 11, 31), new Date(2026, 11, 1), '2 years ago'],
  ] as const)('counts calendar months and years from %s to %s', (driven, now, expected) => {
    expect(formatDrivenAgo(driven.getTime(), now.getTime())).toBe(expected);
  });
});
