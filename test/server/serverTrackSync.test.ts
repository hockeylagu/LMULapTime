import { describe, it, expect, beforeEach } from 'vitest';
import { enrichTrajectoryWithTrackGeometry, clearTrackDefinitionCache, getTrackDefinition } from '../../server/serverTrackSync.js';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/types.js';

describe('serverTrackSync', () => {
  beforeEach(() => {
    clearTrackDefinitionCache();
  });

  it('loads real circuit definition from disk and caches it in memory', () => {
    const def = getTrackDefinition('monza_gp');
    expect(def).not.toBeNull();
    expect(def?.layoutKey).toBe('monza_gp');
    expect(def?.lengthM).toBeGreaterThan(5000);
    expect(def?.timingGates?.startFinish).toBeDefined();
    expect(def?.timingGates?.sector1).toBeDefined();
    expect(def?.timingGates?.sector2).toBeDefined();
    expect(def?.centerline.length).toBeGreaterThan(100);

    // Second call should come directly from memory cache
    const cached = getTrackDefinition('monza_gp');
    expect(cached).toBe(def);
  });

  it('enriches trajectory with canonical projection for recognized circuit', () => {
    // Generate sample points around Monza start/finish straight
    const rawPoints: ReplayTrajectoryPoint[] = [
      { x: 14.5, y: 0, z: 14.8, speedKmh: 220, timeSec: 0 },
      { x: 14.0, y: 0, z: 9.8, speedKmh: 225, timeSec: 0.1 },
      { x: 13.5, y: 0, z: 4.8, speedKmh: 230, timeSec: 0.2 },
      { x: 13.0, y: 0, z: -0.2, speedKmh: 235, timeSec: 0.3 },
    ];

    const trajectory: ReplayTrajectoryData = {
      replayName: 'Monza_Test.Vcr',
      pointsCount: rawPoints.length,
      points: rawPoints,
      bounds: { minX: 0, maxX: 20, minZ: -10, maxZ: 20, spanX: 20, spanZ: 30 },
    };

    const enriched = enrichTrajectoryWithTrackGeometry(
      trajectory,
      'Autodromo Nazionale Monza',
      'Monza GP',
      'Monza_Test.Vcr'
    );

    expect(enriched.layoutKey).toBe('monza_gp');
    expect(enriched.trackLengthM).toBeGreaterThan(5000);
    expect(enriched.timingGates?.startFinish).toBeDefined();
    expect(enriched.timingGates?.sector1?.stationM).toBeGreaterThan(1000);

    // Points should now have distM, stationM, and lateralOffsetM populated
    for (const pt of enriched.points) {
      expect(pt.distM).toBeDefined();
      expect(typeof pt.distM).toBe('number');
      expect(pt.stationM).toBeDefined();
      expect(typeof pt.stationM).toBe('number');
      expect(pt.lateralOffsetM).toBeDefined();
      expect(typeof pt.lateralOffsetM).toBe('number');
    }
  });

  it('enriches child allLapsData trajectories with canonical stations', () => {
    const rawPointsLap1: ReplayTrajectoryPoint[] = [
      { x: 14.5, y: 0, z: 14.8, speedKmh: 220, timeSec: 0 },
      { x: 14.0, y: 0, z: 9.8, speedKmh: 225, timeSec: 0.1 },
    ];
    const rawPointsLap2: ReplayTrajectoryPoint[] = [
      { x: 13.5, y: 0, z: 4.8, speedKmh: 230, timeSec: 90.0 },
      { x: 13.0, y: 0, z: -0.2, speedKmh: 235, timeSec: 90.1 },
    ];

    const childLap1: ReplayTrajectoryData = {
      replayName: 'Monza_Test.Vcr',
      currentLap: 1,
      pointsCount: 2,
      points: rawPointsLap1,
      bounds: { minX: 0, maxX: 20, minZ: -10, maxZ: 20, spanX: 20, spanZ: 30 },
    };
    const childLap2: ReplayTrajectoryData = {
      replayName: 'Monza_Test.Vcr',
      currentLap: 2,
      pointsCount: 2,
      points: rawPointsLap2,
      bounds: { minX: 0, maxX: 20, minZ: -10, maxZ: 20, spanX: 20, spanZ: 30 },
    };

    const trajectory: ReplayTrajectoryData = {
      replayName: 'Monza_Test.Vcr',
      pointsCount: 4,
      points: [...rawPointsLap1, ...rawPointsLap2],
      allLapsData: [childLap1, childLap2],
      bounds: { minX: 0, maxX: 20, minZ: -10, maxZ: 20, spanX: 20, spanZ: 30 },
    };

    enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza');

    expect(trajectory.layoutKey).toBe('monza_gp');
    expect(childLap1.layoutKey).toBe('monza_gp');
    expect(childLap2.layoutKey).toBe('monza_gp');
    expect(childLap1.points[0].stationM).toBeDefined();
    expect(childLap2.points[0].stationM).toBeDefined();
  });

  it('falls back gracefully to cumulative odometer distance for unknown track', () => {
    const rawPoints: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 },
      { x: 100, y: 0, z: 0, speedKmh: 120, timeSec: 1 },
      { x: 100, y: 0, z: 200, speedKmh: 140, timeSec: 2 },
    ];

    const trajectory: ReplayTrajectoryData = {
      replayName: 'Unknown_Circuit.Vcr',
      pointsCount: 3,
      points: rawPoints,
      sectors: { s1Frame: 1, s2Frame: 2 },
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 200, spanX: 100, spanZ: 200 },
    };

    const enriched = enrichTrajectoryWithTrackGeometry(
      trajectory,
      'Fictional Track',
      'Test Course',
      'Unknown_Circuit.Vcr'
    );

    expect(enriched.layoutKey).toBeUndefined();
    expect(enriched.trackLengthM).toBe(300); // 100m + 200m
    expect(enriched.points[0].distM).toBe(0);
    expect(enriched.points[1].distM).toBe(100);
    expect(enriched.points[2].distM).toBe(300);
    expect(enriched.points[0].stationM).toBe(0);
    expect(enriched.points[1].stationM).toBe(100);
    expect(enriched.points[2].stationM).toBe(300);
    expect(enriched.points[0].lateralOffsetM).toBe(0);
    expect(enriched.points[1].lateralOffsetM).toBe(0);
    expect(enriched.points[2].lateralOffsetM).toBe(0);

    // Synthetic timing gates should be present
    expect(enriched.timingGates?.startFinish.stationM).toBe(0);
    expect(enriched.timingGates?.sector1?.stationM).toBe(100);
    expect(enriched.timingGates?.sector2?.stationM).toBe(300);
  });

  it('executes in sub-millisecond time for typical trajectory downsamples', () => {
    // 1200 points
    const points: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < 1200; i++) {
      points.push({
        x: 15 + Math.sin(i / 50) * 5,
        y: 0,
        z: 20 - i * 4,
        speedKmh: 200,
        timeSec: i * 0.08,
      });
    }

    const trajectory: ReplayTrajectoryData = {
      replayName: 'Monza_Performance_Test.Vcr',
      pointsCount: points.length,
      points,
      bounds: { minX: 0, maxX: 30, minZ: -5000, maxZ: 30, spanX: 30, spanZ: 5030 },
    };

    // Warm-up cache
    enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza');

    const start = performance.now();
    enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza');
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(350);
  });
});
