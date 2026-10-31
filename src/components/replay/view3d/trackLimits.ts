import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import type { SurfaceHeight } from './surfaceProjection.js';

/** Painted track limits: about a real white line wide, still a few pixels at chase distance. */
export const TRACK_LIMIT_WIDTH_M = 0.25;
const LIFT_M = 0.03, STEP_M = 2, CELL_M = 25, REACH_M = 120, GAP_M = 20;

/** Lap height near a point, so each line drapes on the lap's own road layer and never on a bridge above or below. */
function lapHeight(points: ReplayTrajectoryPoint[]): (x: number, z: number) => number | null {
  const cells = new Map<string, ReplayTrajectoryPoint[]>();
  for (const point of points) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
    const key = `${Math.floor(point.x / CELL_M)},${Math.floor(point.z / CELL_M)}`;
    cells.set(key, [...(cells.get(key) ?? []), point]);
  }
  const ring = Math.ceil(REACH_M / CELL_M);
  return (x: number, z: number): number | null => {
    const cx = Math.floor(x / CELL_M), cz = Math.floor(z / CELL_M);
    let best: ReplayTrajectoryPoint | null = null, bestDistance = REACH_M ** 2;
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (const p of cells.get(`${cx + i},${cz + j}`) ?? []) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDistance) { bestDistance = d; best = p; }
    }
    if (best) return best.y;
    let globalBest: ReplayTrajectoryPoint | null = null, globalDist = Infinity;
    for (const p of points) {
      if (!Number.isFinite(p.y)) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < globalDist) { globalDist = d; globalBest = p; }
    }
    return globalBest?.y ?? null;
  };
}

/**
 * The layout's left/right boundaries (native x/z, the painted white lines) as thin unlit ribbons draped
 * on the scanned road and kerb surfaces. Both edges probe the surface elevation to prevent occluding
 * diagonal curb triangles and elevation clip, and short gaps across mesh seams are filled to keep lines continuous.
 */
export function makeTrackLimits(boundaries: Array<Array<[number, number]>>, lap: ReplayTrajectoryPoint[], origin: Vector3, surfaceHeight: SurfaceHeight): Mesh<BufferGeometry, MeshBasicMaterial> {
  const near = lapHeight(lap), half = TRACK_LIMIT_WIDTH_M / 2, positions: number[] = [], indices: number[] = [];
  const probe = (px: number, pz: number, h: number): number | null => surfaceHeight({x: px, y: h + 5, z: pz}, 12);

  for (const boundary of boundaries) {
    const closed = boundary.length > 2 && Math.hypot(boundary[0][0] - boundary[boundary.length - 1][0], boundary[0][1] - boundary[boundary.length - 1][1]) < GAP_M;
    const samples: Array<[number, number]> = [];
    const path = closed ? [...boundary, boundary[0]] : boundary;
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_M));
      for (let s = 0; s < steps; s++) samples.push([ax + (bx - ax) * s / steps, az + (bz - az) * s / steps]);
    }
    if (!closed && path.length) samples.push(path[path.length - 1]);
    if (!samples.length) continue;

    let lastHint: number | null = null;
    const raw: Array<{ yL: number; yR: number } | null> = new Array<{ yL: number; yR: number } | null>(samples.length).fill(null);

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (!sample) continue;
      const [x, z] = sample;
      const sampleHint: number | null = near(x, z);
      const hint: number | null = sampleHint ?? lastHint;
      if (hint === null) { raw[i] = null; continue; }
      lastHint = hint;

      const prev = (closed && i === 0 ? samples[samples.length - 1] : samples[Math.max(0, i - 1)]) ?? sample;
      const next = (closed && i === samples.length - 1 ? samples[0] : samples[Math.min(samples.length - 1, i + 1)]) ?? sample;
      const length = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
      const dx = (next[0] - prev[0]) / length, dz = (next[1] - prev[1]) / length;

      const lx = x - dz * half, lz = z + dx * half;
      const rx = x + dz * half, rz = z - dx * half;

      let yMid: number | null = probe(x, z, hint);
      const hProbe: number = yMid ?? hint;
      let yL: number | null = probe(lx, lz, hProbe);
      let yR: number | null = probe(rx, rz, hProbe);

      if (yMid === null) yMid = yL ?? yR;
      if (yL === null) yL = yMid;
      if (yR === null) yR = yMid;

      if (yL !== null && yR !== null) {
        raw[i] = { yL, yR };
        lastHint = (yL + yR) / 2;
      } else {
        raw[i] = null;
      }
    }

    // Interpolate small gaps (<= GAP_M) across road seams or edge tolerances so lines remain continuous.
    for (let i = 0; i < samples.length; i++) {
      if (raw[i] !== null) continue;
      const start = i;
      while (i < samples.length && raw[i] === null) i++;
      const end = i;
      const prevValid = start - 1;
      const nextValid = end < samples.length ? end : -1;

      if (prevValid >= 0 && nextValid >= 0) {
        const gapDist = Math.hypot(samples[nextValid][0] - samples[prevValid][0], samples[nextValid][1] - samples[prevValid][1]);
        if (gapDist <= GAP_M) {
          const pL = raw[prevValid]!.yL, nL = raw[nextValid]!.yL;
          const pR = raw[prevValid]!.yR, nR = raw[nextValid]!.yR;
          for (let k = start; k < end; k++) {
            const t = (k - prevValid) / (nextValid - prevValid);
            raw[k] = { yL: pL + (nL - pL) * t, yR: pR + (nR - pR) * t };
          }
        }
      }
    }

    let prevBase = -1, prevSampleIdx = -1, firstBase = -1, firstSampleIdx = -1;
    samples.forEach(([x, z], i) => {
      const heights = raw[i];
      if (heights === null) {
        prevBase = -1;
        prevSampleIdx = -1;
        return;
      }
      const prev = closed && i === 0 ? samples[samples.length - 1] : samples[Math.max(0, i - 1)];
      const next = closed && i === samples.length - 1 ? samples[0] : samples[Math.min(samples.length - 1, i + 1)];
      const length = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
      const dx = (next[0] - prev[0]) / length, dz = (next[1] - prev[1]) / length;

      const base = positions.length / 3;
      const sx = x - origin.x, sz = z - origin.z;
      const syL = heights.yL - origin.y + LIFT_M;
      const syR = heights.yR - origin.y + LIFT_M;

      positions.push(sx - dz * half, syL, sz + dx * half, sx + dz * half, syR, sz - dx * half);

      if (firstBase < 0) {
        firstBase = base;
        firstSampleIdx = i;
      }

      if (prevBase >= 0 && Math.hypot(x - samples[prevSampleIdx][0], z - samples[prevSampleIdx][1]) <= GAP_M) {
        indices.push(prevBase, prevBase + 1, base, prevBase + 1, base + 1, base);
      }
      prevBase = base;
      prevSampleIdx = i;
    });

    if (closed && firstBase >= 0 && prevBase >= 0 && prevSampleIdx >= 0 && firstSampleIdx !== prevSampleIdx) {
      const gapDist = Math.hypot(samples[firstSampleIdx][0] - samples[prevSampleIdx][0], samples[firstSampleIdx][1] - samples[prevSampleIdx][1]);
      if (gapDist <= GAP_M) {
        indices.push(prevBase, prevBase + 1, firstBase, prevBase + 1, firstBase + 1, firstBase);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  // Below the racing line's offset, above the road and kerbs it lies on.
  const lines = new Mesh(geometry, new MeshBasicMaterial({color: '#f4f4ef', side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
  lines.name = 'track-limits';
  lines.renderOrder = 1;
  return lines;
}
