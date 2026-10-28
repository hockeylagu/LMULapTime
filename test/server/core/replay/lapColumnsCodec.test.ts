import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { decodeLapColumns, encodeLapColumns, type LapColumn, type StoredLapColumns } from '../../../../server/core/replay/lapColumnsCodec.js';

interface TestLap extends StoredLapColumns { driverName: string; constants: Record<string, unknown> }

const lap = (columns: Record<string, LapColumn>, extra: Partial<TestLap> = {}): TestLap => ({
  driverName: 'José María López', constants: { inPit: false }, pointsLength: Object.values(columns)[0]?.length ?? 0, columns, ...extra,
});

/** The stored form each column took, read from the uncompressed header. */
function kinds(buffer: Buffer): Record<string, string> {
  const raw = zlib.brotliDecompressSync(buffer);
  const header = JSON.parse(raw.subarray(9, 9 + raw.readUInt32LE(5)).toString('utf8')) as { columns: Array<{ key: string; column: { kind: string; decimals?: number } }> };
  return Object.fromEntries(header.columns.map(({ key, column }) => [key, column.kind + (column.decimals ?? '')]));
}

describe('binary lap columns', () => {
  it('stores every value unchanged, in the smallest exact form per column', () => {
    const n = 500;
    const stored = lap({
      x: Array.from({ length: n }, (_, i) => Number((-133.8517 + i * 1.2345).toFixed(4))),
      timeSec: Array.from({ length: n }, (_, i) => Number((86_000 + i * 0.0213).toFixed(4))),
      speedKmh: Array.from({ length: n }, (_, i) => Number((i * 0.37).toFixed(2))),
      gear: Array.from({ length: n }, (_, i) => (i % 7) - 1),
      float32: Array.from({ length: n }, (_, i) => Math.fround(i / 3)),
      float64: Array.from({ length: n }, (_, i) => i / 3),
      huge: Array.from({ length: n }, (_, i) => 1e12 + i),
      isOffTrack: Array.from({ length: n }, (_, i) => (i === 7 ? null : i % 3 === 0)),
      brakeTemps: Array.from({ length: n }, (_, i) => (i < 2 ? null : [400 + i, 401, 402, 403] as [number, number, number, number])),
      mixed: Array.from({ length: n }, (_, i) => (i % 2 ? 1 : true)),
      gaps: Array.from({ length: n }, (_, i) => (i % 10 === 0 ? null : i * 0.5)),
    });
    const buffer = encodeLapColumns(stored);
    expect(decodeLapColumns<TestLap>(buffer)).toStrictEqual(stored);
    expect(kinds(buffer)).toEqual({
      x: 'scaled4', timeSec: 'scaled4', speedKmh: 'scaled2', gear: 'scaled0', float32: 'f32', float64: 'f64', huge: 'f64',
      isOffTrack: 'bool', brakeTemps: 'tuple4', mixed: 'json', gaps: 'scaled1',
    });
  });

  it('keeps values JSON cannot hold: signed zero, NaN and infinities', () => {
    const stored = lap({ v: [0, -0, Number.NaN, Number.POSITIVE_INFINITY, 1.5] });
    const decoded = decodeLapColumns<TestLap>(encodeLapColumns(stored)).columns.v;
    expect(Object.is(decoded[1], -0)).toBe(true);
    expect(decoded).toStrictEqual(stored.columns.v);
  });

  it('preserves null runs and signed deltas at each decimal scale and the scaled limit', () => {
    const columns: Record<string, LapColumn> = {};
    for (let decimals = 0; decimals <= 4; decimals++) {
      const factor = 10 ** decimals;
      columns[`scale${decimals}`] = [
        null, (2 ** 30 - 1) / factor, null, null, -(2 ** 30 - 1) / factor,
        1 / factor, -1 / factor, 0, null,
      ];
    }
    columns.beyondLimit = [2 ** 30, -(2 ** 30), null, null, 0, 1, 2, 3, 4];
    const stored = lap(columns);
    const buffer = encodeLapColumns(stored);
    expect(decodeLapColumns<TestLap>(buffer)).toStrictEqual(stored);
    expect(kinds(buffer)).toEqual({
      scale0: 'scaled0', scale1: 'scaled1', scale2: 'scaled2', scale3: 'scaled3', scale4: 'scaled4', beyondLimit: 'f32',
    });
  });

  it('stores a four-wheel tuple with a missing wheel without changing it', () => {
    const stored = lap({ w: [[1, 2, 3, 4], [1, null, 3, 4] as unknown as [number, number, number, number]] });
    expect(decodeLapColumns<TestLap>(encodeLapColumns(stored))).toStrictEqual(stored);
  });

  it('stores an empty lap', () => {
    const stored = lap({}, { pointsLength: 0, constants: {} });
    expect(decodeLapColumns<TestLap>(encodeLapColumns(stored))).toStrictEqual(stored);
  });

  it('decodes only the requested columns', () => {
    const stored = lap({ a: [1, 2, 3], b: [true, false, true], c: [[1, 2, 3, 4], [1, 2, 3, 4], [5, 6, 7, 8]] });
    const decoded = decodeLapColumns<TestLap>(encodeLapColumns(stored), ['c', 'a']);
    expect(decoded.columns).toStrictEqual({ a: [1, 2, 3], c: stored.columns.c });
    expect(decoded.driverName).toBe('José María López');
  });

  it('is smaller than the columnar JSON it replaces', () => {
    const n = 5000;
    const stored = lap({
      x: Array.from({ length: n }, (_, i) => Number((Math.sin(i / 300) * 500).toFixed(4))),
      z: Array.from({ length: n }, (_, i) => Number((Math.cos(i / 300) * 500).toFixed(4))),
      timeSec: Array.from({ length: n }, (_, i) => Number((i * 0.02).toFixed(4))),
    });
    const json = zlib.brotliCompressSync(Buffer.from(JSON.stringify(stored)), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } });
    expect(encodeLapColumns(stored).length).toBeLessThan(json.length * 0.6);
  });

  it('refuses a row that is not in the binary format', () => {
    const json = zlib.brotliCompressSync(Buffer.from(JSON.stringify(lap({ a: [1] }))));
    expect(() => decodeLapColumns(json)).toThrow(/replay cache rewrite/);
  });
});
