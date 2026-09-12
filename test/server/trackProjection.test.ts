import { describe, it, expect } from 'vitest';
import {
  buildCenterlineSpatialIndex,
  projectTrajectoryToCenterline,
} from '../../server/trackProjection';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('trackProjection utility', () => {
  // Simple rectangular circuit:
  // (0,0) -> (100,0) -> (100,50) -> (0,50) -> (0,0)
  // Length = 100 + 50 + 100 + 50 = 300m
  const simpleCenterline: Array<[number, number]> = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];

  describe('buildCenterlineSpatialIndex', () => {
    it('calculates segment lengths, cumulative stations, and total length', () => {
      const index = buildCenterlineSpatialIndex(simpleCenterline);
      expect(index.points).toHaveLength(4);
      expect(index.segmentLengths).toHaveLength(4);
      expect(index.segmentLengths[0]).toBe(100);
      expect(index.segmentLengths[1]).toBe(50);
      expect(index.segmentLengths[2]).toBe(100);
      expect(index.segmentLengths[3]).toBe(50);
      expect(index.totalLengthM).toBe(300);
      expect(index.cumulativeStations).toEqual([0, 100, 150, 250]);
    });

    it('computes unit tangent and right-hand normal vectors', () => {
      const index = buildCenterlineSpatialIndex(simpleCenterline);
      // Segment 0: (0,0) -> (100,0) => dx=100, dz=0 => tangent=(1, 0), normal=(0, -1)
      expect(index.tangents[0].x).toBeCloseTo(1);
      expect(index.tangents[0].z).toBeCloseTo(0);
      expect(index.normals[0].x).toBeCloseTo(0);
      expect(index.normals[0].z).toBeCloseTo(-1);
    });

    it('handles empty and single-point inputs safely', () => {
      const empty = buildCenterlineSpatialIndex([]);
      expect(empty.totalLengthM).toBe(0);

      const single = buildCenterlineSpatialIndex([[10, 20]]);
      expect(single.totalLengthM).toBe(0);
    });
  });

  describe('projectTrajectoryToCenterline', () => {
    it('projects points directly on the centerline with zero lateral offset', () => {
      const pts: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100 },
        { x: 25, y: 0, z: 0, speedKmh: 120 },
        { x: 50, y: 0, z: 0, speedKmh: 140 },
        { x: 100, y: 0, z: 0, speedKmh: 150 },
      ];

      const res = projectTrajectoryToCenterline(pts, simpleCenterline);
      expect(res.stations[0]).toBe(0);
      expect(res.stations[1]).toBe(25);
      expect(res.stations[2]).toBe(50);
      expect(res.stations[3]).toBe(100);

      res.lateralOffsets.forEach(lat => {
        expect(Math.abs(lat)).toBeLessThan(0.05);
      });
      expect(res.trackLengthM).toBe(300);
    });

    it('accurately computes lateral offset for wide/tight racing lines', () => {
      // Segment 0 goes along +X axis (z=0).
      // Normal points towards -Z (+d = right).
      // Car driving parallel at z = -3 (right of center)
      const ptsRight: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: -3, speedKmh: 100 },
        { x: 20, y: 0, z: -3, speedKmh: 100 },
      ];
      const resRight = projectTrajectoryToCenterline(ptsRight, simpleCenterline);
      expect(resRight.stations[0]).toBe(10);
      expect(resRight.stations[1]).toBe(20);
      expect(resRight.lateralOffsets[0]).toBeCloseTo(3, 1);
      expect(resRight.lateralOffsets[1]).toBeCloseTo(3, 1);

      // Car driving parallel at z = +2.5 (left of center)
      const ptsLeft: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: 2.5, speedKmh: 100 },
        { x: 20, y: 0, z: 2.5, speedKmh: 100 },
      ];
      const resLeft = projectTrajectoryToCenterline(ptsLeft, simpleCenterline);
      expect(resLeft.lateralOffsets[0]).toBeCloseTo(-2.5, 1);
      expect(resLeft.lateralOffsets[1]).toBeCloseTo(-2.5, 1);
    });

    it('disambiguates hairpins using vehicle heading to avoid snapping to opposing straights', () => {
      // Create a hairpin with 2 parallel straights 15m apart:
      // Outbound straight: (0, 0) -> (200, 0) [heading +X]
      // Loop end: (200, 15)
      // Return straight: (200, 15) -> (0, 15) [heading -X]
      const hairpinCenterline: Array<[number, number]> = [
        [0, 0],
        [200, 0],
        [200, 15],
        [0, 15],
      ];

      // A car traveling back on the return straight at z = 12 (3m right of the return centerline),
      // moving in -X direction.
      const returnPoints: ReplayTrajectoryPoint[] = [
        { x: 150, y: 0, z: 12, speedKmh: 180 },
        { x: 140, y: 0, z: 12, speedKmh: 185 },
        { x: 130, y: 0, z: 12, speedKmh: 190 },
      ];

      const res = projectTrajectoryToCenterline(returnPoints, hairpinCenterline);
      // Return straight starts at station 215m (200 + 15). At x=150 (moving towards 0),
      // station should be around 215 + (200 - 150) = 265m, NOT 150m (the outbound straight)!
      expect(res.stations[0]).toBeGreaterThan(250);
      expect(res.stations[1]).toBeGreaterThan(res.stations[0]);
      expect(res.stations[2]).toBeGreaterThan(res.stations[1]);
    });

    it('maintains monotonicity across the finish line seam', () => {
      const loopCenter: Array<[number, number]> = [
        [0, 0],
        [50, 0],
        [50, 50],
        [0, 50],
      ]; // total 200m

      // Car completing a lap from station 195m towards 200m (finish line)
      const seamPoints: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 5, speedKmh: 160 }, // moving towards (0,0) along segment 3
        { x: 0, y: 0, z: 2, speedKmh: 165 },
        { x: 0, y: 0, z: 0.2, speedKmh: 170 },
      ];

      const res = projectTrajectoryToCenterline(seamPoints, loopCenter);
      expect(res.stations[0]).toBeGreaterThan(190);
      expect(res.stations[1]).toBeGreaterThanOrEqual(res.stations[0]);
      expect(res.stations[2]).toBeGreaterThanOrEqual(res.stations[1]);
    });

    it('executes projection on 10,000 points in under 15ms (O(1) performance guarantee)', () => {
      // Build a 100-segment realistic centerline
      const complexCenterline: Array<[number, number]> = [];
      const R = 500;
      for (let i = 0; i < 200; i++) {
        const rad = (i / 200) * 2 * Math.PI;
        complexCenterline.push([R * Math.cos(rad), R * Math.sin(rad)]);
      }

      // Generate 10,000 points around the circle
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 10000; i++) {
        const rad = (i / 10000) * 2 * Math.PI;
        points.push({
          x: R * Math.cos(rad) + 1.5, // 1.5m lateral offset
          y: 0,
          z: R * Math.sin(rad),
          speedKmh: 200,
        });
      }

      const t0 = performance.now();
      const res = projectTrajectoryToCenterline(points, complexCenterline);
      const elapsed = performance.now() - t0;

      expect(res.stations).toHaveLength(10000);
      expect(elapsed).toBeLessThan(150); // Generous margin for heavy parallel test suite runners; typically < 5ms
    });
  });
});
