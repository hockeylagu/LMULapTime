import { describe, it, expect } from 'vitest';
import { fuseDuckDbWithVcrTrajectory } from '../../../server/telemetry/telemetryFusion.js';
import { DuckDbLapTelemetry, ReplayTrajectoryData } from '../../../server/core/types.js';

describe('telemetryFusion', () => {
  it('clears source geometry and cut annotations when producing a new fused sample series', () => {
    const vcr: ReplayTrajectoryData = {
      replayName: 'Geometry_Test.Vcr', pointsCount: 2,
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
      geometryRevision: 'old-geometry', projectionRevision: 'old-projection',
      stationSource: 'track', lineCut: { start: 'line', end: 'line' },
      lineCutProjectionRevision: 'old-projection', trackLengthM: 100,
      points: [{ x: 0, y: 0, z: 0, timeSec: 500 }, { x: 10, y: 0, z: 10, timeSec: 501 }],
      leadInPoints: [{ x: -1, y: 0, z: -1, timeSec: 499.9, stationM: 99 }],
    };
    const duck: DuckDbLapTelemetry = {
      lapNumber: 1, lapTimeSec: 1, pointsCount: 3, sampleRateHz: 100,
      points: [0, 0.5, 1].map(timeSec => ({ x: 0, y: 0, z: 0, timeSec, speedKmh: 100,
        stationM: 999, lateralOffsetM: 20, leftRoadDistanceM: -10, rightRoadDistanceM: 30,
        roadElevationM: 777, roadGradePct: 30, roadBankDeg: 20,
        leftKerbWidthM: 3, rightKerbWidthM: 3, leftKerbHeightM: 1, rightKerbHeightM: 1,
        leftKerbType: 'flat' as const, rightKerbType: 'sawtooth' as const,
        tireTemps: [71, 72, 73, 74], brakeTemps: [301, 302, 303, 304] })),
    };
    const snapshot = structuredClone({ vcr, duck });
    for (const source of [vcr, { ...vcr, points: [] }]) {
      const fused = fuseDuckDbWithVcrTrajectory(duck, source);
      for (const key of ['geometryRevision', 'projectionRevision', 'lineCut', 'lineCutProjectionRevision', 'stationSource'] as const) {
        expect(fused[key]).toBeUndefined();
      }
      expect(fused.points[1]).toMatchObject({ timeSec: 0.5, tireTemps: [71, 72, 73, 74], brakeTemps: [301, 302, 303, 304] });
      for (const key of ['stationM', 'lateralOffsetM', 'leftRoadDistanceM', 'rightRoadDistanceM',
        'roadElevationM', 'roadGradePct', 'roadBankDeg', 'leftKerbWidthM', 'rightKerbWidthM',
        'leftKerbHeightM', 'rightKerbHeightM', 'leftKerbType', 'rightKerbType'] as const) {
        expect(fused.points[1][key]).toBeUndefined();
      }
      expect(fused.leadInPoints?.[0].stationM).toBeUndefined();
    }
    expect({ vcr, duck }).toEqual(snapshot);
  });

  it('fuses DuckDB 100Hz telemetry channels with VCR 2D spatial coordinates accurately', () => {
    const mockVcrTrajectory: ReplayTrajectoryData = {
      replayName: 'Bahrain_R1.Vcr',
      pointsCount: 3,
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
      sectors: { s1Frame: 1, s2Frame: 2 },
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0.0, speedKmh: 100 },
        { x: 50, y: 0, z: 25, timeSec: 1.0, speedKmh: 120 },
        { x: 100, y: 0, z: 50, timeSec: 2.0, speedKmh: 140 },
      ],
    };

    const mockDuckLap: DuckDbLapTelemetry = {
      lapNumber: 1,
      lapTimeSec: 2.0,
      pointsCount: 5,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0.0, speedKmh: 101, throttle: 50, brake: 0, rideHeight: [20, 20, 25, 25] },
        { x: 0, y: 0, z: 0, timeSec: 0.5, speedKmh: 111, throttle: 80, brake: 0, rideHeight: [20, 20, 25, 25] },
        { x: 0, y: 0, z: 0, timeSec: 1.0, speedKmh: 121, throttle: 100, brake: 0, rideHeight: [21, 21, 26, 26] },
        { x: 0, y: 0, z: 0, timeSec: 1.5, speedKmh: 131, throttle: 100, brake: 0, rideHeight: [21, 21, 26, 26] },
        { x: 0, y: 0, z: 0, timeSec: 2.0, speedKmh: 141, throttle: 100, rideHeight: [22, 22, 27, 27] },
      ],
    };

    const fused = fuseDuckDbWithVcrTrajectory(mockDuckLap, mockVcrTrajectory, 'Bahrain_Test.duckdb');

    expect(fused.source).toBe('duckdb');
    expect(fused.duckdbFilename).toBe('Bahrain_Test.duckdb');
    expect(fused.points).toHaveLength(5);

    // Verify midpoint interpolation at t = 0.5s:
    // x should be halfway between 0 and 50 -> 25
    // z should be halfway between 0 and 25 -> 12.5
    const midPoint = fused.points[1];
    expect(midPoint.timeSec).toBe(0.5);
    expect(midPoint.x).toBe(25);
    expect(midPoint.z).toBe(12.5);

    // Verify DuckDB native channels preserved
    expect(midPoint.speedKmh).toBe(111);
    expect(midPoint.throttle).toBe(80);
    expect(midPoint.rideHeight).toEqual([20, 20, 25, 25]);
    expect(fused.sectors).toEqual({ s1Frame: 2, s2Frame: 4 });
  });

  it('interpolates angles across the +/-pi wrap boundary without swinging through zero', () => {
    // p0 is at +3.14 rad (~179.9 deg), p1 is at -3.14 rad (~-179.9 deg)
    // Shortest angular difference is ~0.003 rad across boundary, NOT -6.28 rad through zero
    const mockVcrTrajectory: ReplayTrajectoryData = {
      replayName: 'Wrap_Test.Vcr',
      pointsCount: 2,
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0.0, speedKmh: 100, rotY: 3.14 },
        { x: 0, y: 0, z: 10, timeSec: 1.0, speedKmh: 100, rotY: -3.14 },
      ],
    };

    const mockDuckLap: DuckDbLapTelemetry = {
      lapNumber: 1,
      lapTimeSec: 1.0,
      pointsCount: 3,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0.0, speedKmh: 100 },
        { x: 0, y: 0, z: 5, timeSec: 0.5, speedKmh: 100 },
        { x: 0, y: 0, z: 10, timeSec: 1.0, speedKmh: 100 },
      ],
    };

    const fused = fuseDuckDbWithVcrTrajectory(mockDuckLap, mockVcrTrajectory);
    const midPoint = fused.points[1];

    // With linear interpolation without unwrapping, midPoint.rotY would be 0.0!
    // With shortest-arc interpolation, midPoint.rotY should remain at or near +/-pi (~3.14159 or -3.14159)
    expect(Math.abs(midPoint.rotY ?? 0)).toBeGreaterThan(3.1);
  });

  it('carries the VCR recording either side of the lap onto the DuckDB lap clock', () => {
    const vcr: ReplayTrajectoryData = {
      replayName: 'Lead_Test.Vcr',
      pointsCount: 3,
      bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 0, spanX: 100, spanZ: 0 },
      points: [
        { x: 0, y: 0, z: 0, timeSec: 500 },
        { x: 50, y: 0, z: 0, timeSec: 501 },
        { x: 100, y: 0, z: 0, timeSec: 502 },
      ],
      leadInPoints: [{ x: -25, y: 0, z: 0, timeSec: 499.5 }, { x: -5, y: 0, z: 0, timeSec: 499.9 }],
      leadOutPoints: [{ x: 101, y: 0, z: 0, timeSec: 502.02 }, { x: 125, y: 0, z: 0, timeSec: 502.5 }],
    };
    const duck: DuckDbLapTelemetry = {
      lapNumber: 1,
      lapTimeSec: 2.05,
      pointsCount: 2,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0 },
        { x: 0, y: 0, z: 0, timeSec: 2.05 },
      ],
    };

    const fused = fuseDuckDbWithVcrTrajectory(duck, vcr);

    expect(fused.leadInPoints?.map(p => p.timeSec)).toEqual([-0.5, -0.1]);
    // A lead-out sample recorded before the DuckDB lap's last sample is dropped: time must keep moving forward.
    expect(fused.leadOutPoints?.map(p => p.timeSec)).toEqual([2.5]);
    expect(fused.leadOutPoints?.[0].x).toBe(125);
  });
});
