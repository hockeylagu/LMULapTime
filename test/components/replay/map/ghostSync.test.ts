import { describe, expect, it } from 'vitest';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import {
  createGhostClock, ghostDistanceAt, nextGhostSyncMode, parseGhostSyncMode,
} from '../../../../src/components/replay/map/ghostSync.js';

const lap = (timeAt: (distM: number) => number): ReplayTrajectoryPoint[] =>
  Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0, z: 0, distM: i * 10, timeSec: 100 + timeAt(i * 10) }));
// Primary: 10 m/s all lap. Baseline: 20 m/s to 50 m, then 10 m/s like the primary.
const primary = lap(d => d / 10);
const baseline = lap(d => (d <= 50 ? d / 20 : 2.5 + (d - 50) / 10));
const dists = primary.map(p => p.distM!);
const clock = createGhostClock(primary, dists, baseline, dists)!;

describe('ghostDistanceAt', () => {
  it('keeps the ghost at the primary distance in distance mode', () => {
    expect(ghostDistanceAt(clock, 'distance', 20, null)).toBe(20);
  });

  it('places the ghost where the baseline was at the same lap time', () => {
    // At 20 m the primary has run 2 s; the baseline had covered 40 m by then.
    expect(ghostDistanceAt(clock, 'time', 20, null)).toBeCloseTo(40);
    // The baseline finished its lap first: it waits on the line.
    expect(ghostDistanceAt(clock, 'time', 80, null)).toBeCloseTo(100);
  });

  it('runs the cars together up to marker A, then on time since each passed it', () => {
    expect(ghostDistanceAt(clock, 'anchored', 40, 50)).toBe(40);
    // Same speed after A: still level 20 m later, though the baseline was 2.5 s up at A.
    expect(ghostDistanceAt(clock, 'anchored', 70, 50)).toBeCloseTo(70);
    // From A at 20 m the baseline pulls away again until 50 m.
    expect(ghostDistanceAt(clock, 'anchored', 30, 20)).toBeCloseTo(40);
  });

  it('runs anchored from the lap start without a marker', () => {
    expect(ghostDistanceAt(clock, 'anchored', 20, null)).toBeCloseTo(ghostDistanceAt(clock, 'time', 20, null));
  });
});

describe('ghost sync modes', () => {
  it('reads the URL value, defaulting to distance', () => {
    expect(parseGhostSyncMode('time')).toBe('time');
    expect(parseGhostSyncMode('anchored')).toBe('anchored');
    expect(parseGhostSyncMode('bogus')).toBe('distance');
    expect(parseGhostSyncMode(null)).toBe('distance');
  });

  it('cycles distance, time, anchored, skipping anchored without marker A', () => {
    expect(nextGhostSyncMode('distance', true)).toBe('time');
    expect(nextGhostSyncMode('time', true)).toBe('anchored');
    expect(nextGhostSyncMode('anchored', true)).toBe('distance');
    expect(nextGhostSyncMode('time', false)).toBe('distance');
  });

  it('needs both laps', () => {
    expect(createGhostClock(primary, dists, [], [])).toBeNull();
  });
});
