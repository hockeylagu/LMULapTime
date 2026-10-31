/** Invented geometry written independently of the private game exporter. */
export function syntheticGlb(
  change?: (json: Record<string, unknown>) => void,
  positions = [0, 4, 0, 5, 7, 0, 0, 6, 5],
  normals?: number[],
  doubleSided = false,
): Buffer {
  const binary = Buffer.alloc(normals ? 84 : 48);
  positions.forEach((n, i) => binary.writeFloatLE(n, i * 4));
  normals?.forEach((n, i) => binary.writeFloatLE(n, 36 + i * 4));
  const indexOffset = normals ? 72 : 36;
  [0, 1, 2].forEach((n, i) => binary.writeUInt32LE(n, indexOffset + i * 4));
  const json: Record<string, unknown> = {
    asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}], materials: [{doubleSided}],
    meshes: [{primitives: [{attributes: {POSITION: 0, ...(normals ? {NORMAL: 2} : {})}, indices: 1, material: 0}]}],
    buffers: [{byteLength: binary.length}],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: 36},
      {buffer: 0, byteOffset: indexOffset, byteLength: 12},
      ...(normals ? [{buffer: 0, byteOffset: 36, byteLength: 36}] : []),
    ],
    accessors: [
      {bufferView: 0, count: 3, type: 'VEC3', componentType: 5126},
      {bufferView: 1, count: 3, type: 'SCALAR', componentType: 5125},
      ...(normals ? [{bufferView: 2, count: 3, type: 'VEC3', componentType: 5126}] : []),
    ],
  };
  change?.(json);
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, binary]);
}
