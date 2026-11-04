import type { SceneryChunk, SceneryLayout, ScenerySectorChunk } from '../../../../../shared/types/scenes/scenery.js';

/** What the stream is centred on: a car at a lap distance, or a free camera at a native x/z position. */
export type StreamView = { kind: 'lap'; lapDistanceM: number } | { kind: 'free'; x: number; z: number };

/** A chunk leaves only when it is this far outside the resident window, so a camera oscillating at the edge does not thrash. */
export const HYSTERESIS_M = 250;

export interface ResidencyPlan {
  /** Sector chunk ids that must be resident, in load order: under the camera, then ahead nearest first, then behind (free: nearest first). */
  wanted: string[];
  /** The wanted chunks that contain the camera (lap) or are nearest (free); the first things to show. */
  under: string[];
  /** Everything that may stay loaded: the wanted chunks plus those within the hysteresis margin. */
  keep: Set<string>;
}

const mod = (value: number, length: number): number => ((value % length) + length) % length;

/** Whether `[aStart, aEnd]` meets `[bStart, bEnd]` once b is repeated every `route` metres (a pit chunk's lap range may exceed the route). */
function overlapsCircular(aStart: number, aEnd: number, bStart: number, bEnd: number, route: number): boolean {
  for (let k = -2; k <= 2; k++) if (bStart + k * route <= aEnd && bEnd + k * route >= aStart) return true;
  return false;
}

function boundsDistanceXZ(chunk: SceneryChunk, x: number, z: number): number {
  const { min, max } = chunk.bounds;
  return Math.hypot(Math.max(min[0] - x, 0, x - max[0]), Math.max(min[2] - z, 0, z - max[2]));
}

/** Whether the lap distance lies inside the chunk's lap range (circular). */
function contains(chunk: ScenerySectorChunk, lap: number, route: number): boolean {
  return overlapsCircular(lap, lap, chunk.lapStartM, chunk.lapEndM, route);
}

/**
 * The resident set of docs/SCENE_PACKAGE.md. At lap distance L a main sector is resident when its lap range meets
 * `[L - residentBehindM, L + residentAheadM]` (circular); pit chunks use their main lap range. A free camera keeps every chunk whose
 * xz bounds are within `freeCameraRadiusM`. The horizon is always resident and not part of the plan.
 */
export function planResidency(layout: SceneryLayout, view: StreamView, hysteresisM = HYSTERESIS_M): ResidencyPlan {
  const { residentBehindM, residentAheadM, freeCameraRadiusM } = layout.streaming, route = layout.routeLengthM;
  const wanted: Array<{ id: string; rank: number; key: number; pit: boolean }> = [], keep = new Set<string>();
  if (view.kind === 'free') {
    for (const chunk of layout.sectors) {
      const distance = boundsDistanceXZ(chunk, view.x, view.z);
      if (distance < freeCameraRadiusM + hysteresisM) keep.add(chunk.id);
      if (distance < freeCameraRadiusM) wanted.push({ id: chunk.id, rank: 0, key: distance, pit: chunk.kind === 'pit' });
    }
    wanted.sort((a, b) => a.key - b.key || Number(a.pit) - Number(b.pit) || a.id.localeCompare(b.id));
    const nearest = wanted.length ? wanted[0].key : 0;
    return { wanted: wanted.map(item => item.id), under: wanted.filter(item => item.key === nearest).map(item => item.id), keep };
  }
  const lap = mod(view.lapDistanceM, route);
  for (const chunk of layout.sectors) {
    const inside = overlapsCircular(chunk.lapStartM, chunk.lapEndM, lap - residentBehindM, lap + residentAheadM, route);
    if (overlapsCircular(chunk.lapStartM, chunk.lapEndM, lap - residentBehindM - hysteresisM, lap + residentAheadM + hysteresisM, route)) keep.add(chunk.id);
    if (!inside) continue;
    if (contains(chunk, lap, route)) { wanted.push({ id: chunk.id, rank: 0, key: 0, pit: chunk.kind === 'pit' }); continue; }
    const ahead = mod(chunk.lapStartM - lap, route), behind = mod(lap - chunk.lapEndM, route);
    const pit = chunk.kind === 'pit';
    wanted.push(ahead <= residentAheadM ? { id: chunk.id, rank: 1, key: ahead, pit } : { id: chunk.id, rank: 2, key: behind, pit });
  }
  wanted.sort((a, b) => a.rank - b.rank || a.key - b.key || Number(a.pit) - Number(b.pit) || a.id.localeCompare(b.id));
  return { wanted: wanted.map(item => item.id), under: wanted.filter(item => item.rank === 0).map(item => item.id), keep };
}
