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

export function validateSceneGlb(bytes: Buffer, wheelPivots = false): { triangles: number; min: number[]; max: number[] } {
  if (bytes.length < 28 || bytes.length > 64_000_000 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  const jsonLength = bytes.readUInt32LE(12), binHeader = 20 + jsonLength;
  if (jsonLength > 1_000_000 || jsonLength % 4 || binHeader + 8 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(binHeader + 4) !== 0x004e4942) throw Error('Invalid GLB chunks');
  const bin = bytes.subarray(binHeader + 8);
  if (bytes.readUInt32LE(binHeader) !== bin.length || bin.length % 4) throw Error('Invalid GLB binary');
  const json = record(JSON.parse(bytes.toString('utf8', 20, binHeader)) as unknown);
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
    const count = integer(accessor.count, 3_000_000), offset = integer(accessor.byteOffset ?? 0, view.length);
    const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'SCALAR' ? 1 : 0;
    if (!components || ![5126, 5125].includes(accessor.componentType as number) || offset % 4 || offset + count * components * 4 > view.length || accessor.normalized) throw Error('Invalid GLB accessor');
    return { count, components, componentType: accessor.componentType, offset: view.offset + offset };
  });
  const materials = list(json.materials, 32);
  const meshes = list(json.meshes, 32);
  let triangles = 0, visitedVertices = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  // Primitives may share one position accessor: budget and scan its vertices once.
  const scannedPositions = new Set<number>();
  for (const mesh of meshes) for (const item of list(record(mesh).primitives, 32)) {
    const primitive = record(item), attributes = record(primitive.attributes);
    if (Object.keys(attributes).some(key => key !== 'POSITION') || (primitive.mode !== undefined && primitive.mode !== 4) || primitive.targets) throw Error('Unsupported GLB primitive');
    integer(primitive.material, materials.length - 1);
    const positionIndex = integer(attributes.POSITION, accessors.length - 1), position = accessors[positionIndex];
    const indices = accessors[integer(primitive.indices, accessors.length - 1)];
    if (position.components !== 3 || position.componentType !== 5126 || indices.components !== 1 || indices.componentType !== 5125 || indices.count % 3) throw Error('Invalid GLB triangles');
    triangles += indices.count / 3;
    const firstUse = !scannedPositions.has(positionIndex); scannedPositions.add(positionIndex);
    if (firstUse) visitedVertices += position.count;
    if (triangles > 2_000_000 || visitedVertices > 3_000_000) throw Error('GLB geometry budget exceeded');
    if (firstUse) for (let i = 0; i < position.count * 3; i++) {
      const value = bin.readFloatLE(position.offset + i * 4), axis = i % 3;
      if (!Number.isFinite(value) || Math.abs(value) > 30_000) throw Error('Invalid GLB coordinate');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    for (let i = 0; i < indices.count; i++) if (bin.readUInt32LE(indices.offset + i * 4) >= position.count) throw Error('Invalid GLB index');
  }
  const nodes = list(json.nodes, 32);
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
