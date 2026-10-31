import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Mesh, Vector3, type Object3D } from 'three';

interface NativePosition { x: number; y: number; z: number }
/** Highest surface from 0.15 m above `point.y` down to `reach` metres below it. */
export type SurfaceHeight = (point: NativePosition, reach?: number) => number | null;
const CELL_M = 32;

/** Native-coordinate ground lookup, built once per scene, before the display-frame reflection. */
export function createSurfaceHeight(surface: Object3D): SurfaceHeight {
  let coefficients: number[] = [];
  const cells = new Map<string, number[]>(), broad: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  surface.updateWorldMatrix(true, true);
  surface.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const positions: unknown = object.geometry.getAttribute('position');
    const indices = object.geometry.index;
    if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return;
    const count = indices?.count ?? positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(positions, indices?.getX(i) ?? i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(positions, indices?.getX(i + 1) ?? i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(positions, indices?.getX(i + 2) ?? i + 2).applyMatrix4(object.matrixWorld);
      const dx1 = b.x - a.x, dz1 = b.z - a.z, dx2 = c.x - a.x, dz2 = c.z - a.z;
      const determinant = dx1 * dz2 - dx2 * dz1;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) continue;
      const offset = coefficients.length;
      coefficients.push(a.x, a.y, a.z, dx1, dz1, b.y - a.y, dx2, dz2, c.y - a.y, 1 / determinant);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL_M), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL_M);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL_M), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL_M);
      // Very large terrain triangles stay in one shared list instead of duplicating thousands of cells.
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) { broad.push(offset); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`, bucket = cells.get(key);
        if (bucket) bucket.push(offset); else cells.set(key, [offset]);
      }
    }
  });
  const data = new Float64Array(coefficients);
  coefficients = [];
  return (point, reach = 1.5) => {
    if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
    let best: number | null = null;
    const evaluate = (offset: number) => {
      const dx = point.x - data[offset], dz = point.z - data[offset + 2];
      const u = (dx * data[offset + 7] - dz * data[offset + 6]) * data[offset + 9];
      const v = (data[offset + 3] * dz - data[offset + 4] * dx) * data[offset + 9];
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return;
      const height = data[offset + 1] + u * data[offset + 5] + v * data[offset + 8];
      // The replay body reference selects its nearby road layer, never a bridge above or road below.
      if (!Number.isFinite(height) || height > point.y + 0.15 || height < point.y - reach) return;
      if (best === null || height > best) best = height;
    };
    cells.get(`${Math.floor(point.x / CELL_M)},${Math.floor(point.z / CELL_M)}`)?.forEach(evaluate);
    broad.forEach(evaluate);
    return best;
  };
}

/** Road heights exclude the filler ground; filler ground provides terrain height for camera clearance. */
export function prepareSurfaceLayers(root: Object3D): {
  fillerGround: Object3D | undefined;
  surfaceHeight: SurfaceHeight;
  groundHeight: SurfaceHeight;
} {
  const fillerGround = root.getObjectByName('ground');
  if (fillerGround) root.remove(fillerGround);
  const surfaceHeight = createSurfaceHeight(root);
  const groundHeight = fillerGround ? createSurfaceHeight(fillerGround) : surfaceHeight;
  if (fillerGround) root.add(fillerGround);
  return { fillerGround, surfaceHeight, groundHeight };
}

