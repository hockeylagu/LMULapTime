import { describe, it, expect } from 'vitest';
import {
  interpolatePointAtDistance,
  computeLapComparisons,
} from '../../src/utils/replayComparison.js';
import {
  computeCumulativeDistances,
  findIndexAtDistance,
  computeStartFinishOffset,
  getTrajectoryDistances,
  getMonotonicStations,
  interpolateScalarAtDistance,
} from '../../src/utils/lapAlignment.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

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

    it('interpolates 4-corner wheel dynamics smoothly between distance nodes', () => {
      const pointsWithWheels: ReplayTrajectoryPoint[] = [
        {
          x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0,
          rideHeight: [20, 20, 30, 30],
          wheelSpeeds: [100, 100, 100, 100],
          tirePressures: [180, 180, 190, 190],
          tireWear: [100, 100, 100, 100],
          tireTemps: [80, 80, 90, 90],
          brakeTemps: [400, 400, 300, 300],
        },
        {
          x: 10, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1,
          rideHeight: [30, 30, 40, 40],
          wheelSpeeds: [120, 120, 120, 120],
          tirePressures: [182, 182, 192, 192],
          tireWear: [98, 98, 96, 96],
          tireTemps: [90, 90, 100, 100],
          brakeTemps: [500, 500, 400, 400],
        },
      ];
      const cumDists = [0, 10];

      // Interpolate at 5m (exactly 50% between node 0 and 1)
      const pt = interpolatePointAtDistance(pointsWithWheels, cumDists, 5);

      expect(pt.rideHeight).toEqual([25, 25, 35, 35]);
      expect(pt.wheelSpeeds).toEqual([110, 110, 110, 110]);
      expect(pt.tirePressures).toEqual([181, 181, 191, 191]);
      expect(pt.tireWear).toEqual([99, 99, 98, 98]);
      expect(pt.tireTemps).toEqual([85, 85, 95, 95]);
      expect(pt.brakeTemps).toEqual([450, 450, 350, 350]);
    });

    it('clamps gracefully if distance is out of bounds', () => {
      const cumDists = [0, 10, 30];
      const before = interpolatePointAtDistance(mockPoints, cumDists, -5);
      expect(before.x).toBe(0);

      const after = interpolatePointAtDistance(mockPoints, cumDists, 50);
      expect(after.x).toBe(30);
    });

    describe('boundary extrapolation uses the same precision and channels as interior samples', () => {
      const rawPoints: ReplayTrajectoryPoint[] = [
        {
          x: 0, y: 0, z: 0, speedKmh: 160.1551, throttle: 99.6, brake: 0, steerYaw: 0.04, timeSec: 10,
          fuel: 41.23456, soc: 55.54, virtualEnergy: 80.04, regenRate: 12.34, isOffTrack: false,
          wheelSpeeds: [160.04, 160.06, 159.97, 160.01], rideHeight: [40.04, 40.06, 60.01, 60.04],
          tirePressures: [170.04, 171.06, 168.97, 169.01],
        },
        {
          x: 8, y: 0, z: 0, speedKmh: 161.8448, throttle: 100, brake: 0, steerYaw: 0.06, timeSec: 10.18,
          fuel: 41.23, soc: 55.5, virtualEnergy: 80, regenRate: 12, isOffTrack: false,
          wheelSpeeds: [161.5, 161.6, 161.4, 161.5], rideHeight: [40, 40, 60, 60],
          tirePressures: [170, 171, 169, 169],
        },
      ];
      const cumDists = [8, 16];

      it('rounds the first sample, held before it (first playback frame)', () => {
        const point = interpolatePointAtDistance(rawPoints, cumDists, 0, 10);
        expect(Number.isInteger(point.speedKmh)).toBe(true);
        expect(point.speedKmh).toBe(160);
        expect(point.x).toBe(0);
        expect(point.timeSec).toBe(0);
        expect(point.throttle).toBe(100);
        expect(point.fuel).toBe(41.23);
        expect(point.soc).toBe(55.5);
        expect(point.isOffTrack).toBe(false);
      });

      it('rounds and keeps every channel past the last sample', () => {
        const point = interpolatePointAtDistance(rawPoints, cumDists, 20, 10);
        expect(Number.isInteger(point.speedKmh)).toBe(true);
        expect(point.wheelSpeeds).toEqual([161.5, 161.6, 161.4, 161.5]);
        expect(point.rideHeight).toEqual([40, 40, 60, 60]);
        expect(point.tirePressures).toEqual([170, 171, 169, 169]);
        expect(point.regenRate).toBe(12);
      });

      it('rounds held samples when clamping without extrapolation', () => {
        const point = interpolatePointAtDistance(rawPoints, cumDists, 0, 10);
        expect(point.speedKmh).toBe(160);
        expect(point.wheelSpeeds).toEqual([160, 160.1, 160, 160]);
      });
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

    it('reports the delta at the finish line for samples recorded past it (clamped to station L)', () => {
      // Straight 1000 m lap along +x. Primary: 50 m/s, recorded 20 m past the line (a finish the
      // server couldn't cut clamps those samples' station to L). Baseline: 50.5 m/s, line to line.
      // True lap delta = 1000/50 - 1000/50.5 = 0.198 s.
      const trackLengthM = 1000;
      const lap = (speedMps: number, fromX: number, toX: number): ReplayTrajectoryPoint[] => {
        const points: ReplayTrajectoryPoint[] = [];
        for (let x = fromX; x <= toX; x += 10) {
          points.push({ x, y: 0, z: 0, distM: x - fromX, stationM: Math.min(x, trackLengthM), timeSec: 100 + x / speedMps, speedKmh: speedMps * 3.6 });
        }
        return points;
      };
      const primary = lap(50, 0, 1020);
      const baseline = lap(50.5, 0, 1000);
      const comps = computeLapComparisons(primary, baseline, trackLengthM);
      const trueDelta = 1000 / 50 - 1000 / 50.5;
      for (let i = primary.findIndex(p => p.stationM === trackLengthM); i < comps.length; i++) {
        expect(comps[i].deltaTimeSec, `sample ${i} at/after the line`).toBeCloseTo(trueDelta, 2);
      }
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

  describe('computeStartFinishOffset / getTrajectoryDistances alignment', () => {
    function withStation(points: ReplayTrajectoryPoint[], stations: number[]): ReplayTrajectoryPoint[] {
      return points.map((p, i) => ({ ...p, distM: p.x, stationM: stations[i] }));
    }

    it('returns null when canonical stationM is not available', () => {
      const points: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 1 },
      ];
      expect(computeStartFinishOffset(points)).toBeNull();
      // getTrajectoryDistances stays unmodified (no stationM to correct against)
      expect(getTrajectoryDistances(points)).toEqual([0, 10]);
    });

    it('does not "correct" large drift, treating it as a genuinely unrecognized split', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 1 },
      ];
      const points = withStation(raw, [500, 510]); // nowhere near the line - not a trim artifact
      expect(computeStartFinishOffset(points)).toBeNull();
      expect(getTrajectoryDistances(points)).toEqual([0, 10]);
    });

    it('normalizes a station near trackLengthM to a small negative drift (wrap-around)', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 1 },
      ];
      const trackLengthM = 1000;
      // The recording includes a couple of samples from just before the line wrapped in
      const points = withStation(raw, [998, 1008 % trackLengthM || 8]);
      const crossing = computeStartFinishOffset(points, trackLengthM);
      expect(crossing).not.toBeNull();
      // True line is ~2m after points[0]
      expect(crossing!.distMOffset).toBeCloseTo(2, 1);
    });

    it('finds crossing when it occurs between index 2 and index 3', () => {
      const trackLengthM = 1000;
      const raw: ReplayTrajectoryPoint[] = [
        { x: -15, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.0 },
        { x: -10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.1 },
        { x: -5, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.2 },
        { x: 5, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.4 },
        { x: 10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.5 },
      ];
      // Crossing is between index 2 (station 995 -> -5) and index 3 (station 5)
      const points = withStation(raw, [985, 990, 995, 5, 10]);
      const crossing = computeStartFinishOffset(points, trackLengthM);
      expect(crossing).not.toBeNull();
      // Crossing is halfway between index 2 (t=10.2, s=-5) and index 3 (t=10.4, s=5) => t=10.3s
      expect(crossing!.timeSecOffset).toBeCloseTo(10.3, 2);
      expect(crossing!.distMOffset).toBeCloseTo(0, 1);
      expect(crossing!.worldX).toBeCloseTo(0, 1);
    });

    it('does not extrapolate a recording that starts after the start/finish line (the server puts laps on it)', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 5, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1.0 },
        { x: 15, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1.2 },
      ];
      expect(computeStartFinishOffset(withStation(raw, [5, 15]), 1000)).toBeNull();
    });

    it('finds the crossing at the first sample of a lap the server put on the line', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 0.9, distM: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1.1, distM: 10 },
      ];
      const crossing = computeStartFinishOffset(withStation(raw, [0, 10]), 1000);
      expect(crossing).toEqual({ distMOffset: 0, timeSecOffset: 0.9, worldX: 0, worldZ: 0 });
    });

    it('rejects crossing if distMOffset exceeds MAX_START_FINISH_CORRECTION_M even when station wraps', () => {
      const trackLengthM = 1000;
      // Station wraps between index 1 and index 2 (from 998 to 2), but distM at index 1 is 50m (> 25m)
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 10, distM: 40 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 11, distM: 50 },
        { x: 20, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 12, distM: 60 },
      ];
      const points = [
        { ...raw[0], stationM: 995 },
        { ...raw[1], stationM: 998 },
        { ...raw[2], stationM: 2 },
      ];
      // Crossing is at distM ~53.3m, which exceeds 25m threshold -> must reject
      expect(computeStartFinishOffset(points, trackLengthM)).toBeNull();
    });
  });

  describe('getMonotonicStations', () => {
    it('unwraps boundary stations into continuous monotonic values', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0, stationM: 995 },
        { x: 5, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0.1, stationM: 998 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0.2, stationM: 2 },
        { x: 15, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0.3, stationM: 8 },
      ];
      const stations = getMonotonicStations(raw, 1000);
      expect(stations[0]).toBeCloseTo(-5);
      expect(stations[1]).toBeCloseTo(-2);
      expect(stations[2]).toBeCloseTo(2);
      expect(stations[3]).toBeCloseTo(8);
    });
  });

  describe('cross-driver canonical reference matching', () => {
    it('shows no delta between two drivers at the same speed whose recordings start at different trims', () => {
      const trackLengthM = 2000;
      // Driver A: the lap cut at the line (t=10.1s, speed 50 m/s)
      const primary: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.1, stationM: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 11.1, stationM: 50 },
        { x: 100, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 12.1, stationM: 100 },
      ];

      // Driver B (opponent): the replay sliced the lap 10 m after the line (t=50.2s at 50 m/s); the
      // server extended it back to the line (station 0 at t=50.0s, see LapEndCut).
      const baseline: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 50.0, stationM: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 50.2, stationM: 10 },
        { x: 60, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 51.2, stationM: 60 },
        { x: 110, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 52.2, stationM: 110 },
      ];

      const comparisons = computeLapComparisons(primary, baseline, trackLengthM);
      expect(comparisons.length).toBe(primary.length);

      // At station 0 (the physical start/finish line, index 0):
      // Primary crossed at t_norm = 10.1 - 10.1 = 0.0s
      // Baseline crossed at t_norm = 0.0s
      // Therefore, delta at start/finish line MUST be exactly 0.000s!
      expect(comparisons[0].deltaTimeSec).toBeCloseTo(0.0, 2);

      // And at all subsequent points, since both drivers are traveling at the identical speed (50 m/s),
      // the delta remains 0.000s everywhere!
      for (const comp of comparisons) {
        expect(comp.deltaTimeSec).toBeCloseTo(0.0, 2);
      }
    });

    it('holds the end samples beyond the recorded range (a lap is never extrapolated)', () => {
      const points: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 1.0 },
        { x: 20, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1.5 },
      ];
      const cumDists = [10, 20];
      expect(interpolatePointAtDistance(points, cumDists, -200, 0)).toMatchObject({ x: 10, speedKmh: 100, timeSec: 1 });
      expect(interpolatePointAtDistance(points, cumDists, 500, 0)).toMatchObject({ x: 20, speedKmh: 120, timeSec: 1.5 });
      expect(interpolateScalarAtDistance([100, 120], cumDists, -200)).toBe(100);
      expect(interpolateScalarAtDistance([100, 120], cumDists, 500)).toBe(120);
    });

    it('populates all secondary telemetry channels at lower boundary points', () => {
      const fullPoint: ReplayTrajectoryPoint = {
        x: 0, y: 0, z: 0,
        speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0.1,
        timeSec: 10.0,
        engineRpm: 7500,
        tireTemps: [80, 82, 85, 84],
        tireWear: [98, 97, 98, 97],
        brakeTemps: [450, 455, 420, 425],
        rideHeight: [35, 36, 45, 46],
        wheelSpeeds: [150, 150, 151, 151],
        tirePressures: [170, 172, 175, 174],
        lateralOffsetM: 1.25,
        accelLonG: 0.8,
        accelLatG: 1.5,
        accelTotalG: 1.7,
        yawRateDeg: 12.5,
        slipAngleDeg: 2.1,
        understeerDeg: 0.5,
        tireSlipPct: 4.2,
        wheelLockActive: false,
      };
      const secondPoint: ReplayTrajectoryPoint = { ...fullPoint, x: 10, timeSec: 10.2 };

      // Lower boundary (targetDist <= cumDists[0])
      const ptExact = interpolatePointAtDistance([fullPoint, secondPoint], [0, 10], 0, 10.0);
      expect(ptExact.engineRpm).toBe(7500);
      expect(ptExact.tireTemps).toEqual([80, 82, 85, 84]);
      expect(ptExact.lateralOffsetM).toBe(1.25);
      expect(ptExact.accelLonG).toBe(0.8);
      expect(ptExact.slipAngleDeg).toBe(2.1);
    });
  });

  describe('findIndexAtDistance', () => {
    it('finds the closest index for an exact and an in-between distance', () => {
      const dists = [0, 10, 20, 30, 40];
      expect(findIndexAtDistance(dists, 20)).toBe(2);
      expect(findIndexAtDistance(dists, 22)).toBe(2);
      expect(findIndexAtDistance(dists, 28)).toBe(3);
    });

    it('clamps to the first/last index when out of range', () => {
      const dists = [0, 10, 20];
      expect(findIndexAtDistance(dists, -5)).toBe(0);
      expect(findIndexAtDistance(dists, 100)).toBe(2);
    });

    it('returns 0 for an empty distance array', () => {
      expect(findIndexAtDistance([], 10)).toBe(0);
    });
  });
});


