import { describe, expect, it } from 'vitest';
import { ReplayFileProgress } from '../../../../server/core/replay/replayFileProgress.js';

describe('ReplayFileProgress', () => {
  it('advances across drivers and reaches 100 only after the last storage operation', () => {
    const progress = new ReplayFileProgress(2);
    const values = [progress.decoding(80), progress.decoding(100), progress.saving(), progress.complete(),
      progress.decoding(5), progress.decoding(80), progress.decoding(100), progress.saving()];
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.every(value => value < 100)).toBe(true);
    expect(progress.complete()).toBe(100);
  });

  it('accounts for the primary decode satisfying a queued driver without moving backward', () => {
    const progress = new ReplayFileProgress(3);
    const before = progress.decoding(100);
    progress.removeDuplicate();
    expect(progress.saving()).toBeGreaterThanOrEqual(before);
    expect(progress.complete()).toBeLessThan(100);
    expect(progress.decoding(5)).toBeGreaterThanOrEqual(52);
    expect(progress.complete()).toBe(100);
  });

  it('reserves saving progress when only one uncached driver remains', () => {
    const progress = new ReplayFileProgress(1);
    expect(progress.decoding(100)).toBe(95);
    expect(progress.saving()).toBe(95);
    expect(progress.complete()).toBe(100);
  });

  it('retains progress if a failed primary decode leaves its explicit slot to attempt', () => {
    const progress = new ReplayFileProgress(3);
    progress.removeDuplicate();
    const before = progress.decoding(100);
    progress.restoreDuplicate();
    expect(progress.complete()).toBeGreaterThanOrEqual(before);
    expect(progress.decoding(5)).toBeGreaterThanOrEqual(before);
    expect(progress.complete()).toBeLessThan(100);
    expect(progress.complete()).toBe(100);
  });
});
