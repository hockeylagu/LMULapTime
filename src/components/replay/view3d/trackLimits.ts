import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import type { SurfaceHeight } from './surfaceProjection.js';

/** Painted track limits: about a real white line wide, still a few pixels at chase distance. */
export const TRACK_LIMIT_WIDTH_M = 0.25;
const LIFT_M = 0.03, STEP_M = 2, CELL_M = 25, GAP_M = 20;

/** Lap height near a point, so each line drapes on the lap's own road layer and never on a bridge above or below. */
function lapHeight(points: ReplayTrajectoryPoint[]): (x: number, z: number) => number | null {
  const cells = new Map<string, ReplayTrajectoryPoint[]>();
  for (const point of points) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
    const key = `${Math.floor(point.x / CELL_M)},${Math.floor(point.z / CELL_M)}`;
    cells.set(key, [...(cells.get(key) ?? []), point]);
  }
  return (x, z) => {
    const cx = Math.floor(x / CELL_M), cz = Math.floor(z / CELL_M);
    let best: ReplayTrajectoryPoint | null = null, bestDistance = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of cells.get(`${cx + i},${cz + j}`) ?? []) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDistance) { bestDistance = d; best = p; }
    }
    return best?.y ?? null;
  };
}

/**
 * The layout's left/right boundaries (native x/z, the painted white lines) as thin unlit ribbons draped
 * on the scanned road. Vector geometry keeps the limit sharp at any zoom; stretches with no road
 * below, or far from the lap, are left out rather than floated.
 */
export function makeTrackLimits(boundaries: Array<Array<[number, number]>>, lap: ReplayTrajectoryPoint[], origin: Vector3, surfaceHeight: SurfaceHeight): Mesh<BufferGeometry, MeshBasicMaterial> {
  const near = lapHeight(lap), half = TRACK_LIMIT_WIDTH_M / 2, positions: number[] = [], indices: number[] = [];
  for (const boundary of boundaries) {
    const closed = boundary.length > 2 && Math.hypot(boundary[0][0] - boundary[boundary.length - 1][0], boundary[0][1] - boundary[boundary.length - 1][1]) < GAP_M;
    const samples: Array<[number, number]> = [];
    const path = closed ? [...boundary, boundary[0]] : boundary;
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_M));
      for (let s = 0; s < steps; s++) samples.push([ax + (bx - ax) * s / steps, az + (bz - az) * s / steps]);
    }
    if (!closed && path.length) samples.push(path[path.length - 1]);
    let previous = -1;
    samples.forEach(([x, z], i) => {
      const hint = near(x, z), y = hint === null ? null : surfaceHeight({x, y: hint + 1, z}, 3);
      if (y === null) { previous = -1; return; }
      const [px, pz] = samples[Math.max(0, i - 1)], [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
      const length = Math.hypot(nx - px, nz - pz) || 1, dx = (nx - px) / length, dz = (nz - pz) / length;
      const base = positions.length / 3, sx = x - origin.x, sy = y - origin.y + LIFT_M, sz = z - origin.z;
      positions.push(sx - dz * half, sy, sz + dx * half, sx + dz * half, sy, sz - dx * half);
      if (previous >= 0 && Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]) <= GAP_M) indices.push(previous, previous + 1, base, previous + 1, base + 1, base);
      previous = base;
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  // Below the racing line's offset, above the road and kerbs it lies on.
  const lines = new Mesh(geometry, new MeshBasicMaterial({color: '#f4f4ef', side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
  lines.name = 'track-limits';
  return lines;
}
