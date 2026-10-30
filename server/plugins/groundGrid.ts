import { validateSceneGlb } from './sceneGlb.js';

interface Glb {
  bufferViews: Array<{buffer: number; byteOffset?: number; byteLength: number}>;
  accessors: Array<{bufferView: number; byteOffset?: number; componentType: number; type: string; count: number}>;
  meshes: Array<{name?: string; primitives: Array<{attributes: {POSITION: number}; indices: number}>}>;
}

function integer(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error('Invalid ground-grid count');
  return value;
}

function header(bytes: Buffer, total: number): {doc: Glb; start: number} {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== total) throw Error('Invalid ground-grid GLB');
  const n = integer(bytes.readUInt32LE(12), 1_000_000), start = n + 28;
  if (n % 4 || start > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(start - 4) !== 0x004e4942 || bytes.readUInt32LE(start - 8) !== total - start) throw Error('Invalid ground-grid chunks');
  return {doc: JSON.parse(bytes.toString('utf8', 20, n + 20)) as Glb, start};
}

function accessor(doc: Glb, index: number, total: number, componentType: number, type: string): {offset: number; count: number} {
  const a = doc.accessors[integer(index, doc.accessors.length - 1)];
  const v = doc.bufferViews[integer(a.bufferView, doc.bufferViews.length - 1)];
  const count = integer(a.count, 12_000_000), width = type === 'VEC3' ? 12 : 4;
  const base = integer(v.byteOffset ?? 0, total), offset = integer(a.byteOffset ?? 0, v.byteLength);
  if (v.buffer !== 0 || a.componentType !== componentType || a.type !== type || base % 4 || offset % 4 || integer(v.byteLength, total) + base > total || count * width + offset > v.byteLength) throw Error('Invalid ground-grid accessor');
  return {offset: base + offset, count};
}

/** Restore the original GLB, including its vertex numbering, materials and triangle order. No approximation. */
export function decodeGroundGrid(bytes: Buffer, expectedLength: number): Buffer {
  if (bytes.length < 20 || bytes.length > 128_000_000 || bytes.toString('ascii', 0, 4) !== 'LMG1') throw Error('Invalid ground-grid header');
  const total = integer(bytes.readUInt32LE(4), 128_000_000);
  const prefixLength = integer(bytes.readUInt32LE(8), 1_000_028);
  const partialLength = integer(bytes.readUInt32LE(12), 128_000_000), gridLength = integer(bytes.readUInt32LE(16), 3_000_000);
  if (total !== expectedLength || prefixLength + partialLength + gridLength + 20 !== bytes.length) throw Error('Invalid ground-grid length');
  const prefix = bytes.subarray(20, 20 + prefixLength), partial = bytes.subarray(20 + prefixLength, 20 + prefixLength + partialLength);
  const grid = bytes.subarray(20 + prefixLength + partialLength);
  const original = header(prefix, total);
  if (original.start !== prefixLength) throw Error('Invalid ground-grid prefix');
  validateSceneGlb(partial);
  const compact = header(partial, partialLength);
  if (grid.length < 12 || grid.toString('ascii', 0, 4) !== 'LGF1') throw Error('Invalid ground-grid payload');
  const nx = integer(grid.readUInt32LE(4), 768), nz = integer(grid.readUInt32LE(8), 768), cells = nx * nz;
  if (nx < 2 || nz < 2 || 12 + (nx + nz + cells) * 4 !== gridLength) throw Error('Invalid ground-grid dimensions');
  const ground = original.doc.meshes.findIndex(mesh => mesh.name === 'ground');
  if (ground < 0 || original.doc.meshes.length !== compact.doc.meshes.length + 1) throw Error('Invalid ground-grid meshes');
  const source = accessor(compact.doc, 0, partial.length - compact.start, 5126, 'VEC3');
  const target = accessor(original.doc, 0, total - original.start, 5126, 'VEC3');
  if (source.count > 6_000_000 || target.count > 6_000_000) throw Error('Ground-grid vertex budget exceeded');
  const points = partial.subarray(compact.start + source.offset, compact.start + source.offset + source.count * 12);
  const gridPoints = Buffer.alloc(cells * 12);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const k = z * nx + x;
    grid.copy(gridPoints, k * 12, 12 + x * 4, 16 + x * 4);
    grid.copy(gridPoints, k * 12 + 4, 12 + (nx + nz + k) * 4, 16 + (nx + nz + k) * 4);
    grid.copy(gridPoints, k * 12 + 8, 12 + (nx + z) * 4, 16 + (nx + z) * 4);
  }
  // NumPy's V12 order is lexicographic on the raw bytes, including signed zero bits.
  const compare = (a: Buffer, ai: number, b: Buffer, bi: number): number => {
    for (let j = 0; j < 12; j += 4) {
      const difference = a.readUInt32BE(ai * 12 + j) - b.readUInt32BE(bi * 12 + j);
      if (difference) return difference;
    }
    return 0;
  };
  const order = Uint32Array.from({length: cells}, (_, i) => i);
  order.sort((a, b) => compare(gridPoints, a, gridPoints, b));
  const output = Buffer.alloc(total); prefix.copy(output);
  const pointMap = new Uint32Array(source.count), gridMap = new Uint32Array(cells);
  let p = 0, g = 0, count = 0;
  while (p < source.count || g < cells) {
    if (count >= target.count) throw Error('Ground-grid vertex count mismatch');
    const comparison = p === source.count ? 1 : g === cells ? -1 : compare(points, p, gridPoints, order[g]);
    const from = comparison <= 0 ? points : gridPoints, index = comparison <= 0 ? p : order[g];
    from.copy(output, original.start + target.offset + count * 12, index * 12, index * 12 + 12);
    if (comparison <= 0) pointMap[p++] = count;
    if (comparison >= 0) gridMap[order[g++]] = count;
    count++;
  }
  if (count !== target.count) throw Error('Ground-grid vertex count mismatch');
  let other = 0;
  for (let m = 0; m < original.doc.meshes.length; m++) {
    const primitive = original.doc.meshes[m].primitives[0];
    if (primitive.attributes.POSITION !== 0) throw Error('Unsupported ground-grid vertex table');
    const destination = accessor(original.doc, primitive.indices, total - original.start, 5125, 'SCALAR');
    const offset = original.start + destination.offset;
    if (m === ground) {
      if (destination.count !== (nx - 1) * (nz - 1) * 6) throw Error('Ground-grid triangle count mismatch');
      let i = 0;
      for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
        const k = z * nx + x;
        for (const cell of [k, k + nx, k + 1, k + 1, k + nx, k + nx + 1]) output.writeUInt32LE(gridMap[cell], offset + i++ * 4);
      }
    } else {
      const mesh = compact.doc.meshes[other++].primitives[0];
      if (mesh.attributes.POSITION !== 0) throw Error('Unsupported ground-grid vertex table');
      const indices = accessor(compact.doc, mesh.indices, partial.length - compact.start, 5125, 'SCALAR');
      if (indices.count !== destination.count) throw Error('Ground-grid triangle count mismatch');
      for (let i = 0; i < indices.count; i++) output.writeUInt32LE(pointMap[partial.readUInt32LE(compact.start + indices.offset + i * 4)], offset + i * 4);
    }
  }
  return output;
}
