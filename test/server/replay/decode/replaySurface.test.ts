import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySurfaceEvent, OP_SURFACE_INITIAL, OP_SURFACE_RESET, OP_SURFACE_UPDATE, readReplaySurfaceEvents } from '../../../../server/replay/decode/replaySurface.js';
import { bitWriter, repeatBlock, resetPayload, writeRun, writeSurfaceReplay } from './surfaceFixture.js';

const channel = (state: Uint8Array, element: number, c: number) => state[element * 4 + c];

describe('surface events', () => {
  it('resets every element to the reset bytes', () => {
    const state = new Uint8Array(3 * 4);
    applySurfaceEvent(state, 3, OP_SURFACE_RESET, resetPayload(0, 255, 0, 147));
    expect([...state]).toEqual([0, 255, 0, 147, 0, 255, 0, 147, 0, 255, 0, 147]);
  });

  it('writes an update block to one channel of consecutive elements, wrapping at the end of the array', () => {
    const elements = 200, state = new Uint8Array(elements * 4), writer = bitWriter();
    repeatBlock(writer, 2, 150, true, 90);
    applySurfaceEvent(state, elements, OP_SURFACE_UPDATE, writer.bytes());
    expect(channel(state, 150, 2)).toBe(90);
    expect(channel(state, 199, 2)).toBe(90);
    // 160 samples from 150: the last 110 wrap to elements 0..109.
    expect(channel(state, 109, 2)).toBe(90);
    expect(channel(state, 110, 2)).toBe(0);
    expect(channel(state, 150, 0)).toBe(0);
  });

  it('reads literal runs and a count of 15 that leaves no limit, and several blocks in one payload', () => {
    const elements = 400, state = new Uint8Array(elements * 4), writer = bitWriter();
    // Block 1, 8-bit: a literal run of 2, then a repeat of 158 (counts 15 × 10 + 7 against limits 157 .. 7).
    writer.write(0, 2).write(10, 21).write(1, 1);
    writeRun(writer, 0, 2, true, [11, 12]);
    writeRun(writer, 2, 158, true, [40]);
    // Block 2, 8-bit: a repeat of 144, then one of the last 16 (a count of 15 leaves a limit of 0: a 2-bit count of 0 follows).
    writer.write(1, 2).write(300, 21).write(1, 1);
    writeRun(writer, 0, 144, true, [6]);
    writeRun(writer, 144, 16, true, [5]);
    applySurfaceEvent(state, elements, OP_SURFACE_UPDATE, writer.bytes());
    expect([channel(state, 10, 0), channel(state, 11, 0), channel(state, 12, 0), channel(state, 169, 0)]).toEqual([11, 12, 40, 40]);
    expect([channel(state, 300, 1), channel(state, 43, 1), channel(state, 44, 1), channel(state, 59, 1), channel(state, 60, 1)]).toEqual([6, 6, 5, 5, 0]);
  });

  it('expands 4-bit samples by 17 and keeps a finer byte that rounds to the same 4-bit level', () => {
    const elements = 160, state = new Uint8Array(elements * 4);
    state[0] = 100; // Rounds to 102 (level 6): a 4-bit 6 leaves it.
    state[4] = 60; // Level 4: a 4-bit 6 writes 102.
    const writer = bitWriter();
    repeatBlock(writer, 0, 0, false, 6);
    applySurfaceEvent(state, elements, OP_SURFACE_UPDATE, writer.bytes());
    expect([channel(state, 0, 0), channel(state, 1, 0), channel(state, 2, 0)]).toEqual([100, 102, 102]);
  });

  it('writes an initial block as four planes of 40 elements', () => {
    const elements = 100, state = new Uint8Array(elements * 4), writer = bitWriter();
    writer.write(20, 21).write(1, 1);
    for (let plane = 0; plane < 4; plane++) writeRun(writer, plane * 40, 40, true, [10 * (plane + 1)]);
    applySurfaceEvent(state, elements, OP_SURFACE_INITIAL, writer.bytes());
    expect([...state.subarray(20 * 4, 21 * 4)]).toEqual([10, 20, 30, 40]);
    expect([...state.subarray(59 * 4, 60 * 4)]).toEqual([10, 20, 30, 40]);
    expect([...state.subarray(60 * 4, 61 * 4)]).toEqual([0, 0, 0, 0]);
  });

  it('refuses a block that runs past its payload', () => {
    const writer = bitWriter();
    writer.write(0, 2).write(0, 21).write(1, 1);
    expect(() => applySurfaceEvent(new Uint8Array(400), 100, OP_SURFACE_UPDATE, writer.bytes())).toThrow(/runs past/);
  });
});

describe('replay surface events in a file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-')), file = path.join(dir, 'surface.Vcr');
  afterEach(() => fs.rmSync(file, {force: true}));

  const update = (c: number, start: number, value: number) => { const writer = bitWriter(); repeatBlock(writer, c, start, true, value); return writer.bytes(); };

  it('reads the surface events in order with their times and slice offsets', () => {
    writeSurfaceReplay(file, [{time: 1, op: OP_SURFACE_RESET, payload: resetPayload(0, 255, 0, 100)}, {time: 2.5, op: OP_SURFACE_UPDATE, payload: update(0, 0, 9)}]);
    const events = [...readReplaySurfaceEvents(file)];
    expect(events.map(event => [event.op, event.time])).toEqual([[OP_SURFACE_RESET, 1], [OP_SURFACE_UPDATE, 2.5]]);
    expect([...readReplaySurfaceEvents(file, events[1].offset)].map(event => event.time)).toEqual([2.5]);
  });
});
