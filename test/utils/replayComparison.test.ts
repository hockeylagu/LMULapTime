import { describe, it, expect } from 'vitest';
import {
  computeCumulativeDistances,
  interpolatePointAtDistance,
  computeLapComparisons,
  findIndexAtDistance,
  filterCompatibleReplays,
  mapVehicleIdToClass,
  computeStartFinishOffset,
  getTrajectoryDistances,
  getMonotonicStations,
  getNormalizedTrajectoryTimes,
  interpolateScalarAtDistance,
} from '../../src/utils/replayComparison.js';
import { ReplayTrajectoryPoint, ReplaySummary } from '../../server/core/types.js';

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

    it('interpolates a small positive offset when the recording starts just past the line', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 1 },
        { x: 20, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: 2 },
      ];
      // Recording actually starts 4m past the true line (stationM=4 at index 0)
      const points = withStation(raw, [4, 14, 24]);

      const crossing = computeStartFinishOffset(points);
      expect(crossing).not.toBeNull();
      expect(crossing!.distMOffset).toBeCloseTo(-4, 5); // true line is 4m before points[0]
      expect(crossing!.worldX).toBeCloseTo(-4, 5);

      const dists = getTrajectoryDistances(points);
      expect(dists[0]).toBeCloseTo(4, 5); // now measured from the true line, not from points[0]
    });

    it('rebases two independently-trimmed recordings of the same lap onto the same reference', () => {
      // Two recordings of the "same" lap, each trimmed a few meters differently around the
      // physical line - without correction these would be compared at the wrong track position.
      const rawA: ReplayTrajectoryPoint[] = [0, 10, 20, 30].map((x, i) => ({
        x, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: i,
      }));
      const rawB: ReplayTrajectoryPoint[] = [0, 10, 20, 30].map((x, i) => ({
        x, y: 0, z: 0, speedKmh: 100, throttle: 0, brake: 0, steerYaw: 0, timeSec: i,
      }));
      const pointsA = withStation(rawA, [3, 13, 23, 33]); // trimmed 3m late
      const pointsB = withStation(rawB, [1, 11, 21, 31]); // trimmed 1m late

      const distsA = getTrajectoryDistances(pointsA);
      const distsB = getTrajectoryDistances(pointsB);

      // Both arrays now read 0 at the same physical crossing, not at their own point[0]
      expect(distsA[0]).toBeCloseTo(3, 5);
      expect(distsB[0]).toBeCloseTo(1, 5);
      // Without alignment, "distance 10" would mean different physical spots for A and B
      // (each 2m apart from the true line); aligned, both now agree on where 0 actually is.
      expect(distsA[0] - distsB[0]).toBeCloseTo(2, 5);
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

    it('extrapolates timeSecOffset backward when lap recording starts after the start/finish line', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 5, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1.0 },
        { x: 15, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1.2 },
      ];
      // Car is at station 5m at t=1.0s, and station 15m at t=1.2s (delta_s = 10m in 0.2s = 50m/s)
      // True start/finish line (s=0) was 5m earlier => 0.1s earlier => t=0.9s
      const points = withStation(raw, [5, 15]);
      const crossing = computeStartFinishOffset(points, 1000);
      expect(crossing).not.toBeNull();
      expect(crossing!.timeSecOffset).toBeCloseTo(0.9, 2);
      expect(crossing!.distMOffset).toBeCloseTo(0, 2);
      expect(crossing!.worldX).toBeCloseTo(0, 2);
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

  describe('getMonotonicStations and getNormalizedTrajectoryTimes', () => {
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

    it('normalizes times relative to physical start/finish crossing', () => {
      const raw: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 100.0, stationM: 995 },
        { x: 10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 100.2, stationM: 5 },
      ];
      // Crossing is at station 0, halfway between 100.0s and 100.2s => t_SF = 100.1s
      const normTimes = getNormalizedTrajectoryTimes(raw, 1000);
      expect(normTimes[0]).toBeCloseTo(-0.1, 2);
      expect(normTimes[1]).toBeCloseTo(0.1, 2);
    });
  });

  describe('cross-driver canonical reference matching', () => {
    it('eliminates delta jump at start/finish line between drivers starting at different trims', () => {
      const trackLengthM = 2000;
      // Driver A: starts 5m before line (station 1995 -> -5) at t=10.0s, crosses line at t=10.1s (s=0, speed 50m/s)
      const primary: ReplayTrajectoryPoint[] = [
        { x: -5, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.0, stationM: 1995 },
        { x: 0, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 10.1, stationM: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 11.1, stationM: 50 },
        { x: 100, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 12.1, stationM: 100 },
      ];

      // Driver B (opponent): starts 10m AFTER line (station 10) at t=50.2s, at speed 50m/s (so crossed line at t=50.0s)
      const baseline: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 50.2, stationM: 10 },
        { x: 60, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 51.2, stationM: 60 },
        { x: 110, y: 0, z: 0, speedKmh: 180, throttle: 100, brake: 0, steerYaw: 0, timeSec: 52.2, stationM: 110 },
      ];

      const comparisons = computeLapComparisons(primary, baseline, trackLengthM);
      expect(comparisons.length).toBe(primary.length);

      // At station 0 (the physical start/finish line, index 1):
      // Primary crossed at t_norm = 10.1 - 10.1 = 0.0s
      // Baseline crossed at t_norm = 0.0s (extrapolated backward from 10m @ 50m/s)
      // Therefore, delta at start/finish line MUST be exactly 0.000s!
      expect(comparisons[1].deltaTimeSec).toBeCloseTo(0.0, 2);

      // And at all subsequent points, since both drivers are traveling at the identical speed (50 m/s),
      // the delta remains 0.000s everywhere!
      for (const comp of comparisons) {
        expect(comp.deltaTimeSec).toBeCloseTo(0.0, 2);
      }
    });

    it('extrapolates position and speed linearly when query distance is beyond bounds', () => {
      const points: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 1.0 },
        { x: 20, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1.5 },
      ];
      const cumDists = [10, 20];

      // Query before the start (-5m before cumDists[0]=10m) with extrapolateBoundary=true
      const ptBefore = interpolatePointAtDistance(points, cumDists, 5, 0, true);
      // Slope for x is (20-10)/(20-10) = 1.0. At dist=5, x = 10 + 1.0 * (5 - 10) = 5
      expect(ptBefore.x).toBeCloseTo(5);
      // Slope for speed is (120-100)/10 = 2 km/h per meter. At dist=5, speed = 100 + 2 * (5 - 10) = 90
      expect(ptBefore.speedKmh).toBeCloseTo(90);
      // Time: slope is 0.5s / 10m = 0.05 s/m. At dist=5, time = 1.0 + 0.05 * (-5) = 0.75s
      expect(ptBefore.timeSec).toBeCloseTo(0.75);
    });

    it('clamps boundary extrapolation to MAX_START_FINISH_CORRECTION_M (25m)', () => {
      const points: ReplayTrajectoryPoint[] = [
        { x: 10, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 1.0 },
        { x: 20, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1.5 },
      ];
      const cumDists = [10, 20];

      // Query way before the start: -200m (cumDists[0] is 10m, so delta is -210m, clamped to 10 - 25 = -15m)
      const ptBefore = interpolatePointAtDistance(points, cumDists, -200, 0, true);
      // Clamped targetDist is -15m:
      // t = (-15 - 10) / 10 = -2.5
      // x = 10 + (-2.5) * (20 - 10) = -15
      expect(ptBefore.x).toBeCloseTo(-15);
      // Speed: 100 + (-2.5) * (120 - 100) = 50 km/h (rather than dropping to 0 or negative)
      expect(ptBefore.speedKmh).toBeCloseTo(50);
      // Time: 1.0 + (-2.5) * 0.5 = -0.25s
      expect(ptBefore.timeSec).toBeCloseTo(-0.25);

      // Scalar interpolation also clamps to 25m
      const scalarBefore = interpolateScalarAtDistance([100, 120], cumDists, -200, true);
      expect(scalarBefore).toBeCloseTo(50);

      // Query way past the end: 500m (maxDist is 20m, clamped to 20 + 25 = 45m)
      // t = (45 - 10) / 10 = 3.5
      const ptAfter = interpolatePointAtDistance(points, cumDists, 500, 0, true);
      expect(ptAfter.x).toBeCloseTo(45);
      const scalarAfter = interpolateScalarAtDistance([100, 120], cumDists, 500, true);
      expect(scalarAfter).toBeCloseTo(170);
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

      // Non-extrapolated lower boundary (targetDist <= cumDists[0])
      const ptExact = interpolatePointAtDistance([fullPoint, secondPoint], [0, 10], 0, 10.0, false);
      expect(ptExact.engineRpm).toBe(7500);
      expect(ptExact.tireTemps).toEqual([80, 82, 85, 84]);
      expect(ptExact.lateralOffsetM).toBe(1.25);
      expect(ptExact.accelLonG).toBe(0.8);
      expect(ptExact.slipAngleDeg).toBe(2.1);

      // Extrapolated lower boundary (targetDist < cumDists[0])
      const ptExtrap = interpolatePointAtDistance([fullPoint, secondPoint], [0, 10], -2, 10.0, true);
      expect(ptExtrap.engineRpm).toBe(7500);
      expect(ptExtrap.tireTemps).toEqual([80, 82, 85, 84]);
      expect(ptExtrap.lateralOffsetM).toBe(1.25);
      expect(ptExtrap.accelLonG).toBe(0.8);
      expect(ptExtrap.slipAngleDeg).toBe(2.1);
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

    it('strictly filters by r.carClass and r.carModel even when eventTitle is absent or generic', () => {
      const realWorldReplays: ReplaySummary[] = [
        {
          name: 'Circuit de Spa-Francorchamps Q1 27.Vcr',
          path: '/Spa_Q1_27.Vcr',
          sizeBytes: 1000,
          mtime: 1,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMGT3',
          carModel: 'BMW M4 GT3',
          eventTitle: 'Practice',
        },
        {
          name: 'Circuit de Spa-Francorchamps P1 79.Vcr',
          path: '/Spa_P1_79.Vcr',
          sizeBytes: 1000,
          mtime: 2,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMH',
          carModel: 'Cadillac V-Series.R',
          eventTitle: 'Practice', // Same eventTitle!
        },
        {
          name: 'Circuit de Spa-Francorchamps P1 80.Vcr',
          path: '/Spa_P1_80.Vcr',
          sizeBytes: 1000,
          mtime: 3,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMP2',
          carModel: 'Oreca 07 LMP2',
          eventTitle: undefined,
        },
        {
          name: 'Circuit de Spa-Francorchamps R1 31.Vcr',
          path: '/Spa_R1_31.Vcr',
          sizeBytes: 1000,
          mtime: 4,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMGT3',
          carModel: 'Ferrari 296 GT3',
          eventTitle: undefined,
        },
      ];

      // When active car is LMGT3 (e.g. BMW M4 GT3 at Spa)
      const matching = filterCompatibleReplays(
        realWorldReplays,
        'Spa-Francorchamps',
        'LMGT3',
        'Circuit de Spa-Francorchamps Q1 27.Vcr'
      );

      // Must ONLY match Spa_R1_31 (LMGT3), and NEVER match Hypercar (P1 79) or LMP2 (P1 80) despite same track & title
      expect(matching.map(r => r.name)).toEqual(['Circuit de Spa-Francorchamps R1 31.Vcr']);

      // When active car is LMH / Hypercar
      const matchingHyper = filterCompatibleReplays(
        realWorldReplays,
        'Spa-Francorchamps',
        'LMH'
      );
      expect(matchingHyper.map(r => r.name)).toEqual(['Circuit de Spa-Francorchamps P1 79.Vcr']);
    });

    it('strictly isolates track layouts (Monza Curva Grande, Bahrain Outer/Paddock, Paul Ricard Short)', () => {
      const layoutReplays: ReplaySummary[] = [
        { name: 'Monza_GP.Vcr', path: '/Monza_GP.Vcr', sizeBytes: 1000, mtime: 1, trackName: 'Autodromo Nazionale Monza', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 1 },
        { name: 'Monza_CurvaGrande.Vcr', path: '/Monza_CurvaGrande.Vcr', sizeBytes: 1000, mtime: 2, trackName: 'Monza Curva Grande Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 2 },
        { name: 'Bahrain_GP.Vcr', path: '/Bahrain_GP.Vcr', sizeBytes: 1000, mtime: 3, trackName: 'Bahrain International Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 3 },
        { name: 'Bahrain_Outer.Vcr', path: '/Bahrain_Outer.Vcr', sizeBytes: 1000, mtime: 4, trackName: 'Bahrain Outer Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 4 },
        { name: 'Bahrain_Paddock.Vcr', path: '/Bahrain_Paddock.Vcr', sizeBytes: 1000, mtime: 5, trackName: 'Bahrain Paddock Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 5 },
        { name: 'PaulRicard_Full.Vcr', path: '/PaulRicard_Full.Vcr', sizeBytes: 1000, mtime: 6, trackName: 'Circuit Paul Ricard', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 6 },
        { name: 'PaulRicard_Short.Vcr', path: '/PaulRicard_Short.Vcr', sizeBytes: 1000, mtime: 7, trackName: 'Paul Ricard - 1A-V2-Short', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 7 },
      ];

      // 1. Monza Curva Grande
      const monzaMatches = filterCompatibleReplays(layoutReplays, 'Autodromo Nazionale Monza (Curva Grande Circuit)', 'LMGT3');
      expect(monzaMatches.map(r => r.name)).toEqual(['Monza_CurvaGrande.Vcr']);

      // 2. Bahrain Outer
      const outerMatches = filterCompatibleReplays(layoutReplays, 'Bahrain International Circuit (Outer Circuit)', 'LMGT3');
      expect(outerMatches.map(r => r.name)).toEqual(['Bahrain_Outer.Vcr']);

      // 3. Bahrain Paddock
      const paddockMatches = filterCompatibleReplays(layoutReplays, 'Bahrain International Circuit (Paddock Circuit)', 'LMGT3');
      expect(paddockMatches.map(r => r.name)).toEqual(['Bahrain_Paddock.Vcr']);

      // 4. Paul Ricard Short
      const shortMatches = filterCompatibleReplays(layoutReplays, 'Paul Ricard Circuit (1A V2 Short)', 'LMGT3');
      expect(shortMatches.map(r => r.name)).toEqual(['PaulRicard_Short.Vcr']);
    });
  });

  describe('mapVehicleIdToClass', () => {
    it('correctly classifies LMGT3 vehicles', () => {
      expect(mapVehicleIdToClass('21_26_AFCO95641716', 'Ferrari 296 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('32_26_WRT_83524148', 'BMW M4 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('397_25_MUSTANG', 'Ford Mustang GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('8_26_GCHAL79481284', 'McLaren 720S GT3 Evo')).toBe('LMGT3');
      expect(mapVehicleIdToClass('91_26_MANT18218509', 'Porsche 911 GT3 R')).toBe('LMGT3');
      expect(mapVehicleIdToClass('78_25_AKKOF71490E4', 'Lexus RC F GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('61_26_IRON57024276', 'Lamborghini Huracan GT3 Evo2')).toBe('LMGT3');
    });

    it('correctly classifies Hypercar / LMH vehicles', () => {
      expect(mapVehicleIdToClass('50_26_499P_123456', 'Ferrari 499P')).toBe('LMH');
      expect(mapVehicleIdToClass('963', 'Porsche 963')).toBe('LMH');
      expect(mapVehicleIdToClass('101_26_WTR51729170', 'Cadillac V-Series.R')).toBe('LMH');
      expect(mapVehicleIdToClass('93_26_PEUG27100541', 'Peugeot 9X8')).toBe('LMH');
      expect(mapVehicleIdToClass('GR010', 'Toyota GR010 Hybrid')).toBe('LMH');
      expect(mapVehicleIdToClass('007_26_THO73564855', 'Aston Martin Valkyrie LMH')).toBe('LMH');
      expect(mapVehicleIdToClass('BMW_HY', 'BMW M Hybrid V8')).toBe('LMH');
      expect(mapVehicleIdToClass('A424', 'Alpine A424')).toBe('LMH');
      expect(mapVehicleIdToClass('GENESIS', 'Genesis GMR001 Hypercar')).toBe('LMH');
    });

    it('correctly classifies LMP2, GTE, and LMP3 vehicles', () => {
      expect(mapVehicleIdToClass('10_VECTOR_C18BEE4', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('4_25_DKR_E8E7FBE8C', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('777_DSTATI5BFA7EF3', 'Aston Martin Vantage AMR')).toBe('GTE');
      expect(mapVehicleIdToClass('488', 'Ferrari 488 GTE EVO')).toBe('GTE');
      expect(mapVehicleIdToClass('G61', 'Ginetta G61-LT-P325 Evo')).toBe('LMP3');
      expect(mapVehicleIdToClass('D09', 'Duqueine D09 P3')).toBe('LMP3');
    });

    it('correctly classifies vehicles using vehicleId alone when carModel is missing', () => {
      expect(mapVehicleIdToClass('23_26_THOR59931582')).toBe('LMGT3');
      expect(mapVehicleIdToClass('50_26_499P_123456')).toBe('LMH');
      expect(mapVehicleIdToClass('10_VECTOR_C18BEE4')).toBe('LMP2');
      expect(mapVehicleIdToClass('777_DSTATI5BFA7EF3')).toBe('GTE');
      expect(mapVehicleIdToClass('G61')).toBe('LMP3');
    });
  });
});

