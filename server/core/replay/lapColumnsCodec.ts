import zlib from 'node:zlib';

/**
 * Binary storage of a lap's columns (replay_trajectories.trajectory_br), see docs/REPLAY_CACHE_FORMAT.md.
 *
 * Layout, Brotli-compressed: magic `LMTB`, one byte encoding version, a u32 header length, the header JSON (the lap
 * without its columns, plus one descriptor per column), then each column's parts. Each column takes the smallest
 * exact form: numbers with 0-4 decimals (or a power-of-two fraction) as whole step counts, differenced 0-3 times,
 * zigzagged and stored in as many byte planes as they need; else float32, else float64; booleans as bytes;
 * four-wheel tuples as four numeric columns. The encoder reads every column back and falls back to a wider
 * form on any difference, so storage never changes a value.
 */

export type LapValue = number | boolean | [number, number, number, number];
export type LapColumn = Array<LapValue | null>;

export interface StoredLapColumns {
  pointsLength: number;
  columns: Record<string, LapColumn>;
}

const MAGIC = Buffer.from('LMTB', 'latin1');
const ENCODING_VERSION = 2;
const PREFIX_BYTES = MAGIC.length + 1 + 4;
const MAX_DECIMALS = 4;
/** Scaled values stay below this, so their residuals stay exact in a double. */
const MAX_SCALED = 2 ** 30;
/** Difference orders tried per column: 0 for held values, 1 for most channels, 2-3 for smooth ones (time, position). */
const MAX_ORDER = 3;
/** A zigzagged residual must fit four byte planes. */
const MAX_ZIGZAG = 2 ** 32;
const BROTLI_QUALITY = 9;

/**
 * `scaled`: value = n × step / factor, factor 10^decimals, or 2^decimals when `binary`; step defaults to 1. The step
 * counts n are differenced `order` times, zigzagged and stored in `width` byte planes.
 */
type ScaledForm = { kind: 'scaled'; decimals: number; binary?: true };
type NumberKind = ScaledForm | { kind: 'f32' } | { kind: 'f64' };
type NumberDescriptor = { kind: 'f32' | 'f64' } | (ScaledForm & { step?: number; order: number; width: number });
type Descriptor =
  | (NumberDescriptor & { nullable: boolean; parts: number[] })
  | { kind: 'bool'; parts: number[] }
  | { kind: 'tuple4'; nullable: boolean; items: Descriptor[]; parts: number[] }
  | { kind: 'json'; parts: number[] };

interface Header { lap: Record<string, unknown>; columns: Array<{ key: string; column: Descriptor }> }
interface Encoded { descriptor: Descriptor; parts: Buffer[] }

const isNumber = (value: unknown): value is number => typeof value === 'number';
const isTuple = (value: unknown): value is [number, number, number, number] =>
  Array.isArray(value) && value.length === 4 && value.every(isNumber);

function sameValue(left: LapValue | null, right: LapValue | null): boolean {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((v, i) => Object.is(v, right[i]));
  return Object.is(left, right);
}

const zigzag = (r: number) => (r >= 0 ? 2 * r : -2 * r - 1);
const unzigzag = (z: number) => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);
const bytesFor = (z: number) => (z < 0x100 ? 1 : z < 0x10000 ? 2 : z < 0x1000000 ? 3 : 4);

/** Unsigned values below 2^32 as `width` planes (all first bytes, then all second bytes...): small values compress best. */
function toPlanes(values: readonly number[], width: number): Buffer {
  const n = values.length;
  const out = Buffer.alloc(n * width);
  for (let i = 0; i < n; i++) {
    let v = values[i];
    for (let plane = 0; plane < width; plane++) {
      out[plane * n + i] = v & 0xff;
      v = Math.floor(v / 0x100);
    }
  }
  return out;
}

function fromPlanes(planes: Buffer, width: number): number[] {
  const n = planes.length / width;
  const out = new Array<number>(n).fill(0);
  for (let plane = width - 1; plane >= 0; plane--) {
    const offset = plane * n;
    for (let i = 0; i < n; i++) out[i] = out[i] * 0x100 + planes[offset + i];
  }
  return out;
}

/** The residuals of the order (0-3) whose zigzagged values need the fewest bits; order 0 always fits. */
function smallestResiduals(units: readonly number[]): { order: number; values: number[] } {
  let best = { order: 0, values: units.map(zigzag), bits: Infinity };
  let residual = [...units];
  for (let order = 0; order <= MAX_ORDER; order++) {
    if (order > 0) residual = residual.map((v, i) => (i === 0 ? v : v - residual[i - 1]));
    const values = residual.map(zigzag);
    if (values.some(z => z >= MAX_ZIGZAG)) continue;
    const bits = values.reduce((sum, z) => sum + Math.log2(1 + z), 0);
    if (bits < best.bits) best = { order, values, bits };
  }
  return best;
}

