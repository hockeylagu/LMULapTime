import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { ReplayTrajectoryData } from '../../../../server/core/types.js';
import {
  compressTrajectory,
  decompressTrajectory,
  toColumnarTrajectory,
  isColumnar,
} from '../../../../server/core/replay/replayTrajectoryCodec.js';
import { compressJson, initDbSchema } from '../../../../server/core/dbSchema.js';
import { getTelemetryLapCache, upsertTelemetryLapCache } from '../../../../server/core/dbTelemetryStore.js';

function buildTrajectory(points: ReplayTrajectoryData['points']): ReplayTrajectoryData {
  return {
    replayName: 'Codec_P1.Vcr',
    driverSlot: 3,
    currentLap: 2,
    pointsCount: points.length,
    bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1 },
    laps: [{ lapNumber: 2, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
    points,
  };
}

describe('replay trajectory columnar codec', () => {
  it('round-trips points losslessly through compression', () => {
    const trajectory = buildTrajectory([
      { x: 1.25, y: -0.5, z: 3.75, speedKmh: 120, throttle: 0.5123456789, brake: 0, gear: 4, inPit: false, brakeTemps: [1.5, 2.5, 3.5, 4.5] },
      { x: 2.5, y: -0.25, z: 4.5, speedKmh: 130, throttle: 1, brake: 0, gear: 5, inPit: false, brakeTemps: [1.6, 2.6, 3.6, 4.6] },
      { x: 3.75, y: 0, z: 5.25, speedKmh: 140, throttle: 0, brake: 0.25, gear: 5, inPit: false, brakeTemps: [1.7, 2.7, 3.7, 4.7] },
    ]);

    const restored = decompressTrajectory(compressTrajectory(trajectory));

    expect(restored.points).toEqual(trajectory.points);
    expect(restored.laps).toEqual(trajectory.laps);
    expect(restored.bounds).toEqual(trajectory.bounds);
    expect(restored.currentLap).toBe(2);
  });

  it('collapses channels that never vary and keeps varying ones as columns', () => {
    const trajectory = buildTrajectory([
      { x: 0, y: 0, z: 0, gear: 3, inPit: false },
      { x: 1, y: 0, z: 1, gear: 3, inPit: false },
    ]);

    const encoded = toColumnarTrajectory(trajectory);

    expect(isColumnar(encoded)).toBe(true);
    if (!isColumnar(encoded)) return;
    expect(encoded.constants).toEqual({ y: 0, gear: 3, inPit: false });
    expect(Object.keys(encoded.columns).sort()).toEqual(['x', 'z']);
    expect(encoded.pointsLength).toBe(2);
  });

  it('preserves fields that are absent on some points', () => {
    const trajectory = buildTrajectory([
      { x: 0, y: 0, z: 0, engineRpm: 5000 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 2, engineRpm: 7000 },
    ]);

    const restored = decompressTrajectory(compressTrajectory(trajectory));

    expect(restored.points[0].engineRpm).toBe(5000);
    expect('engineRpm' in restored.points[1]).toBe(false);
    expect(restored.points[2].engineRpm).toBe(7000);
  });

  it('reads legacy object-per-point blobs written before the columnar format', () => {
    const legacy = buildTrajectory([
      { x: 1, y: 2, z: 3, speedKmh: 99 },
      { x: 4, y: 5, z: 6, speedKmh: 98 },
    ]);
    const legacyBuffer = zlib.brotliCompressSync(Buffer.from(JSON.stringify(legacy), 'utf8'));

    const restored = decompressTrajectory(legacyBuffer);

    expect(restored.points).toEqual(legacy.points);
    expect(restored.replayName).toBe('Codec_P1.Vcr');
  });

  it('leaves an empty trajectory untouched', () => {
    const empty = buildTrajectory([]);

    expect(isColumnar(toColumnarTrajectory(empty))).toBe(false);
    expect(decompressTrajectory(compressTrajectory(empty)).points).toEqual([]);
  });

  it('stores fewer bytes than the object-per-point layout', () => {
    const points = Array.from({ length: 500 }, (_, index) => ({
      x: index * 1.5, y: 0, z: index * 2.25, speedKmh: 100 + (index % 40),
      throttle: 1, brake: 0, gear: 4, inPit: false, tcActive: false,
      brakeTemps: [120.5, 121.5, 119.5, 118.5] as [number, number, number, number],
    }));
    const trajectory = buildTrajectory(points);

    const columnar = compressTrajectory(trajectory).length;
    const legacy = zlib.brotliCompressSync(Buffer.from(JSON.stringify(trajectory), 'utf8'), {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
    }).length;

    expect(columnar).toBeLessThan(legacy);
  });

  it('flips the right-positive steering of blobs written before the ISO 8855 conversion, laps included', () => {
    const legacy = buildTrajectory([{ x: 0, y: 0, z: 0, steerYaw: 0.25 }, { x: 1, y: 0, z: 1, steerYaw: 0 }]);
    legacy.leadInPoints = [{ x: -1, y: 0, z: -1, steerYaw: -0.5 }];
    legacy.allLapsData = [buildTrajectory([{ x: 0, y: 0, z: 0, steerYaw: 0.1 }])];
    const restored = decompressTrajectory(compressJson(toColumnarTrajectory(legacy)));

    expect(restored.points.map(p => p.steerYaw)).toEqual([-0.25, 0]);
    expect(restored.leadInPoints?.[0].steerYaw).toBe(0.5);
    expect(restored.allLapsData?.[0].points?.[0].steerYaw).toBe(-0.1);
    expect(restored.signConvention).toBe('iso8855');
  });

  it('marks new blobs as ISO 8855 and never flips them again', () => {
    const trajectory = buildTrajectory([{ x: 0, y: 0, z: 0, steerYaw: 0.25 }]);
    const once = decompressTrajectory(compressTrajectory(trajectory));
    const twice = decompressTrajectory(compressTrajectory(once));

    expect(once.points[0].steerYaw).toBe(0.25);
    expect(twice.points[0].steerYaw).toBe(0.25);
    expect(trajectory.signConvention).toBeUndefined();
  });

  it('converts DuckDB laps cached before the ISO 8855 conversion, including old-version rows', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const lap = { lapNumber: 1, lapTimeSec: 90, pointsCount: 1, sampleRateHz: 100, points: [{ x: 0, y: 0, z: 0, steerYaw: 0.3 }] };
    db.prepare('INSERT INTO telemetry_lap_cache (filename, lap_number, points_count, telemetry_br, cache_version, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('Old.duckdb', 1, 1, compressJson(lap), 'v1', 0);
    upsertTelemetryLapCache(db, 'New.duckdb', 1, lap);

    expect(getTelemetryLapCache(db, 'Old.duckdb', 1, true)?.points[0].steerYaw).toBe(-0.3);
    expect(getTelemetryLapCache(db, 'New.duckdb', 1)?.points[0].steerYaw).toBe(0.3);
    db.close();
  });
});
