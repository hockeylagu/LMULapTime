import fs from 'node:fs';

/**
 * The replay's track surface state (docs/VCR_FORMAT.md §4.21): four bytes per surface element (rubber laid, loose material, surface
 * water, surface temperature), reset by opcode 194, seeded by opcode 139 and updated by opcode 137.
 */
export const OP_SURFACE_UPDATE = 137, OP_SURFACE_INITIAL = 139, OP_SURFACE_RESET = 194;
/** Bytes per surface element: the four channels, channel c at byte c. */
export const SURFACE_CHANNELS = 4;
/** Samples per block, and the elements an initial-state block covers (four planes of 40). */
const BLOCK_SAMPLES = 160, INITIAL_ELEMENTS = 40;

/** One surface event of the replay, in stream order, with the file offset of the slice it is in. */
export interface ReplaySurfaceEvent { time: number; op: number; payload: Buffer; offset: number }
/** The file offset of the first slice of a replay's frame stream. */
export const FIRST_SLICE_OFFSET = 61;

/** Reads `width` bits least significant first; past the end of the payload it throws (a block never runs over its payload). */
function bitReader(payload: Uint8Array) {
  let bit = 0;
  const end = payload.length * 8;
  return {
    read(width: number): number {
      if (bit + width > end) throw Error(`Surface block runs past its ${payload.length}-byte payload`);
      let value = 0;
      for (let i = 0; i < width; i++, bit++) value |= ((payload[bit >> 3] >> (bit & 7)) & 1) << i;
      return value >>> 0;
    },
    /** Whether another block follows: at least one whole byte after rounding the position up to a byte. */
    more: () => ((bit + 7) >> 3) < payload.length,
  };
}

/** The 160 bytes of one block's runs (§4.21): 4-bit values come back × 17. */
function readRuns(bits: ReturnType<typeof bitReader>, wide: boolean, out: Uint8Array, skipped: Uint8Array): void {
  const width = wide ? 8 : 4, scale = wide ? 1 : 17;
  let at = 0;
  while (at < BLOCK_SAMPLES) {
    const remaining = BLOCK_SAMPLES - at;
    const repeat = remaining > 1 ? bits.read(1) === 1 : false;
    let length: number;
    if (remaining <= (wide ? 3 : 4)) length = remaining;
    else {
      length = 1;
      let limit = remaining - 1;
      for (;;) {
        const count = bits.read(limit <= 3 ? 2 : limit <= 7 ? 3 : 4);
        length += count;
        // A count of 15 continues, even where it leaves no limit (the next count is then 0, in 2 bits).
        if (count !== 15) break;
        limit -= 15;
      }
    }
    if (at + length > BLOCK_SAMPLES) throw Error(`Surface run of ${length} overruns its block at ${at}`);
    if (repeat) {
      const value = bits.read(width) * scale;
      out.fill(value, at, at + length);
      skipped.fill(wide ? 0 : 1, at, at + length);
    } else {
      for (let i = 0; i < length; i++) { out[at + i] = bits.read(width) * scale; skipped[at + i] = wide ? 0 : 1; }
    }
    at += length;
  }
}

/**
 * Writes a 4-bit sample unless the stored byte already rounds to the same 4-bit level, so finer 8-bit detail stays; 8-bit samples
 * always write.
 */
function store(state: Uint8Array, at: number, value: number, coarse: number): void {
  if (coarse && Math.floor((state[at] + 8) / 17) * 17 === value) return;
  state[at] = value;
}

/**
 * Applies one surface event to `state` (`elements` × 4 bytes) as its end state: a reset writes its four bytes to every element; an
 * initial or update block writes its samples to consecutive elements, wrapping at the end of the array.
 */
