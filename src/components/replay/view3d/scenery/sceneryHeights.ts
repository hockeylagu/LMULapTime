import type { Object3D } from 'three';
import { buildSurfaceHeight, type SurfaceHeight, type SurfaceHeightBuilder } from '../surfaceProjection.js';

/** Scenery nodes are named `<material>__<kind>`; the filler ground is the generic estimate under the scanned surfaces. */
const isFillerGround = (name: string) => name.startsWith('FILLER_GROUND');
/** Opaque scanned surfaces (road, kerb, terrain, walls) can hold a wheel; masks, blends and decals cannot. */
const isOpaqueSurface = (name: string) => !isFillerGround(name) && /__OPAQUE(?:__|$)/.test(name);
const GROUND_NAMES = ['terrain', 'road', 'kerb', 'panorama', 'grass'];

export function isSceneryGround(name: string): boolean {
  const lowerName = name.toLowerCase();
  return GROUND_NAMES.some(ground => lowerName.includes(ground));
}

export interface SceneryHeights {
  /** Highest resident scanned surface under a point (native coordinates), excluding the filler ground. */
  surfaceHeight: SurfaceHeight;
  /** Registers a chunk root while it is still in native coordinates (before it joins the scene). */
  add(id: string, root: Object3D, bounds: {min: number[]; max: number[]}): void;
  remove(id: string): void;
  /** Resolves once every registered chunk's index is built. */
  whenReady(): Promise<void>;
  /** Stops pending index builds. */
  dispose(): void;
}

/** Main-thread time per slice of index building; the rest of the frame stays free for rendering. */
const SLICE_MS = 1, LOADING_SLICE_MS = 12;

/**
 * Surface lookups over the resident chunks only: a point outside every resident chunk has no height (null). A chunk's index is
 * built in slices of SLICE_MS between frames and answers null until done; `ready` runs when a chunk's heights become available.
 */
export function createSceneryHeights(ready: () => void = () => {}): SceneryHeights {
  type Chunk = {bounds: {min: number[]; max: number[]}; surface: SurfaceHeight; pending: SurfaceHeightBuilder[]};
  const chunks = new Map<string, Chunk>();
  let timer = 0, frame = 0, waiters: (() => void)[] = [];
  const settle = () => { if ([...chunks.values()].some(chunk => chunk.pending.length)) return; const done = waiters; waiters = []; done.forEach(resolve => resolve()); };
  const pump = () => {
    timer = 0; frame = 0;
    const deadline = performance.now() + (waiters.length ? LOADING_SLICE_MS : SLICE_MS);
    let completed = false, waiting = false;
    for (const chunk of chunks.values()) {
      if (!chunk.pending.length) continue;
      while (chunk.pending.length && chunk.pending[0].step(deadline)) chunk.pending.shift();
      if (chunk.pending.length) { waiting = true; break; }
      completed = true;
    }
    if (waiting) schedule();
    if (completed) { ready(); settle(); }
  };
  const schedule = () => {
    if (waiters.length) timer = window.setTimeout(pump, 0);
    else frame = window.requestAnimationFrame(pump);
  };
  const surfaceHeight: SurfaceHeight = (point, reach) => {
    let best: number | null = null;
    for (const chunk of chunks.values()) {
      const {min, max} = chunk.bounds;
      if (point.x < min[0] || point.x > max[0] || point.z < min[2] || point.z > max[2]) continue;
      const height = chunk.surface(point, reach);
      if (height !== null && (best === null || height > best)) best = height;
    }
    return best;
  };
  return {
    surfaceHeight,
    add(id, root, bounds) {
      const surface = buildSurfaceHeight(root, isOpaqueSurface);
      chunks.set(id, {bounds, surface: surface.lookup, pending: [surface]});
      if (!timer && !frame) schedule();
    },
    remove(id) { chunks.delete(id); settle(); },
    whenReady: () => new Promise<void>(resolve => {
      waiters.push(resolve);
      if (frame) { window.cancelAnimationFrame(frame); frame = 0; schedule(); }
      settle();
    }),
    dispose() { window.clearTimeout(timer); window.cancelAnimationFrame(frame); timer = 0; frame = 0; chunks.clear(); settle(); },
  };
}
