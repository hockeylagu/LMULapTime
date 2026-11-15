import fs from 'node:fs';
import { OP_SURFACE_RESET } from '../../../../server/replay/decode/replaySurface.js';

/** Writes fields least significant bit first, as surface payloads are read (docs/VCR_FORMAT.md §4.21). */
export function bitWriter() {
  const bits: number[] = [];
  return {
    write(value: number, width: number) { for (let i = 0; i < width; i++) bits.push((value >>> i) & 1); return this; },
    bytes(): Buffer {
      const out = Buffer.alloc(Math.ceil(bits.length / 8));
      bits.forEach((bit, i) => { out[i >> 3] |= bit << (i & 7); });
      return out;
    },
  };
}

type Writer = ReturnType<typeof bitWriter>;

/** One run of `length` samples at `at` of a 160-sample block: the repeat flag, then the length counts the decoder reads. */
export function writeRun(writer: Writer, at: number, length: number, wide: boolean, values: number[]): void {
  const remaining = 160 - at;
  if (remaining > 1) writer.write(values.length === 1 ? 1 : 0, 1);
  if (remaining > (wide ? 3 : 4)) {
    let limit = remaining - 1, left = length - 1;
    for (;;) {
      const width = limit <= 3 ? 2 : limit <= 7 ? 3 : 4, count = Math.min(left, 15);
      writer.write(count, width);
      left -= count;
      if (count !== 15) break;
      limit -= 15;
    }
  }
  for (const value of values) writer.write(value, wide ? 8 : 4);
}

/** A block of opcode 137 (with `channel`) or 139 (without) whose 160 samples are one repeated value. */
export function repeatBlock(writer: Writer, channel: number | null, start: number, wide: boolean, value: number): void {
  if (channel !== null) writer.write(channel, 2);
  writer.write(start, 21).write(wide ? 1 : 0, 1);
  writeRun(writer, 0, 160, wide, [value]);
}

/** A replay file of surface events only: the header the reader checks, then one slice per event at its time. */
export function writeSurfaceReplay(filePath: string, events: Array<{time: number; op: number; payload: Buffer}>): void {
  const slices = events.map(({time, op, payload}) => {
    const slice = Buffer.alloc(6 + 5 + payload.length);
    slice.writeFloatLE(time, 0); slice.writeUInt16LE(1, 4);
    slice.writeUInt32LE(255 | (payload.length << 8) | (op << 17), 6);
    payload.copy(slice, 11);
    return slice;
  });
  const head = Buffer.alloc(61);
  head.write('IRSR', 45, 'ascii');
  const body = Buffer.concat(slices);
  head.writeUInt32LE(61 + body.length, 53);
  fs.writeFileSync(filePath, Buffer.concat([head, body]));
}

export const resetPayload = (rubber: number, loose: number, water: number, temperature: number): Buffer =>
  Buffer.from([7, 7, rubber, loose, water, temperature]);
export { OP_SURFACE_RESET };
