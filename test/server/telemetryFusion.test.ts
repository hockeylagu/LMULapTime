import { describe, it, expect } from 'vitest';
import { fuseDuckDbWithVcrTrajectory } from '../../server/telemetry/telemetryFusion.js';
import { DuckDbLapTelemetry, ReplayTrajectoryData } from '../../server/core/types.js';

describe('telemetryFusion', () => {
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
});
