import { describe, it, expect } from 'vitest';
import { enrichTrajectoryWithTrackGeometry, getTrackDefinition } from '../../server/serverTrackSync.js';
import { computeLapComparisons } from '../../src/utils/replayComparison.js';
import { computeLapSegmentComparisons } from '../../src/utils/cornerAnalysis.js';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/types.js';

describe('Baseline Comparison & Reference Change Invariance', () => {
  // Generate points exactly following Monza centerline geometry with normal lateral offset
  function createSimulatedLap(lateralOffset: number, speedMultiplier: number): ReplayTrajectoryData {
    const def = getTrackDefinition('monza_gp')!;
    const points: ReplayTrajectoryPoint[] = [];
    const n = 60;
    for (let i = 0; i < n; i++) {
      const pt = def.spatialIndex.points[i];
      const norm = def.spatialIndex.normals[i];
      const x = pt[0] + lateralOffset * norm.x;
      const z = pt[1] + lateralOffset * norm.z;
      const speedKmh = 220 * speedMultiplier;
      const timeSec = (i * 0.1) / speedMultiplier;

      points.push({
        x: Number(x.toFixed(3)),
        y: 0,
        z: Number(z.toFixed(3)),
        speedKmh: Math.round(speedKmh),
        timeSec: Number(timeSec.toFixed(3)),
        throttle: speedMultiplier > 1 ? 100 : 85,
        brake: 0,
        steerYaw: 0,
      });
    }

    const traj: ReplayTrajectoryData = {
      replayName: 'Monza_Ref_Test.Vcr',
      pointsCount: points.length,
      points,
      bounds: { minX: -500, maxX: 500, minZ: -1000, maxZ: 500, spanX: 1000, spanZ: 1500 },
    };

    return enrichTrajectoryWithTrackGeometry(traj, 'Autodromo Nazionale Monza', 'Monza GP');
  }

  it('maintains line divergence invariance when primary and baseline take different paths', () => {
    // Primary drives 3m to the right (+3m lateral offset)
    const primaryTraj = createSimulatedLap(3.0, 1.0);
    // Baseline drives tight on the left (-2m lateral offset)
    const baselineTraj = createSimulatedLap(-2.0, 1.05);

    expect(primaryTraj.points[0].stationM).toBeDefined();
    expect(baselineTraj.points[0].stationM).toBeDefined();

    // Compare laps directly using the new unified approach
    const comparisons = computeLapComparisons(primaryTraj.points, baselineTraj.points);

    expect(comparisons.length).toBe(primaryTraj.points.length);

    for (let i = 5; i < 50; i++) {
      const comp = comparisons[i];
      // Evaluated at primary station
      expect(comp.stationM).toBe(primaryTraj.points[i].stationM);

      // Primary was +3m, baseline was -2m -> delta should be approx +5.0m
      expect(comp.deltaLateralOffsetM).toBeCloseTo(5.0, 0.5);

      // Baseline was faster -> primary relative time should be slower (deltaTimeSec > 0)
      expect(comp.deltaTimeSec).toBeGreaterThan(0);
    }
  });

  it('guarantees baseline swap invariance: A vs B cleanly inverts B vs A', () => {
    const lapA = createSimulatedLap(1.5, 1.0);
    const lapB = createSimulatedLap(-1.0, 1.08);

    const compAtoB = computeLapComparisons(lapA.points, lapB.points);
    const compBtoA = computeLapComparisons(lapB.points, lapA.points);

    expect(compAtoB.length).toBe(lapA.points.length);
    expect(compBtoA.length).toBe(lapB.points.length);

    // Sample mid-lap comparisons
    for (let i = 5; i < 45; i++) {
      const ab = compAtoB[i];
      const ba = compBtoA[i];

      // Delta time should be inverse: delta(A, B) ≈ - delta(B, A)
      expect(ab.deltaTimeSec).toBeCloseTo(-ba.deltaTimeSec, 0.1);

      // Delta lateral offset should be inverse: deltaLat(A, B) ≈ - deltaLat(B, A)
      if (ab.deltaLateralOffsetM !== undefined && ba.deltaLateralOffsetM !== undefined) {
        expect(ab.deltaLateralOffsetM).toBeCloseTo(-ba.deltaLateralOffsetM, 0.2);
      }
    }
  });

  it('guarantees cross-session reference continuity with identical timing gate stations', () => {
    // Session 1 lap
    const session1Lap = createSimulatedLap(0, 1.0);
    // Session 2 lap (different session, different car/speed)
    const session2Lap = createSimulatedLap(0.8, 1.02);

    // Both sessions resolve to monza_gp with identical canonical track length and gates
    expect(session1Lap.layoutKey).toBe('monza_gp');
    expect(session2Lap.layoutKey).toBe('monza_gp');
    expect(session1Lap.trackLengthM).toBe(session2Lap.trackLengthM);

    expect(session1Lap.timingGates?.startFinish.stationM).toBe(0);
    expect(session2Lap.timingGates?.startFinish.stationM).toBe(0);

    expect(session1Lap.timingGates?.sector1?.stationM).toBe(session2Lap.timingGates?.sector1?.stationM);
    expect(session1Lap.timingGates?.sector2?.stationM).toBe(session2Lap.timingGates?.sector2?.stationM);

    // Head-to-head cross-session comparison
    const comp = computeLapComparisons(session1Lap.points, session2Lap.points);
    expect(comp.length).toBe(session1Lap.points.length);
    expect(comp[0].deltaTimeSec).toBe(0); // identically 0 at start line
  });

  it('performs corner and segment analysis with baseline directly using enriched points', () => {
    // Speed trace with entry straight, deceleration, apex, acceleration, and exit straight
    const speedsA = [100, 150, 200, 200, 180, 150, 90, 90, 150, 180, 200, 200, 180, 150, 100];
    const speedsB = [100, 150, 200, 200, 180, 150, 105, 105, 150, 180, 200, 200, 180, 150, 100]; // B carries more apex speed

    const def = getTrackDefinition('monza_gp')!;
    const pointsA: ReplayTrajectoryPoint[] = [];
    const pointsB: ReplayTrajectoryPoint[] = [];

    let tA = 0;
    let tB = 0;
    for (let i = 0; i < speedsA.length; i++) {
      const pt = def.spatialIndex.points[i];
      tA += 0.25;
      tB += 0.23;

      pointsA.push({
        x: pt[0],
        y: 0,
        z: pt[1],
        speedKmh: speedsA[i],
        timeSec: Number(tA.toFixed(3)),
        throttle: i >= 8 ? 100 : 0,
        brake: i >= 4 && i <= 7 ? 80 : 0,
        steerYaw: 0,
      });

      pointsB.push({
        x: pt[0],
        y: 0,
        z: pt[1],
        speedKmh: speedsB[i],
        timeSec: Number(tB.toFixed(3)),
        throttle: i >= 7 ? 100 : 0,
        brake: i >= 4 && i <= 6 ? 80 : 0,
        steerYaw: 0,
      });
    }

    const trajA: ReplayTrajectoryData = {
      replayName: 'Monza_Corner_A.Vcr',
      pointsCount: pointsA.length,
      points: pointsA,
      bounds: { minX: -500, maxX: 500, minZ: -1000, maxZ: 500, spanX: 1000, spanZ: 1500 },
    };
    const trajB: ReplayTrajectoryData = {
      replayName: 'Monza_Corner_B.Vcr',
      pointsCount: pointsB.length,
      points: pointsB,
      bounds: { minX: -500, maxX: 500, minZ: -1000, maxZ: 500, spanX: 1000, spanZ: 1500 },
    };

    enrichTrajectoryWithTrackGeometry(trajA, 'Autodromo Nazionale Monza');
    enrichTrajectoryWithTrackGeometry(trajB, 'Autodromo Nazionale Monza');

    // Call computeLapSegmentComparisons without manual distance options
    const segments = computeLapSegmentComparisons(trajA.points, trajB.points);
    expect(segments.length).toBeGreaterThan(0);

    const corners = segments.filter(s => s.type === 'corner');
    expect(corners.length).toBeGreaterThanOrEqual(1);

    const corner = corners[0];
    expect(corner.minDistM).toBeGreaterThan(0);
    expect(corner.baselineMinSpeedKmh).toBeGreaterThan(corner.primaryMinSpeedKmh);
    expect(corner.minSpeedDeltaKmh).toBeLessThan(0);
  });

  it('handles fallback baseline comparison gracefully when track is unknown', () => {
    const rawA: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 150, timeSec: 0 },
      { x: 50, y: 0, z: 0, speedKmh: 160, timeSec: 1 },
      { x: 100, y: 0, z: 50, speedKmh: 170, timeSec: 2 },
    ];
    const rawB: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 155, timeSec: 0 },
      { x: 50, y: 0, z: 0, speedKmh: 168, timeSec: 0.95 },
      { x: 100, y: 0, z: 50, speedKmh: 180, timeSec: 1.88 },
    ];

    const trajA: ReplayTrajectoryData = {
      replayName: 'NewTrack_A.Vcr',
      pointsCount: rawA.length,
      points: rawA,
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 50, spanX: 100, spanZ: 50 },
    };
    const trajB: ReplayTrajectoryData = {
      replayName: 'NewTrack_B.Vcr',
      pointsCount: rawB.length,
      points: rawB,
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 50, spanX: 100, spanZ: 50 },
    };

    enrichTrajectoryWithTrackGeometry(trajA, 'Unknown');
    enrichTrajectoryWithTrackGeometry(trajB, 'Unknown');

    expect(trajA.points[0].stationM).toBe(0);
    expect(trajB.points[0].stationM).toBe(0);

    const comparisons = computeLapComparisons(trajA.points, trajB.points);
    expect(comparisons.length).toBe(3);
    expect(comparisons[0].deltaTimeSec).toBe(0);
    expect(comparisons[2].deltaTimeSec).toBeGreaterThan(0); // Lap A is slower than Lap B
  });
});
