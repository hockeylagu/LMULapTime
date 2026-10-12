import zlib from 'node:zlib';
import assert from 'node:assert/strict';

// Experimental, lossless column codec. No production schema depends on this format.
export function encodeColumns(points, metadata = {}, quality = 6) {
  const descriptors = [];
  const buffers = [];
  let offset = 0;
  const add = buffer => { const start = offset; buffers.push(buffer); offset += buffer.length; return start; };
  const keys = new Set(points.flatMap(point => Object.keys(point)));
  for (const key of keys) {
    const values = points.map(point => point[key]);
    const first = values[0];
    const jsonSafe = value => typeof value !== 'number' || (Number.isFinite(value) && !Object.is(value, -0));
    if (first !== undefined && (Array.isArray(first) ? first.every(jsonSafe) : jsonSafe(first)) && values.every(value => equal(value, first))) {
      descriptors.push({ key, constant: first });
      continue;
    }
    const present = values.find(value => value !== undefined && value !== null);
    const numericArray = Array.isArray(present) && present.every(value => typeof value === 'number')
      && values.every(value => value == null || (Array.isArray(value) && value.length === present.length));
    const type = typeof present === 'boolean' ? 'bool' : numericArray ? 'array'
      : typeof present === 'number' ? 'number' : 'json';
    const mask = Buffer.from(values.map(value => value === undefined ? 0 : value === null ? 2 : 1));
    const maskOffset = add(mask);
    if (type === 'json') {
      const data = Buffer.from(JSON.stringify(values.map(value => value ?? null)));
      descriptors.push({ key, type, maskOffset, offset: add(data), bytes: data.length });
      continue;
    }
    const width = type === 'array' ? present.length : 1;
    const data = Buffer.alloc(points.length * width * (type === 'bool' ? 1 : 8));
    values.forEach((value, index) => {
      if (value === undefined || value === null) return;
      if (type === 'bool') data[index] = value ? 1 : 0;
      else for (let column = 0; column < width; column++) {
        data.writeDoubleLE(type === 'array' ? value[column] : value, (column * points.length + index) * 8);
      }
    });
    descriptors.push({ key, type, width, maskOffset, offset: add(data), bytes: data.length });
  }
  const header = Buffer.from(JSON.stringify({ version: 1, length: points.length, metadata, descriptors }));
  const prefix = Buffer.alloc(4); prefix.writeUInt32LE(header.length);
  return zlib.brotliCompressSync(Buffer.concat([prefix, header, ...buffers]), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality },
  });
}

export function decodeColumns(blob) {
  const buffer = zlib.brotliDecompressSync(blob);
  const headerLength = buffer.readUInt32LE();
  const header = JSON.parse(buffer.toString('utf8', 4, 4 + headerLength));
  assert.equal(header.version, 1);
  const start = 4 + headerLength;
  const jsonColumns = new Map();
  function point(index) {
    assert(index >= 0 && index < header.length);
    const result = {};
    for (const descriptor of header.descriptors) {
      const { key, type, offset, maskOffset, width } = descriptor;
      if ('constant' in descriptor) { result[key] = descriptor.constant; continue; }
      const state = buffer[start + maskOffset + index];
      if (state === 0) continue;
      if (state === 2) { result[key] = null; continue; }
      if (type === 'bool') result[key] = buffer[start + offset + index] === 1;
      else if (type === 'number') result[key] = buffer.readDoubleLE(start + offset + index * 8);
      else if (type === 'array') result[key] = Array.from({ length: width }, (_, column) =>
        buffer.readDoubleLE(start + offset + (column * header.length + index) * 8));
      else {
        if (!jsonColumns.has(key)) jsonColumns.set(key, JSON.parse(buffer.toString('utf8', start + offset, start + offset + descriptor.bytes)));
        result[key] = jsonColumns.get(key)[index];
      }
    }
    return result;
  }
  return { metadata: header.metadata, length: header.length, point };
}

export function equal(a, b) {
  return Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((value, index) => Object.is(value, b[index])) : Object.is(a, b);
}

// Prepared views reference source samples; store only new/changed channel values.
export function encodeView(sourcePoints, view) {
  const byTime = new Map(sourcePoints.map((point, index) => [point.timeSec, index]));
  const deltas = view.points.map(point => {
    const sourceIndex = byTime.get(point.timeSec) ?? -1;
    const source = sourcePoints[sourceIndex] ?? {};
    const delta = { _sourceIndex: sourceIndex };
    for (const [key, value] of Object.entries(point)) if (!equal(value, source[key])) delta[key] = value;
    // Explicitly record source fields removed by preparation.
    delta._removed = Object.keys(source).filter(key => !(key in point));
    return delta;
  });
  const { points: _points, ...metadata } = view;
  return encodeColumns(deltas, metadata);
}

export function assembleView(source, prepared) {
  const points = Array.from({ length: prepared.length }, (_, index) => {
    const { _sourceIndex, _removed, ...changes } = prepared.point(index);
    const point = _sourceIndex >= 0 ? source.point(_sourceIndex) : {};
    for (const key of _removed ?? []) delete point[key];
    return Object.assign(point, changes);
  });
  return { ...prepared.metadata, points };
}

export function verifyCodec() {
  const points = [{ x: -0, active: false, wheels: [1, 2, 3, 4], absent: undefined, nullable: null },
    { x: Math.PI, active: true, wheels: [4, 3, 2, 1], text: 'kerb', nullable: 1 }];
  const decoded = decodeColumns(encodeColumns(points));
  const normalized = points.map(point => Object.fromEntries(Object.entries(point).filter(([, value]) => value !== undefined)));
  assert.deepEqual(normalized, points.map((_, index) => decoded.point(index)));
  const view = { points: [{ ...points[1], x: 4 }, { x: 8, timeSec: 0.25 }], bounds: {} };
  // Real samples have timeSec; include distinct clocks for this deduplication check.
  const source = points.map((point, index) => ({ ...point, timeSec: index }));
  view.points[0].timeSec = 1;
  assert.deepEqual(assembleView(decodeColumns(encodeColumns(source)), decodeColumns(encodeView(source, view))),
    { ...view, points: view.points.map(point => Object.fromEntries(Object.entries(point).filter(([, value]) => value !== undefined))) });
}
