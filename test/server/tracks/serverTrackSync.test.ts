vi.mock('../../../server/plugins/dataPlugin.js', async (importOriginal) => {
  const actual=await importOriginal<typeof import('../../../server/plugins/dataPlugin.js')>();
  const {syntheticTrack}=await import('../../helpers/syntheticTrack.js');
  return {...actual,dataPlugin:{status:actual.dataPlugin.status,
    trackGeometry:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?syntheticTrack(key):null,
    track:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?{geometry:syntheticTrack(key),display:null}:null,
    vehicle:()=>null,vehicles:()=>[]}};
});
import { vi } from 'vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { enrichTrajectoryWithTrackGeometry, clearTrackDefinitionCache, getTrackDefinition } from '../../../server/tracks/serverTrackSync.js';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../server/core/types.js';

describe('serverTrackSync', () => {
  beforeEach(() => {
    clearTrackDefinitionCache();
  });

  it('loads a synthetic provider definition and caches it in memory', () => {
    const def = getTrackDefinition('monza_gp');
    expect(def).not.toBeNull();
    expect(def?.layoutKey).toBe('monza_gp');
    expect(def?.spatialIndex.totalLengthM).toBeGreaterThan(5000);
    expect(def?.timingGates?.startFinish).toBeDefined();
    // Sector 1/2 gates are only emitted when telemetry-derived detection is plausible (see
    // rejected, so they're correctly omitted rather than asserted here.
    expect(def?.centerline.length).toBeGreaterThan(100);

    // Second call should come directly from memory cache
    const cached = getTrackDefinition('monza_gp');
    expect(cached).toBe(def);
  });

  it('enriches trajectory with canonical projection for recognized circuit', () => {
    // Generate recorded samples independently of the synthetic reference route
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

    const enriched = enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza');

    expect(enriched.layoutKey).toBe('monza_gp');
    expect(enriched.allLapsData?.[0].layoutKey).toBe('monza_gp');
    expect(enriched.allLapsData?.[1].layoutKey).toBe('monza_gp');
    expect(enriched.allLapsData?.[0].points[0].stationM).toBeDefined();
    expect(enriched.allLapsData?.[1].points[0].stationM).toBeDefined();
    expect(childLap1.points[0].stationM).toBeUndefined();
    expect(childLap2.layoutKey).toBeUndefined();
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
    expect(enriched.stationSource).toBe('odometer');
    expect(enriched.lineCut).toEqual({ start: 'none', end: 'none' });
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

  describe('cutting the lap at the start/finish line', () => {
    // Samples along Monza's own centreline around the line, 0.1 s apart; the timing loop
    // sliced the lap three samples after the line (a late remote timing event).
    const lapAroundTheLine = () => {
      const centerline = getTrackDefinition('monza_gp')?.centerline ?? [];
      const at = (i: number): ReplayTrajectoryPoint => {
        const [x, z] = centerline[(i + centerline.length) % centerline.length];
        return { x, y: 0, z, timeSec: 100 + i * 0.1, speedKmh: 250 };
      };
      const leadIn = [-4, -3, -2, -1, 0, 1, 2].map(at);
      const lap = [3, 4, 5, 6, 7, 8, 9, 10].map(at);
      const trajectory: ReplayTrajectoryData = {
        replayName: 'Monza_Test.Vcr',
        pointsCount: lap.length,
        points: lap,
        leadInPoints: leadIn,
        leadOutPoints: [11, 12].map(at),
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      };
      return trajectory;
    };

    it('ends a full lap exactly at the track length it reports', () => {
      const centerline = getTrackDefinition('monza_gp')?.centerline ?? [];
      const m = centerline.length;
      const at = (i: number): ReplayTrajectoryPoint => {
        const [x, z] = centerline[((i % m) + m) % m];
        return { x, y: 0, z, timeSec: 100 + i * 0.1, speedKmh: 250 };
      };
      const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => at(from + k));
      const trajectory: ReplayTrajectoryData = {
        replayName: 'Monza_Test.Vcr',
        pointsCount: m,
        points: range(3, m + 3),
        leadInPoints: range(-4, 2),
        leadOutPoints: range(m + 4, m + 6),
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      };
      const enriched = enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza', 'Monza GP', 'Monza_Test.Vcr');
      expect(enriched.lineCut).toEqual({ start: 'line', end: 'line' });
      expect(enriched.points[enriched.points.length - 1].stationM).toBe(enriched.trackLengthM);
    });

    it('starts a late-sliced lap exactly at the line, using the recording before the slice', () => {
      const enriched = enrichTrajectoryWithTrackGeometry(lapAroundTheLine(), 'Autodromo Nazionale Monza', 'Monza GP', 'Monza_Test.Vcr');
      const [x0, z0] = getTrackDefinition('monza_gp')?.centerline[0] ?? [NaN, NaN];
      expect(enriched.points[0].stationM).toBe(0);
      expect(enriched.points[0].distM).toBe(0);
      expect(enriched.points[0].x).toBeCloseTo(x0, 1);
      expect(enriched.points[0].z).toBeCloseTo(z0, 1);
      expect(enriched.points[0].timeSec).toBeCloseTo(100, 2);
      expect(enriched.stationSource).toBe('track');
      expect(enriched.lineCut).toEqual({ start: 'line', end: 'none' }); // the lap stops hundreds of metres short of the line
    });

    it('extends a start with no recording before it back to the line, and says so', () => {
      const trajectory = lapAroundTheLine();
      delete trajectory.leadInPoints;
      const enriched = enrichTrajectoryWithTrackGeometry(trajectory, 'Autodromo Nazionale Monza', 'Monza GP', 'Monza_Test.Vcr');
      expect(enriched.lineCut).toEqual({ start: 'extrapolated', end: 'none' });
      expect(enriched.points[0].stationM).toBe(0);
      expect(enriched.points[0].timeSec).toBeCloseTo(100, 1); // along Monza's start straight
    });

    it('never returns the recording either side of the lap', () => {
      const known = enrichTrajectoryWithTrackGeometry(lapAroundTheLine(), 'Autodromo Nazionale Monza', 'Monza GP', 'Monza_Test.Vcr');
      const unknown = enrichTrajectoryWithTrackGeometry(lapAroundTheLine(), 'Unknown Venue', 'Unknown', 'Unknown.Vcr');
      for (const t of [known, unknown]) {
        expect(t.leadInPoints).toBeUndefined();
        expect(t.leadOutPoints).toBeUndefined();
      }
      expect(unknown.points).toHaveLength(8);
    });
  });
});
