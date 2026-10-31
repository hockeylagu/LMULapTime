import {MeshoptDecoder} from 'meshoptimizer/decoder';
await MeshoptDecoder.ready;

/** Deliberately small glTF subset: static indexed surfaces, embedded binary, no URLs/extensions. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid GLB object');
  return value as Record<string, unknown>;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw Error('Invalid GLB array');
  return value as unknown[];
}
function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw Error('Invalid GLB count');
  return value;
}
function noExternalResources(value: unknown, depth = 0): void {
  if (depth > 16) throw Error('GLB nesting too deep');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['uri', 'extensions', 'extensionsRequired', 'extensionsUsed', 'sparse', 'animations', 'skins', 'textures', 'images'].includes(key)) throw Error('Unsupported GLB resource');
    noExternalResources(child, depth + 1);
  }
}

/** Only the ratified Meshopt extension is allowed; all decoded data keeps the existing budgets. */
function meshoptBuffer(json: Record<string, unknown>, binary: Buffer): Buffer {
  if (json.extensionsUsed === undefined && json.extensionsRequired === undefined) return binary;
  const name = 'EXT_meshopt_compression';
  for (const field of ['extensionsUsed', 'extensionsRequired']) {
    const values = list(json[field], 1);
    if (values.length !== 1 || values[0] !== name) throw Error('Unsupported GLB extension');
  }
  const buffers = list(json.buffers, 2).map(record);
  if (buffers.length !== 2 || integer(buffers[0].byteLength, binary.length) < binary.length - 3) throw Error('Invalid Meshopt buffers');
  const fallback = record(buffers[1].extensions);
  const marker = record(fallback[name]);
  if (Object.keys(fallback).length !== 1 || Object.keys(marker).length !== 1 || marker.fallback !== true || buffers.some(buffer => Object.keys(buffer).some(key => !['byteLength', 'extensions'].includes(key))) || buffers[0].extensions !== undefined) throw Error('Invalid Meshopt fallback');
  const decoded = Buffer.alloc(integer(buffers[1].byteLength, 128_000_000));
  let total = 0;
  for (const item of list(json.bufferViews, 256)) {
    const view = record(item), extensions = record(view.extensions), encoding = record(extensions[name]);
    if (Object.keys(extensions).length !== 1 || Object.keys(encoding).some(key => !['buffer', 'byteOffset', 'byteLength', 'byteStride', 'count', 'mode', 'filter'].includes(key))) throw Error('Unsupported Meshopt view');
    const count = integer(encoding.count, 12_000_000), stride = integer(encoding.byteStride, 12);
    const offset = integer(view.byteOffset ?? 0, decoded.length), length = integer(view.byteLength, decoded.length);
    const sourceOffset = integer(encoding.byteOffset ?? 0, binary.length), sourceLength = integer(encoding.byteLength, binary.length);
    const mode = encoding.mode;
    if (view.buffer !== 1 || encoding.buffer !== 0 || offset % 4 || sourceOffset % 4 || offset + length > decoded.length || sourceOffset + sourceLength > binary.length || count * stride !== length
      || (encoding.filter !== undefined && encoding.filter !== 'NONE')
      || !((mode === 'ATTRIBUTES' && (stride === 12 || stride === 8 || stride === 4)) || ((mode === 'TRIANGLES' || mode === 'INDICES') && stride === 4))
      || (view.byteStride !== undefined && (mode !== 'ATTRIBUTES' || view.byteStride !== stride)) || (mode === 'TRIANGLES' && count % 3)) throw Error('Invalid Meshopt view');
    total += length;
    if (total > 128_000_000) throw Error('Meshopt decoded budget exceeded');
    MeshoptDecoder.decodeGltfBuffer(decoded.subarray(offset, offset + length), count, stride, binary.subarray(sourceOffset, sourceOffset + sourceLength), mode, 'NONE');
    delete view.extensions; delete view.byteStride; view.buffer = 0;
  }
  delete json.extensionsUsed; delete json.extensionsRequired;
  json.buffers = [{byteLength: decoded.length}];
  return decoded;
}