function integrate(values: number[], order: number): number[] {
  for (let k = 0; k < order; k++) for (let i = 1; i < values.length; i++) values[i] += values[i - 1];
  return values;
}

const MAX_BINARY_BITS = 16;
const scale = (kind: { decimals: number; binary?: true }) => (kind.binary ? 2 ** kind.decimals : 10 ** kind.decimals);
const gcd = (a: number, b: number): number => { while (b) [a, b] = [b, a % b]; return a; };

function numberKind(values: ReadonlyArray<number | null>): NumberKind {
  const forms: Array<{ decimals: number; binary?: true }> = [];
  for (let decimals = 0; decimals <= MAX_DECIMALS; decimals++) forms.push({ decimals });
  for (let bits = 1; bits <= MAX_BINARY_BITS; bits++) forms.push({ decimals: bits, binary: true });
  for (const form of forms) {
    const factor = scale(form);
    if (values.every(v => v === null || (Math.abs(v * factor) < MAX_SCALED && Object.is(Math.round(v * factor) / factor + 0, v)))) {
      return { kind: 'scaled', ...form };
    }
  }
  return values.every(v => v === null || Object.is(Math.fround(v), v)) ? { kind: 'f32' } : { kind: 'f64' };
}

function nullMask(values: ReadonlyArray<unknown>): Buffer | null {
  return values.includes(null) ? Buffer.from(values.map(v => (v === null ? 1 : 0))) : null;
}

function encodeNumbers(values: ReadonlyArray<number | null>, kind: NumberKind): Encoded {
  const mask = nullMask(values);
  let data: Buffer;
  let form: NumberDescriptor;
  if (kind.kind === 'scaled') {
    const factor = scale(kind);
    const scaled = values.map(v => (v === null ? null : Math.round(v * factor)));
    // Values on a coarser grid (wheel speed in 1/16 steps, load in 1000s) store their step count.
    const step = scaled.reduce<number>((g, v) => (v === null ? g : gcd(g, Math.abs(v))), 0) || 1;
    // A null keeps the previous count, so it adds nothing to the residuals.
    let previous = 0;
    const units = scaled.map(v => (previous = v === null ? previous : v / step));
    const { order, values: residuals } = smallestResiduals(units);
    const width = residuals.reduce((most, z) => Math.max(most, bytesFor(z)), 1);
    form = { ...kind, ...(step > 1 ? { step } : {}), order, width };
    data = toPlanes(residuals, width);
  } else {
    form = kind;
    const array = kind.kind === 'f32' ? Float32Array.from(values, v => v ?? 0) : Float64Array.from(values, v => v ?? 0);
    data = Buffer.from(array.buffer);
  }
  const parts = mask ? [mask, data] : [data];
  return { descriptor: { ...form, nullable: mask !== null, parts: parts.map(p => p.length) }, parts };
}

function encodeCandidate(values: LapColumn, numberForm?: NumberKind): Encoded {
  if (values.every(v => v === null || typeof v === 'boolean')) {
    const part = Buffer.from(values.map(v => (v === null ? 2 : v ? 1 : 0)));
    return { descriptor: { kind: 'bool', parts: [part.length] }, parts: [part] };
  }
  if (values.every(v => v === null || isNumber(v))) {
    const numbers = values;
    return encodeNumbers(numbers, numberForm ?? numberKind(numbers));
  }
  if (values.every(v => v === null || isTuple(v))) {
    const mask = nullMask(values);
    const items = [0, 1, 2, 3].map(j => encodeColumn(values.map(v => (v === null ? null : (v as number[])[j]))));
    const parts = [...(mask ? [mask] : []), ...items.flatMap(item => item.parts)];
    return { descriptor: { kind: 'tuple4', nullable: mask !== null, items: items.map(item => item.descriptor), parts: parts.map(p => p.length) }, parts };
  }
  const part = Buffer.from(JSON.stringify(values), 'utf8');
  return { descriptor: { kind: 'json', parts: [part.length] }, parts: [part] };
}

