import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractReplayTrajectory } from '../../../../server/replay/decode/replayTrajectory.js';
import { createSliceVcrBuffer } from '../../../utils/mockVcr.js';

const CHUNK_SIZE = 16 * 1024 * 1024;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-stream-boundaries-'));

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function opaqueSlice(length: number): Buffer {
  const slice = Buffer.alloc(length);
  slice.writeUInt16LE(1, 4);
  slice.writeUInt32LE(((7 << 29) | (9 << 17) | ((length - 11) << 8) | 255) >>> 0, 6);
  return slice;
}

/** Inert slices of exactly the requested byte length, each with a legal 9-bit payload. */
function padding(length: number): Buffer {
  const full = opaqueSlice(522);
  const count = Math.floor(length / full.length) - 1;
  const remaining = length - count * full.length;
  const result = Buffer.alloc(length);
  for (let i = 0; i < count; i++) full.copy(result, i * full.length);
  const split = Math.floor(remaining / 2);
  opaqueSlice(split).copy(result, count * full.length);
  opaqueSlice(remaining - split).copy(result, count * full.length + split);
  return result;
}

function withStream(original: Buffer, stream: Buffer): Buffer {
  const header = Buffer.from(original.subarray(0, 57));
  const metadata = original.subarray(original.readUInt32LE(53));
  header.writeUInt32LE(57 + stream.length, 53);
  return Buffer.concat([header, stream, metadata]);
}

const source = createSliceVcrBuffer({
  slices: [
    {
      sTime: 1, driverSlot: 1, x: 10, y: 0, z: 20,
      wheel: { tireTemps: [80, 80, 80, 80], brakeTemps: [300, 300, 200, 200] },
      timing: { splitSec: 1, sector: 1, lapIdx: 0 },
      flag: { flagState: 1, sectorMask: 1, driverFlag: 0 },
      weather: { rainIntensity: 45 },
      rawEvents: [{ evClass: 0, evType: 51, slot: 1, payload: Buffer.from([153, 0, 0]) }],
    },
    { sTime: 1.1, driverSlot: 1, x: 15, y: 0, z: 25 },
  ],
});

function extract(buffer: Buffer) {
  const filePath = path.join(directory, 'boundary.Vcr');
  fs.writeFileSync(filePath, buffer);
  return extractReplayTrajectory(filePath, { driverSlot: 1, maxPoints: 0, allLaps: true, silent: true });
}

describe('replay stream slice boundaries', () => {
  // Split the slice header, an event header, and payloads after earlier events have
  // already fit. Comparing the whole result catches duplicated events and stale state.
  it.each([2, 8, 50, 120, 180])('retains an identical trajectory when a slice crosses a chunk at byte %i', offset => {
    const expected = extract(source);
    const streamEnd = source.readUInt32LE(53);
    const stream = Buffer.concat([
      source.subarray(57, 61),
      padding(CHUNK_SIZE - 4 - offset),
      source.subarray(61, streamEnd),
    ]);
    expect(extract(withStream(source, stream))).toEqual(expected);
  });

  it('discards a truncated slice as a whole, including its earlier complete events', () => {
    const complete = createSliceVcrBuffer({ slices: [{ sTime: 1, driverSlot: 1, x: 10, y: 0, z: 20 }] });
    const withIncomplete = createSliceVcrBuffer({ slices: [
      { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 20 },
      { sTime: 2, driverSlot: 1, x: 15, y: 0, z: 25, flag: { flagState: 1, sectorMask: 1, driverFlag: 0 } },
    ] });
    const truncated = withIncomplete.subarray(57, withIncomplete.readUInt32LE(53) - 1);
    expect(extract(withStream(withIncomplete, truncated))).toEqual(extract(complete));
  });
});
