import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import {
  compressTrajectory,
  decompressTrajectory,
  toColumnarTrajectory,
  decompressTrajectoryEdge,
} from '../../../../server/core/replay/replayTrajectoryCodec.js';
import { compressJson } from '../../../../server/core/dbCache.js';
import { applyGarageState } from '../../../../server/replay/decode/garageState.js';
import { lapEdgesFromNeighbours } from '../../../../server/replay/decode/replayLapPoints.js';

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
  it('decodes bounded edges with the stored garage phases and four-wheel channels', () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({
      x: i * 0.1, y: 0, z: 0, timeSec: i * 0.02, speedKmh: i < 10 ? 0 : i < 500 ? 120 : 20,
      steerYaw: 0.25, inPit: false, brakeTemps: [1, 2, 3, 4] as [number, number, number, number],
    }));
    const trajectory = { ...buildTrajectory(points), pitEvents: [{ driverSlot: 3, timeSec: 0, code: 21, action: 'Garage' }] };
    applyGarageState(trajectory.points, trajectory.pitEvents);
    const buffer = compressTrajectory(trajectory);
    const full = decompressTrajectory(buffer);
    for (const direction of ['previous', 'next'] as const) {
      const boundary = direction === 'previous' ? 20 : 18;
      const edge = decompressTrajectoryEdge(buffer, boundary, direction);
      expect(edge).toEqual(full.points.filter(point => direction === 'previous'
        ? point.timeSec! >= 18 : point.timeSec! > 18));
      expect(edge.length).toBeLessThanOrEqual(100);
      // Racing earlier in the lap ends the garage spell even when the edge has slowed down.
      expect(edge.every(point => point.inGarage === false && point.inPit === false)).toBe(true);
    }
  });

  it('keeps continuity barriers when decoding edges', () => {
    const previous = buildTrajectory([
      { x: 0, y: 0, z: 0, timeSec: 0 },
      { x: 10, y: 0, z: 0, timeSec: 9 },
      { x: 11, y: 0, z: 0 },
      { x: 12, y: 0, z: 0, timeSec: 9.9 },
    ]);
    const buffer = compressTrajectory(previous);
    const lap = [{ x: 13, y: 0, z: 0, timeSec: 10 }];
    const bounded = decompressTrajectoryEdge(buffer, 10, 'previous');
    expect(lapEdgesFromNeighbours(lap, bounded, undefined))
      .toEqual(lapEdgesFromNeighbours(lap, decompressTrajectory(buffer).points, undefined));
    expect(bounded).toEqual([{ x: 11, y: 0, z: 0 }, { x: 12, y: 0, z: 0, timeSec: 9.9 }]);
  });

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

  it('refuses rows written before the binary lap format', () => {
    const legacy = toColumnarTrajectory(buildTrajectory([{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }]));
    expect(() => decompressTrajectory(compressJson(legacy))).toThrow(/replay cache rewrite/);
  });

  it('stores an empty trajectory', () => {
    const empty = buildTrajectory([]);

    expect(toColumnarTrajectory(empty).pointsLength).toBe(0);
    expect(decompressTrajectory(compressTrajectory(empty))).toEqual({ ...empty, signConvention: 'iso8855' });
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

  it('marks new blobs as ISO 8855 and never flips them again', () => {
    const trajectory = buildTrajectory([{ x: 0, y: 0, z: 0, steerYaw: 0.25 }]);
    const once = decompressTrajectory(compressTrajectory(trajectory));
    const twice = decompressTrajectory(compressTrajectory(once));

    expect(once.points[0].steerYaw).toBe(0.25);
    expect(twice.points[0].steerYaw).toBe(0.25);
    expect(trajectory.signConvention).toBeUndefined();
  });
});