/** The smallest form that reads back every value unchanged; wider forms only when a narrower one would differ. */
function encodeColumn(values: LapColumn): Encoded {
  const candidates: Array<() => Encoded> = [() => encodeCandidate(values), () => encodeCandidate(values, { kind: 'f64' })];
  for (const candidate of candidates) {
    const encoded = candidate();
    let at = 0;
    const take = () => encoded.parts[at++];
    const decoded = decodeColumn(encoded.descriptor, values.length, take);
    if (decoded.length === values.length && decoded.every((v, i) => sameValue(v, values[i]))) return encoded;
  }
  const part = Buffer.from(JSON.stringify(values), 'utf8');
  const fallback: Encoded = { descriptor: { kind: 'json', parts: [part.length] }, parts: [part] };
  const decoded = decodeColumn(fallback.descriptor, values.length, () => part);
  if (!decoded.every((v, i) => sameValue(v, values[i]))) throw new Error('Lap column cannot be stored without changing a value');
  return fallback;
}

function decodeNumbers(descriptor: NumberDescriptor & { nullable: boolean }, length: number, take: () => Buffer): Array<number | null> {
  const mask = descriptor.nullable ? take() : null;
  const data = take();
  const out = new Array<number | null>(length);
  if (descriptor.kind === 'scaled') {
    const units = integrate(fromPlanes(data, descriptor.width).map(unzigzag), descriptor.order);
    const factor = scale(descriptor);
    const step = descriptor.step ?? 1;
    for (let i = 0; i < length; i++) out[i] = mask && mask[i] ? null : (units[i] * step) / factor + 0;
  } else {
    const copy = new Uint8Array(data);
    const array = descriptor.kind === 'f32' ? new Float32Array(copy.buffer) : new Float64Array(copy.buffer);
    for (let i = 0; i < length; i++) out[i] = mask && mask[i] ? null : array[i];
  }
  return out;
}

function decodeColumn(descriptor: Descriptor, length: number, take: () => Buffer): LapColumn {
  switch (descriptor.kind) {
    case 'bool': {
      const bytes = take();
      const out: LapColumn = new Array(length);
      for (let i = 0; i < length; i++) out[i] = bytes[i] === 2 ? null : bytes[i] === 1;
      return out;
    }
    case 'tuple4': {
      const mask = descriptor.nullable ? take() : null;
      const items = descriptor.items.map(item => decodeColumn(item, length, take) as Array<number | null>);
      const out: LapColumn = new Array(length);
      for (let i = 0; i < length; i++) {
        out[i] = mask && mask[i] ? null : [items[0][i]!, items[1][i]!, items[2][i]!, items[3][i]!];
      }
      return out;
    }
    case 'json':
      return JSON.parse(take().toString('utf8')) as LapColumn;
    case 'scaled':
    case 'f32':
    case 'f64':
      return decodeNumbers(descriptor, length, take);
  }
}

export function encodeLapColumns<T extends StoredLapColumns>(lap: T): Buffer {
  const { columns, ...rest } = lap;
  const header: Header = { lap: rest, columns: [] };
  const parts: Buffer[] = [];
  for (const [key, values] of Object.entries(columns)) {
    const encoded = encodeColumn(values);
    header.columns.push({ key, column: encoded.descriptor });
    parts.push(...encoded.parts);
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const prefix = Buffer.alloc(PREFIX_BYTES);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt8(ENCODING_VERSION, MAGIC.length);
  prefix.writeUInt32LE(headerBytes.length, MAGIC.length + 1);
  const raw = Buffer.concat([prefix, headerBytes, ...parts]);
  return zlib.brotliCompressSync(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });
}

/** The lap with its columns; with `keys`, only those columns are decoded (the others are skipped, not parsed). */
export function decodeLapColumns<T extends StoredLapColumns>(buffer: Uint8Array, keys?: readonly string[]): T {
  const raw = zlib.brotliDecompressSync(buffer);
  if (raw.length < PREFIX_BYTES || !raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Replay lap row is not in the binary lap format: replay cache rewrite required (docs/REPLAY_CACHE_FORMAT.md)');
  }
  const version = raw.readUInt8(MAGIC.length);
  if (version !== ENCODING_VERSION) throw new Error(`Unknown replay lap encoding version ${version}`);
  const headerLength = raw.readUInt32LE(MAGIC.length + 1);
  const header = JSON.parse(raw.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength).toString('utf8')) as Header;
  const length = (header.lap as { pointsLength?: number }).pointsLength ?? 0;
  const wanted = keys ? new Set(keys) : null;
  let at = PREFIX_BYTES + headerLength;
  const columns: Record<string, LapColumn> = {};
  for (const { key, column } of header.columns) {
    const end = at + column.parts.reduce((sum, part) => sum + part, 0);
    if (!wanted || wanted.has(key)) {
      let offset = at;
      let part = 0;
      const take = () => {
        const bytes = raw.subarray(offset, offset + column.parts[part]);
        offset += column.parts[part++];
        return bytes;
      };
      columns[key] = decodeColumn(column, length, take);
    }
    at = end;
  }
  return { ...header.lap, columns } as unknown as T;
}
