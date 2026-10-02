import { describe, it, expect } from 'vitest';
import { formatDuration, countReplays, versionStatus } from '../../../src/components/settings/replays/replayModel.js';

describe('formatDuration', () => {
  it('rounds the total before splitting so seconds never read 60', () => {
    expect(formatDuration(59.5)).toBe('1:00');
    expect(formatDuration(839.6)).toBe('14:00');
    expect(formatDuration(839.4)).toBe('13:59');
  });

  it('shows minutes past an hour without an hours column', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('shows a dash for missing or unusable values', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('versionStatus', () => {
  const r = (isOnDisk: boolean, replayVersion: string) => ({ filename: `${replayVersion}${isOnDisk}.Vcr`, isOnDisk, replayVersion }) as never;

  it('names archived replays kept at older versions next to current on-disk ones', () => {
    const counts = countReplays([r(true, 'v7'), r(false, 'v3'), r(false, 'v3'), r(false, 'v7')], 'v7');
    expect(counts.outdated).toBe(0);
    expect(counts.archivedBehind).toBe(2);
    expect(versionStatus(counts, 'v7')).toBe('All on-disk replays are at v7 · 2 archived kept at older versions');
  });

  it('counts on-disk replays waiting for the upgrade', () => {
    const counts = countReplays([r(true, 'v5'), r(true, 'v6')], 'v7');
    expect(versionStatus(counts, 'v7')).toBe('2 on-disk replays are behind v7 and will be upgraded in the background');
  });

  it('claims nothing when the current version is unknown', () => {
    const counts = countReplays([r(true, 'v5'), r(false, 'v3')], null);
    expect(counts.outdated).toBe(0);
    expect(versionStatus(counts, null)).toBeNull();
  });
});