export function applySurfaceEvent(state: Uint8Array, elements: number, op: number, payload: Uint8Array): void {
  if (state.length !== elements * SURFACE_CHANNELS) throw Error(`Surface state of ${state.length} bytes for ${elements} elements`);
  if (op === OP_SURFACE_RESET) {
    if (payload.length !== 6) throw Error(`Surface reset of ${payload.length} bytes`);
    for (let e = 0; e < elements; e++) state.set(payload.subarray(2, 6), e * SURFACE_CHANNELS);
    return;
  }
  if (op !== OP_SURFACE_UPDATE && op !== OP_SURFACE_INITIAL) throw Error(`Opcode ${op} is not a surface event`);
  const bits = bitReader(payload), values = new Uint8Array(BLOCK_SAMPLES), coarse = new Uint8Array(BLOCK_SAMPLES);
  do {
    const channel = op === OP_SURFACE_UPDATE ? bits.read(2) : -1;
    const start = bits.read(21), wide = bits.read(1) === 1;
    readRuns(bits, wide, values, coarse);
    if (channel >= 0) {
      for (let i = 0; i < BLOCK_SAMPLES; i++) store(state, ((start + i) % elements) * SURFACE_CHANNELS + channel, values[i], coarse[i]);
    } else {
      for (let c = 0; c < SURFACE_CHANNELS; c++) for (let i = 0; i < INITIAL_ELEMENTS; i++) {
        const sample = c * INITIAL_ELEMENTS + i;
        store(state, ((start + i) % elements) * SURFACE_CHANNELS + c, values[sample], coarse[sample]);
      }
    }
  } while (bits.more());
}

/**
 * The surface events of a replay file in stream order (the frame stream walk of `extractReplayDriverTrajectories`, keeping opcodes
 * 137, 139 and 194 only), from the slice at `from` (an event's `offset`, else the first slice). Synchronous file reads: call it from
 * a worker thread.
 */
export function* readReplaySurfaceEvents(filePath: string, from = FIRST_SLICE_OFFSET): Generator<ReplaySurfaceEvent, void, void> {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0);
    if (head.subarray(45, 49).toString('ascii') !== 'IRSR') throw Error(`Invalid replay file: missing IRSR magic tag in ${filePath}`);
    const end = Math.min(head.readUInt32LE(53), fs.fstatSync(fd).size);
    const CHUNK = 16 * 1024 * 1024, buf = Buffer.alloc(CHUNK);
    let filePos = from, carry = 0;
    while (filePos < end) {
      const want = Math.min(CHUNK - carry, end - filePos);
      if (want <= 0) break;
      fs.readSync(fd, buf, carry, want, filePos);
      const length = carry + want, bufferStart = filePos - carry;
      filePos += want;
      let sp = 0;
      for (;;) {
        if (sp + 6 > length) break;
        const sliceTime = buf.readFloatLE(sp), count = buf.readUInt16LE(sp + 4);
        if (count > 250 || sliceTime < 0 || sliceTime > 100000) { filePos = end; break; }
        // A whole slice must be in the buffer before any of its events is taken.
        let probe = sp + 6, whole = true;
        for (let e = 0; e < count; e++) {
          if (probe + 4 > length) { whole = false; break; }
          probe += 5 + ((buf.readUInt32LE(probe) >>> 8) & 0x1ff);
          if (probe > length) { whole = false; break; }
        }
        if (!whole) break;
        let at = sp + 6;
        for (let e = 0; e < count; e++) {
          const header = buf.readUInt32LE(at), size = (header >>> 8) & 0x1ff, op = (header >>> 17) & 0x1ff;
          if ((header & 0xff) === 255 && (op === OP_SURFACE_UPDATE || op === OP_SURFACE_INITIAL || op === OP_SURFACE_RESET)) {
            yield {time: sliceTime + buf[at + 4] / 4000, op, payload: Buffer.from(buf.subarray(at + 5, at + 5 + size)), offset: bufferStart + sp};
          }
          at += 5 + size;
        }
        sp = at;
      }
      carry = length - sp;
      if (carry > 0) buf.copy(buf, 0, sp, length);
    }
  } finally { fs.closeSync(fd); }
}
