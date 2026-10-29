import { BufferAttribute, BufferGeometry, Float32BufferAttribute, InterleavedBufferAttribute, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';

const MARGIN_M = 1500, FADE_M = 700, MAX_GRID = 768, MIN_CELL_M = 6;
/** Clearance below the lowest vertex of every scanned triangle above a terrain cell. */
const BELOW_SURFACE_M = 0.2;
const SMOOTHING_PASSES = 12;

export interface DefaultTerrain {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** Filler height at an origin-relative native X/Z, in the same frame. */
  heightAt(x: number, z: number): number;
}

/**
 * Generic ground that follows the scanned surfaces' elevation so raised sections never hover over
 * void. Each grid corner under a scanned triangle sits below that triangle's lowest vertex, so no
 * cell can rise through a surface; away from the track it fades smoothly to `edgeY`, the flat
 * horizon level. It is filler, not measured terrain. `surfaces` (the scanned sheets: structure stands on
 * them, and a buried wall would drag the ground down) must still be in native coordinates;
 * the mesh is built origin-relative, for the same reflected group as the scene.
 */
export function createDefaultTerrain(
  surfaces: Object3D[], bounds: {min: number[]; max: number[]}, origin: Vector3, edgeY: number, color: string,
): DefaultTerrain {
  const x0 = bounds.min[0] - MARGIN_M, z0 = bounds.min[2] - MARGIN_M;
  const nx = Math.min(MAX_GRID, Math.ceil((bounds.max[0] + MARGIN_M - x0) / MIN_CELL_M) + 1);
  const nz = Math.min(MAX_GRID, Math.ceil((bounds.max[2] + MARGIN_M - z0) / MIN_CELL_M) + 1);
  const dx = (bounds.max[0] + MARGIN_M - x0) / (nx - 1), dz = (bounds.max[2] + MARGIN_M - z0) / (nz - 1);
  const heights = new Float64Array(nx * nz).fill(Infinity), known = new Uint8Array(nx * nz);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (const surface of surfaces) surface.updateWorldMatrix(true, true);
  for (const surface of surfaces) surface.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const positions: unknown = object.geometry.getAttribute('position'), index = object.geometry.index;
    if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return;
    const count = index?.count ?? positions.count;
    for (let t = 0; t + 2 < count; t += 3) {
      a.fromBufferAttribute(positions, index?.getX(t) ?? t).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(positions, index?.getX(t + 1) ?? t + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(positions, index?.getX(t + 2) ?? t + 2).applyMatrix4(object.matrixWorld);
      const lowest = Math.min(a.y, b.y, c.y);
      if (!Number.isFinite(lowest)) continue;
      // The triangle's plane, so a long strip on a slope holds each cell at its own height, not its lowest corner.
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z, ny = uz * vx - ux * vz;
      const gx = Math.abs(ny) > 1e-6 ? (uy * vz - uz * vy) / -ny : 0, gz = Math.abs(ny) > 1e-6 ? (ux * vy - uy * vx) / -ny : 0;
      // Every corner of every grid cell the triangle touches sits under the plane across that cell (never under its lowest vertex).
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / dx)), i1 = Math.min(nx - 2, Math.floor((Math.max(a.x, b.x, c.x) - x0) / dx));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / dz)), j1 = Math.min(nz - 2, Math.floor((Math.max(a.z, b.z, c.z) - z0) / dz));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = x0 + i * dx - a.x, cz = z0 + j * dz - a.z;
        const plane = Math.abs(ny) > 1e-6 ? a.y + Math.min(0, gx * dx) + Math.min(0, gz * dz) + gx * cx + gz * cz : lowest;
        const floor = Math.max(lowest, plane) - BELOW_SURFACE_M;
        for (const k of [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1]) {
          if (floor < heights[k]) heights[k] = floor;
          known[k] = 1;
        }
      }
    }
  });
  // Multi-source breadth-first fill: each open cell takes its nearest surface height, fading to the edge level.
  const source = new Float64Array(nx * nz), steps = new Int32Array(nx * nz).fill(-1), queue = new Int32Array(nx * nz);
  let head = 0, tail = 0;
  for (let k = 0; k < known.length; k++) if (known[k]) { source[k] = heights[k]; steps[k] = 0; queue[tail++] = k; }
  while (head < tail) {
    const k = queue[head++], i = k % nx, j = (k - i) / nx;
    for (const [ni, nj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || steps[nj * nx + ni] >= 0) continue;
      const n = nj * nx + ni; steps[n] = steps[k] + 1; source[n] = source[k]; queue[tail++] = n;
    }
  }
  const cell = Math.min(dx, dz);
  for (let k = 0; k < heights.length; k++) {
    if (known[k]) continue;
    const t = steps[k] < 0 ? 1 : Math.min(1, steps[k] * cell / FADE_M), fade = t * t * (3 - 2 * t);
    heights[k] = steps[k] < 0 ? edgeY : source[k] + (edgeY - source[k]) * fade;
  }
  // Soften the nearest-surface seams; sampled cells and the outer ring stay fixed.
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (!known[k]) heights[k] = (heights[k - 1] + heights[k + 1] + heights[k - nx] + heights[k + nx]) / 4;
    }
  }
  const positions = new Float32Array(nx * nz * 3), indices: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    positions[k * 3] = x0 + i * dx - origin.x; positions[k * 3 + 1] = heights[k] - origin.y; positions[k * 3 + 2] = z0 + j * dz - origin.z;
    // Wound for +Y normals in native axes; the reflected parent's winding flip is handled by the renderer.
    if (i < nx - 1 && j < nz - 1) indices.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({color, roughness: 1}));
  // No shadow: the relief sits just under the road, and a car shadow on it shows through from below road level.
  mesh.name = 'default-terrain-relief';
  return {
    mesh,
    heightAt(x, z) {
      const fi = (x + origin.x - x0) / dx, fj = (z + origin.z - z0) / dz;
      if (!(fi >= 0 && fj >= 0 && fi <= nx - 1 && fj <= nz - 1)) return edgeY - origin.y;
      const i = Math.min(nx - 2, Math.floor(fi)), j = Math.min(nz - 2, Math.floor(fj)), u = fi - i, v = fj - j, k = j * nx + i;
      const h = (heights[k] * (1 - u) + heights[k + 1] * u) * (1 - v) + (heights[k + nx] * (1 - u) + heights[k + nx + 1] * u) * v;
      return h - origin.y;
    },
  };
}
