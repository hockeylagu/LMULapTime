import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { ReplayTrajectoryData } from '../../server/core/types.js';
import {
  compressTrajectory,
  decompressTrajectory,
  toColumnarTrajectory,
  isColumnar,
} from '../../server/core/replayTrajectoryCodec.js';

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
});