export function validateSceneGlb(bytes: Buffer, wheelPivots = false): { triangles: number; min: number[]; max: number[] } {
  if (bytes.length < 28 || bytes.length > 128_000_000 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  const jsonLength = bytes.readUInt32LE(12), binHeader = 20 + jsonLength;
  if (jsonLength > 1_000_000 || jsonLength % 4 || binHeader + 8 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(binHeader + 4) !== 0x004e4942) throw Error('Invalid GLB chunks');
  let bin = bytes.subarray(binHeader + 8);
  if (bytes.readUInt32LE(binHeader) !== bin.length || bin.length % 4) throw Error('Invalid GLB binary');
  const json = record(JSON.parse(bytes.toString('utf8', 20, binHeader)) as unknown);
  bin = meshoptBuffer(json, bin);
  noExternalResources(json);
  if (record(json.asset).version !== '2.0') throw Error('Unsupported glTF');
  const buffers = list(json.buffers, 1);
  if (buffers.length !== 1 || integer(record(buffers[0]).byteLength, bin.length) < bin.length - 3) throw Error('Invalid GLB buffer');
  const views = list(json.bufferViews, 256).map(value => {
    const view = record(value);
    if (view.buffer !== 0 || view.byteStride !== undefined) throw Error('Unsupported GLB view');
    const offset = integer(view.byteOffset ?? 0, bin.length), length = integer(view.byteLength, bin.length);
    if (offset % 4 || offset + length > bin.length) throw Error('Invalid GLB view range');
    return { offset, length };
  });
  const accessors = list(json.accessors, 256).map(value => {
    const accessor = record(value), view = views[integer(accessor.bufferView, views.length - 1)];
    const count = integer(accessor.count, 12_000_000), offset = integer(accessor.byteOffset ?? 0, view.length);
    const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'VEC2' ? 2 : accessor.type === 'SCALAR' ? 1 : 0;
    if (!components || ![5126, 5125].includes(accessor.componentType as number) || offset % 4 || offset + count * components * 4 > view.length || accessor.normalized) throw Error('Invalid GLB accessor');
    return { count, components, componentType: accessor.componentType, offset: view.offset + offset };
  });
  const materials = list(json.materials, 64);
  if (wheelPivots && materials.some(material => record(material).doubleSided === true)) throw Error('Invalid GLB material side');
  const meshes = list(json.meshes, 64);
  let triangles = 0, visitedVertices = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  // Primitives may share one position/normal accessor: budget and scan its vertices once.
  const scannedPositions = new Set<number>(), scannedNormals = new Set<number>();
  for (const mesh of meshes) for (const item of list(record(mesh).primitives, 32)) {
    const primitive = record(item), attributes = record(primitive.attributes);
    const allowedAttributes = wheelPivots ? ['POSITION', 'NORMAL', 'TEXCOORD_0'] : ['POSITION', 'TEXCOORD_0'];
    if (Object.keys(attributes).some(key => !allowedAttributes.includes(key)) || (primitive.mode !== undefined && primitive.mode !== 4) || primitive.targets) throw Error('Unsupported GLB primitive');
    integer(primitive.material, materials.length - 1);
    const positionIndex = integer(attributes.POSITION, accessors.length - 1), position = accessors[positionIndex];
    if (wheelPivots && attributes.NORMAL === undefined) throw Error('Missing GLB normals');
    if (attributes.NORMAL !== undefined) {
      const normalIndex = integer(attributes.NORMAL, accessors.length - 1), normal = accessors[normalIndex];
      if (normal.components !== 3 || normal.componentType !== 5126 || normal.count !== position.count) throw Error('Invalid GLB normals');
      if (!scannedNormals.has(normalIndex)) {
        scannedNormals.add(normalIndex);
        for (let i = 0; i < normal.count; i++) {
          const offset = normal.offset + i * 12;
          const nx = bin.readFloatLE(offset), ny = bin.readFloatLE(offset + 4), nz = bin.readFloatLE(offset + 8);
          if (!Number.isFinite(nx + ny + nz) || Math.abs(Math.hypot(nx, ny, nz) - 1) > 0.02) throw Error('Invalid GLB normals');
        }
      }
    }
    if (attributes.TEXCOORD_0 !== undefined) {
      const texcoord = accessors[integer(attributes.TEXCOORD_0, accessors.length - 1)];
      if (texcoord.components !== 2 || texcoord.componentType !== 5126 || texcoord.count !== position.count) throw Error('Invalid GLB texture coordinates');
    }
    const indices = accessors[integer(primitive.indices, accessors.length - 1)];
    if (position.components !== 3 || position.componentType !== 5126 || indices.components !== 1 || indices.componentType !== 5125 || indices.count % 3) throw Error('Invalid GLB triangles');
    triangles += indices.count / 3;
    const firstUse = !scannedPositions.has(positionIndex); scannedPositions.add(positionIndex);
    if (firstUse) visitedVertices += position.count;
    if (triangles > 4_000_000 || visitedVertices > 6_000_000) throw Error('GLB geometry budget exceeded');
    if (firstUse) for (let i = 0; i < position.count * 3; i++) {
      const value = bin.readFloatLE(position.offset + i * 4), axis = i % 3;
      if (!Number.isFinite(value) || Math.abs(value) > 30_000) throw Error('Invalid GLB coordinate');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    for (let i = 0; i < indices.count; i++) if (bin.readUInt32LE(indices.offset + i * 4) >= position.count) throw Error('Invalid GLB index');
  }
  const nodes = list(json.nodes, 64);
  for (const value of nodes) {
    const node = record(value);
    if (Object.keys(node).some(key => !['mesh', 'name', ...(wheelPivots ? ['extras'] : [])].includes(key))) throw Error('Unsupported GLB transform');
    if (node.extras !== undefined) {
      const extras = record(node.extras), pivot = extras.wheelPivot;
      const corner = typeof node.name === 'string' ? /^(?:tyres|rims)-(FL|FR|RL|RR)$/.exec(node.name)?.[1] : undefined;
      if (!corner || Object.keys(extras).length !== 1 || !Array.isArray(pivot) || pivot.length !== 3
        || !pivot.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 4)
        || ((pivot[0] as number) > 0) !== corner.endsWith('L') || ((pivot[2] as number) < 0) !== corner.startsWith('F')) throw Error('Invalid GLB wheel pivot');
    }
    integer(node.mesh, meshes.length - 1);
  }
  if (nodes.length !== meshes.length || new Set(nodes.map(value => record(value).mesh)).size !== meshes.length) throw Error('Repeated GLB mesh instance');
  const scenes = list(json.scenes, 1);
  if (json.scene !== 0 || scenes.length !== 1 || !triangles) throw Error('Invalid GLB scene');
  const roots = list(record(scenes[0]).nodes, nodes.length);
  if (roots.length !== nodes.length || new Set(roots).size !== nodes.length) throw Error('Invalid GLB scene roots');
  roots.forEach(index => integer(index, nodes.length - 1));
  return { triangles, min, max };
}
