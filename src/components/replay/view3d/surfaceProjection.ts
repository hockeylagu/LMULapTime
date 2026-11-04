import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Mesh, Vector3, type Matrix4, type Object3D } from 'three';

interface NativePosition { x: number; y: number; z: number }
/** Highest surface from 0.15 m above `point.y` down to `reach` metres below it. */
export type SurfaceHeight = (point: NativePosition, reach?: number) => number | null;
const CELL_M = 16;
/** Triangles too large for the fine grid (terrain) are bucketed in a coarse grid instead of one list every query scans. */
const BROAD_CELL_M = CELL_M * 16;
/** Numeric cell key (cells stay well inside +-2^20 for any circuit). */
const cellKey = (x: number, z: number) => (x + 1048576) * 2097152 + (z + 1048576);

/**
 * Native-coordinate ground lookup over the meshes of `surface` that `include` accepts (all by default), built before the
 * display-frame reflection so mesh matrices are still native.
 */
export function createSurfaceHeight(surface: Object3D, include: (meshName: string) => boolean = () => true): SurfaceHeight {
  const builder = buildSurfaceHeight(surface, include);
  builder.step(Infinity);
  return builder.lookup;
}

export interface SurfaceHeightBuilder {
  /** Indexes triangles until `deadline` (a performance.now() time); true once every triangle is indexed. */
  step(deadline: number): boolean;
  /** Null for every point until the build is done. */
  lookup: SurfaceHeight;
}

/**
 * The same index built incrementally, so a large chunk (the horizon holds the whole venue's terrain) is spread over frames
 * instead of stalling one. Mesh matrices are captured now, in native coordinates; the geometry must stay alive until done.
 */
export function buildSurfaceHeight(surface: Object3D, include: (meshName: string) => boolean = () => true): SurfaceHeightBuilder {
  const cells = new Map<number, number[]>(), broadCells = new Map<number, number[]>(), broad: number[] = [];
  const bucket = (map: Map<number, number[]>, key: number, offset: number) => { const list = map.get(key); if (list) list.push(offset); else map.set(key, [offset]); };
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const meshes: {positions: BufferAttribute | InterleavedBufferAttribute; indices: BufferAttribute | null; count: number; matrix: Matrix4}[] = [];
  surface.updateWorldMatrix(true, true);
  surface.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry) || !include(object.name)) return;
    const positions: unknown = object.geometry.getAttribute('position');
    const indices = object.geometry.index;
    if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return;
    meshes.push({positions, indices, count: indices?.count ?? positions.count, matrix: object.matrixWorld.clone()});
  });
  const coefficients = new Float64Array(meshes.reduce((count, item) => count + Math.floor(item.count / 3) * 10, 0));
  let coefficientCount = 0, mesh = 0, triangle = 0, data: Float64Array | null = null;
  const addTriangle = ({positions, indices, matrix}: typeof meshes[number], i: number) => {
    a.fromBufferAttribute(positions, indices?.getX(i) ?? i).applyMatrix4(matrix);
    b.fromBufferAttribute(positions, indices?.getX(i + 1) ?? i + 1).applyMatrix4(matrix);
    c.fromBufferAttribute(positions, indices?.getX(i + 2) ?? i + 2).applyMatrix4(matrix);
    const dx1 = b.x - a.x, dz1 = b.z - a.z, dx2 = c.x - a.x, dz2 = c.z - a.z;
    const determinant = dx1 * dz2 - dx2 * dz1;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return;
    const offset = coefficientCount;
    coefficients[offset] = a.x;
    coefficients[offset + 1] = a.y;
    coefficients[offset + 2] = a.z;
    coefficients[offset + 3] = dx1;
    coefficients[offset + 4] = dz1;
    coefficients[offset + 5] = b.y - a.y;
    coefficients[offset + 6] = dx2;
    coefficients[offset + 7] = dz2;
    coefficients[offset + 8] = c.y - a.y;
    coefficients[offset + 9] = 1 / determinant;
    coefficientCount += 10;
    const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL_M), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL_M);
    const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL_M), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL_M);
    // Very large terrain triangles stay in one shared list instead of duplicating thousands of cells.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) {
      const bx0 = Math.floor(Math.min(a.x, b.x, c.x) / BROAD_CELL_M), bx1 = Math.floor(Math.max(a.x, b.x, c.x) / BROAD_CELL_M);
      const bz0 = Math.floor(Math.min(a.z, b.z, c.z) / BROAD_CELL_M), bz1 = Math.floor(Math.max(a.z, b.z, c.z) / BROAD_CELL_M);
      if ((bx1 - bx0 + 1) * (bz1 - bz0 + 1) > 256) { broad.push(offset); return; }
      for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) bucket(broadCells, cellKey(x, z), offset);
      return;
    }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) bucket(cells, cellKey(x, z), offset);
  };
  const step = (deadline: number) => {
    if (data) return true;
    for (let checked = 0; mesh < meshes.length; checked++) {
      if (checked % 512 === 511 && performance.now() >= deadline) return false;
      const current = meshes[mesh];
      if (triangle + 2 >= current.count) { mesh++; triangle = 0; continue; }
      addTriangle(current, triangle);
      triangle += 3;
    }
    data = coefficients.subarray(0, coefficientCount);
    meshes.length = 0;
    return true;
  };
  const lookup: SurfaceHeight = (point, reach = 1.5) => {
    if (!data || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return null;
    const values = data;
    let best: number | null = null;
    const fine = cells.get(cellKey(Math.floor(point.x / CELL_M), Math.floor(point.z / CELL_M)));
    const coarse = broadCells.get(cellKey(Math.floor(point.x / BROAD_CELL_M), Math.floor(point.z / BROAD_CELL_M)));
    for (let bucket = 0; bucket < 3; bucket++) {
      const offsets = bucket === 0 ? fine : bucket === 1 ? coarse : broad;
      if (!offsets) continue;
      for (let index = 0; index < offsets.length; index++) {
        const offset = offsets[index];
        const dx = point.x - values[offset], dz = point.z - values[offset + 2];
        const u = (dx * values[offset + 7] - dz * values[offset + 6]) * values[offset + 9];
        const v = (values[offset + 3] * dz - values[offset + 4] * dx) * values[offset + 9];
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const height = values[offset + 1] + u * values[offset + 5] + v * values[offset + 8];
        if (!Number.isFinite(height) || height > point.y + 0.15 || height < point.y - reach) continue;
        if (best === null || height > best) best = height;
      }
    }
    return best;
  };
  return {step, lookup};
}
