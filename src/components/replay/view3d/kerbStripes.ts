import { BufferAttribute, BufferGeometry, Float32BufferAttribute, InterleavedBufferAttribute, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';

/** Alternating red/white bands along the lap, about as long as painted kerb blocks. */
export const KERB_STRIPE_M = 1.5;
const CELL_M = 20, REACH_M = 40;

/** Lap distance of the nearest recorded sample, through a coarse grid so a kerb mesh never scans the whole lap per vertex. */
function nearestStation(points: ReplayTrajectoryPoint[], distances: number[]): (x: number, z: number) => number | null {
  const cells = new Map<string, number[]>();
  points.forEach((point, i) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const key = `${Math.floor(point.x / CELL_M)},${Math.floor(point.z / CELL_M)}`;
    cells.set(key, [...(cells.get(key) ?? []), i]);
  });
  const ring = Math.ceil(REACH_M / CELL_M);
  return (x, z) => {
    const cx = Math.floor(x / CELL_M), cz = Math.floor(z / CELL_M);
    let best = -1, bestDistance = REACH_M ** 2;
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (const k of cells.get(`${cx + i},${cz + j}`) ?? []) {
      const d = (points[k].x - x) ** 2 + (points[k].z - z) ** 2;
      if (d < bestDistance) { bestDistance = d; best = k; }
    }
    if (best < 0) return null;
    // Samples are metres apart: project onto both neighbouring segments and keep the closer foot, so
    // bands stay continuous. Picking a segment by endpoint distance clamped kerbs metres off the line
    // to a sample, leaving long flat bands and slivers.
    let station = distances[best], footDistance = Infinity;
    for (const base of [best - 1, best]) {
      const from = points[base], to = points[base + 1];
      if (!from || !to) continue;
      const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
      const t = length > 0 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length)) : 0;
      const d = (from.x + dx * t - x) ** 2 + (from.z + dz * t - z) ** 2;
      if (d < footDistance) { footDistance = d; station = distances[base] + (distances[base + 1] - distances[base]) * t; }
    }
    return station;
  };
}

/**
 * Paints the scanned kerb surfaces in red/white bands by lap distance. Bands follow the recorded line,
 * so they run across the kerb like the painted blocks; kerbs out of the lap's reach keep their flat colour.
 * `root` must still be in native coordinates.
 */
export function applyKerbStripes(root: Object3D, points: ReplayTrajectoryPoint[], distances: number[]): void {
  const kerb = root.getObjectByName('kerb');
  if (!(kerb instanceof Mesh) || !(kerb.geometry instanceof BufferGeometry) || !(kerb.material instanceof MeshStandardMaterial)) return;
  const position: unknown = kerb.geometry.getAttribute('position');
  if (!(position instanceof BufferAttribute) && !(position instanceof InterleavedBufferAttribute)) return;
  const station = nearestStation(points, distances), stations = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) stations[i] = station(position.getX(i), position.getZ(i)) ?? -1;
  kerb.geometry.setAttribute('kerbStation', new Float32BufferAttribute(stations, 1));
  const material = kerb.material;
  material.color.set('#ffffff');
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float kerbStation;\nvarying float vKerbStation;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKerbStation = kerbStation;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vKerbStation;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= vKerbStation < 0.0 ? vec3(0.70, 0.67, 0.62) : mod(floor(vKerbStation / ${KERB_STRIPE_M.toFixed(2)}), 2.0) < 1.0 ? vec3(0.74, 0.12, 0.10) : vec3(0.88, 0.88, 0.86);`);
  };
  material.needsUpdate = true;
}
