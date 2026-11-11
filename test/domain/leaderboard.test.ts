import { describe, it, expect } from 'vitest';
import { findLayoutBenchmark } from '../../shared/domain/leaderboard.js';
import type { ReferenceLaptimeEntry } from '../../shared/types/index.js';

describe('findLayoutBenchmark', () => {
  const entry = (trackName: string, carClass: string): ReferenceLaptimeEntry => ({
    key: `${trackName}_${carClass}`,
    trackName,
    carClass,
    patch: '1.4',
    targets: { alienSec: 100 },
  } as ReferenceLaptimeEntry);

  it('takes the target of the layout and class, and never another class', () => {
    const entries = [entry('Monza', 'Hyper'), entry('Monza', 'GT3')];
    expect(findLayoutBenchmark(entries, 'monza_gp', 'GT3')?.carClass).toBe('GT3');
    expect(findLayoutBenchmark([entries[0]], 'monza_gp', 'GT3')).toBeNull();
  });
});
