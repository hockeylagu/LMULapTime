import { describe, it, expect } from 'vitest';
import {
  computeCumulativeDistances,
  interpolatePointAtDistance,
  computeLapComparisons,
  filterCompatibleReplays,
} from '../../src/utils/replayComparison';
import { ReplayTrajectoryPoint, ReplaySummary } from '../../server/types';

describe('replayComparison utility', () => {
  const mockPoints: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
    { x: 10, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 5, timeSec: 1 },
    { x: 30, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 2 },
  ];

  describe('computeCumulativeDistances', () => {
    it('calculates cumulative distance along path correctly', () => {
      const dists = computeCumulativeDistances(mockPoints);
      expect(dists).toHaveLength(3);
      expect(dists[0]).toBe(0);
      expect(dists[1]).toBeCloseTo(10);
      expect(dists[2]).toBeCloseTo(30);
    });

    it('filters out teleport anomalies exceeding 60m', () => {
      const teleportPoints: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1 },
        { x: 200, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 2 }, // 190m jump
        { x: 205, y: 0, z: 0, speedKmh: 130, throttle: 90, brake: 0, steerYaw: 0, timeSec: 3 },
      ];
      const dists = computeCumulativeDistances(teleportPoints);
      expect(dists[2]).toBe(10); // jump ignored
      expect(dists[3]).toBe(15);
    });
  });

  describe('interpolatePointAtDistance', () => {
    it('interpolates point attributes smoothly between distance nodes', () => {
      const cumDists = [0, 10, 30];
      // Target at 5m (halfway between node 0 and node 1)
      const pt = interpolatePointAtDistance(mockPoints, cumDists, 5);
      expect(pt.x).toBeCloseTo(5);
      expect(pt.speedKmh).toBe(110);
      expect(pt.throttle).toBe(65);
      expect(pt.timeSec).toBeCloseTo(0.5);
    });

    it('clamps gracefully if distance is out of bounds', () => {
      const cumDists = [0, 10, 30];
      const before = interpolatePointAtDistance(mockPoints, cumDists, -5);
      expect(before.x).toBe(0);

      const after = interpolatePointAtDistance(mockPoints, cumDists, 50);
      expect(after.x).toBe(30);
    });
  });

  describe('computeLapComparisons', () => {
    it('computes time deltas and telemetry deltas normalized across 0-100% distance', () => {
      const primary: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1 },
        { x: 100, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, steerYaw: 0, timeSec: 2 },
      ];

      const baseline: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 90, throttle: 40, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 140, throttle: 90, brake: 0, steerYaw: 0, timeSec: 1.2 },
        { x: 100, y: 0, z: 0, speedKmh: 180, throttle: 90, brake: 0, steerYaw: 0, timeSec: 2.4 },
      ];

      const comparisons = computeLapComparisons(primary, baseline);
      expect(comparisons).toHaveLength(3);

      // Node 0: delta time = 0 - 0 = 0
      expect(comparisons[0].deltaTimeSec).toBe(0);
      expect(comparisons[0].deltaSpeedKmh).toBe(10); // 100 - 90

      // Node 1: delta time = 1.0 - 1.2 = -0.2 (primary is 0.2s faster!)
      expect(comparisons[1].deltaTimeSec).toBeCloseTo(-0.2);
      expect(comparisons[1].deltaSpeedKmh).toBe(10);

      // Node 2: delta time = 2.0 - 2.4 = -0.4s faster
      expect(comparisons[2].deltaTimeSec).toBeCloseTo(-0.4);
      expect(comparisons[2].deltaSpeedKmh).toBe(20);
    });

    it('eliminates boundary glitches at start and end when laps have non-zero session timestamps', () => {
      // Primary lap starts at minute 25 (1500.0s), total lap time is 80.0s
      const primary: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 1500.0 },
        { x: 20, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1540.0 },
        { x: 40, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1580.0 },
      ];

      // Baseline lap comes from a different session starting at minute 90 (5400.0s), total lap time is 80.5s
      const baseline: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 95, throttle: 45, brake: 0, steerYaw: 0, timeSec: 5400.0 },
        { x: 20, y: 0, z: 0, speedKmh: 145, throttle: 90, brake: 0, steerYaw: 0, timeSec: 5440.2 },
        { x: 40, y: 0, z: 0, speedKmh: 195, throttle: 90, brake: 0, steerYaw: 0, timeSec: 5480.5 },
      ];

      const comparisons = computeLapComparisons(primary, baseline);
      expect(comparisons).toHaveLength(3);

      // Start line boundary: MUST be exactly 0 (no multi-thousand second glitch!)
      expect(comparisons[0].deltaTimeSec).toBe(0);
      expect(comparisons[0].baseline.timeSec).toBe(0);

      // Mid-lap: primary (40.0s) vs baseline (40.2s) => delta = -0.2s
      expect(comparisons[1].deltaTimeSec).toBeCloseTo(-0.2, 2);
      expect(comparisons[1].baseline.timeSec).toBeCloseTo(40.2, 2);

      // Finish line boundary: 80.0s vs 80.5s => delta = -0.5s (no end-of-lap glitch!)
      expect(comparisons[2].deltaTimeSec).toBeCloseTo(-0.5, 2);
      expect(comparisons[2].baseline.timeSec).toBeCloseTo(80.5, 2);

      // Scale check: All absolute deltas should be within 1.0 second, NOT skewed by session timestamp offsets
      const maxDelta = Math.max(...comparisons.map(c => Math.abs(c.deltaTimeSec)));
      expect(maxDelta).toBeLessThanOrEqual(1.0);
    });

    it('handles single-point and degenerate trajectories gracefully without NaN or infinite deltas', () => {
      const singlePoint: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 0, throttle: 0, brake: 0, steerYaw: 0, timeSec: 100 },
      ];
      const comps = computeLapComparisons(singlePoint, singlePoint);
      expect(comps).toHaveLength(1);
      expect(comps[0].deltaTimeSec).toBe(0);
      expect(isNaN(comps[0].deltaTimeSec)).toBe(false);
    });
  });

  describe('filterCompatibleReplays', () => {
    const allReplays: ReplaySummary[] = [
      { name: 'Spa_GT3_1.vcr', path: '/Spa_GT3_1.vcr', sizeBytes: 1000, mtime: 1, trackName: 'Spa-Francorchamps', eventTitle: 'LMGT3 Fixed', fileSizeBytes: 1000, mtimeMs: 1 },
      { name: 'Spa_GT3_2.vcr', path: '/Spa_GT3_2.vcr', sizeBytes: 1000, mtime: 2, trackName: 'Circuit de Spa', eventTitle: 'LMGT3 Sprint', fileSizeBytes: 1000, mtimeMs: 2 },
      { name: 'Spa_Hypercar.vcr', path: '/Spa_Hypercar.vcr', sizeBytes: 1000, mtime: 3, trackName: 'Spa-Francorchamps', eventTitle: 'Hypercar Series', fileSizeBytes: 1000, mtimeMs: 3 },
      { name: 'Monza_GT3.vcr', path: '/Monza_GT3.vcr', sizeBytes: 1000, mtime: 4, trackName: 'Autodromo Nazionale Monza', eventTitle: 'LMGT3 Fixed', fileSizeBytes: 1000, mtimeMs: 4 },
    ];

    it('filters replays sharing the same track and car class while excluding current replay', () => {
      const matching = filterCompatibleReplays(
        allReplays,
        'Spa-Francorchamps',
        'LMGT3',
        'Spa_GT3_1.vcr'
      );

      // Should find Spa_GT3_2.vcr (same track Spa + GT3 class), and NOT Monza or Hypercar or itself
      expect(matching.map(r => r.name)).toContain('Spa_GT3_2.vcr');
      expect(matching.map(r => r.name)).not.toContain('Spa_GT3_1.vcr');
      expect(matching.map(r => r.name)).not.toContain('Monza_GT3.vcr');
      expect(matching.map(r => r.name)).not.toContain('Spa_Hypercar.vcr');
    });
  });
});
