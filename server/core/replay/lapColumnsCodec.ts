import zlib from 'node:zlib';

/**
 * Binary storage of a lap's columns (replay_trajectories.trajectory_br), see docs/REPLAY_CACHE_FORMAT.md.
 *
 * Layout, Brotli-compressed: magic `LMTB`, one byte encoding version, a u32 header length, the header JSON (the lap
 * without its columns, plus one descriptor per column), then each column's parts. Each column takes the smallest
 * exact form: whole numbers with 0-4 decimals as Int32 deltas in byte planes, else float32, else float64; booleans
 * as bytes; four-wheel tuples as four numeric columns. The encoder reads every column back and falls back to a wider
 * form on any difference, so storage never changes a value.
 */

export type LapValue = number | boolean | [number, number, number, number];
export type LapColumn = Array<LapValue | null>;

export interface StoredLapColumns {
  pointsLength: number;
  columns: Record<string, LapColumn>;
}

const MAGIC = Buffer.from('LMTB', 'latin1');
const ENCODING_VERSION = 1;
const PREFIX_BYTES = MAGIC.length + 1 + 4;
const MAX_DECIMALS = 4;
/** Scaled values stay below this, so the delta of two of them fits an Int32. */
const MAX_SCALED = 2 ** 30;
const BROTLI_QUALITY = 9;

type NumberKind = { kind: 'scaled'; decimals: number } | { kind: 'f32' } | { kind: 'f64' };
type Descriptor =
  | (NumberKind & { nullable: boolean; parts: number[] })
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

/** The bytes of a typed array as 4 planes (all first bytes, then all second bytes...): smooth deltas compress far better. */
function toPlanes(values: Int32Array): Buffer {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  const out = Buffer.allocUnsafe(bytes.length);
  const n = values.length;
  for (let i = 0; i < n; i++) for (let b = 0; b < 4; b++) out[b * n + i] = bytes[i * 4 + b];
  return out;
}

function fromPlanes(planes: Buffer): Int32Array {
  const n = planes.length / 4;
  const bytes = new Uint8Array(planes.length);
  for (let i = 0; i < n; i++) for (let b = 0; b < 4; b++) bytes[i * 4 + b] = planes[b * n + i];
  return new Int32Array(bytes.buffer);
}

const scale = (decimals: number) => 10 ** decimals;
const unscale = (scaled: number, decimals: number) => scaled / scale(decimals) + 0;

function numberKind(values: ReadonlyArray<number | null>): NumberKind {
  for (let decimals = 0; decimals <= MAX_DECIMALS; decimals++) {
    const factor = scale(decimals);
    if (values.every(v => v === null || (Math.abs(v * factor) < MAX_SCALED && Object.is(unscale(Math.round(v * factor), decimals), v)))) {
      return { kind: 'scaled', decimals };
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
  if (kind.kind === 'scaled') {
    const factor = scale(kind.decimals);
    const deltas = new Int32Array(values.length);
    let previous = 0;
    values.forEach((v, i) => {
      const scaled = v === null ? previous : Math.round(v * factor);
      deltas[i] = scaled - previous;
      previous = scaled;
    });
    data = toPlanes(deltas);
  } else {
    const array = kind.kind === 'f32' ? Float32Array.from(values, v => v ?? 0) : Float64Array.from(values, v => v ?? 0);
    data = Buffer.from(array.buffer);
  }
  const parts = mask ? [mask, data] : [data];
  return { descriptor: { ...kind, nullable: mask !== null, parts: parts.map(p => p.length) }, parts };
}

function encodeCandidate(values: LapColumn, numberForm?: NumberKind): Encoded {
  if (values.every(v => v === null || typeof v === 'boolean')) {
    const part = Buffer.from(values.map(v => (v === null ? 2 : v ? 1 : 0)));
    return { descriptor: { kind: 'bool', parts: [part.length] }, parts: [part] };
  }
  if (values.every(v => v === null || isNumber(v))) {
    const numbers = values as Array<number | null>;
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

function decodeNumbers(descriptor: NumberKind & { nullable: boolean }, length: number, take: () => Buffer): Array<number | null> {
  const mask = descriptor.nullable ? take() : null;
  const data = take();
  const out = new Array<number | null>(length);
  if (descriptor.kind === 'scaled') {
    const deltas = fromPlanes(data);
    let scaled = 0;
    for (let i = 0; i < length; i++) {
      scaled += deltas[i];
      out[i] = mask && mask[i] ? null : unscale(scaled, descriptor.decimals);
    }
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
    default:
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
