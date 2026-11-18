import { describe, expect, it } from 'vitest';
import { slowestDistInRange } from '../../../src/utils/cornerAnalysis/helpers.js';
import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';

describe('slowestDistInRange', () => {
  it('finds the slowest sample in range, a sample without a speed a gap rather than a stop', () => {
    const points = [120, undefined, 80, 95, 60].map(speedKmh => ({ speedKmh }) as ReplayTrajectoryPoint);
    const dists = [10, 20, 30, 40, 50];
    expect(slowestDistInRange(points, dists, 10, 45)).toBe(30);
    expect(slowestDistInRange(points, dists, 15, 25)).toBeUndefined();
  });
});
