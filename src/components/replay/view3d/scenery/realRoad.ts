import { BufferAttribute, BufferGeometry, Mesh, type IUniform, type Object3D } from 'three';
import { REALROAD_NONE } from '../../../../../shared/packageContract/scenery.js';

/**
 * The track surface state the road and kerb surfaces draw (docs/SCENE_PACKAGE.md#realroad-elements): each vertex names a venue point
 * (`_lmu_realroad`), the layout's table maps the point to a surface element, and the replay's state at the scene's time gives the
 * element's rubber and loose material (docs/VCR_FORMAT.md §4.21). The table is applied here, once per state, into each vertex's own
 * two bytes (`surfaceRealRoad`, rubber and loose material as fractions of full). An attribute rather than a texture: a texture unit
 * more would keep the roads with the most maps out of their batches (`sceneryBatches.ts`). Water is not drawn.
 */

/** The package's per-vertex point (float, -1 for none). */
export const REALROAD_POINT_ATTRIBUTE = '_lmu_realroad';
/** The vertex's rubber and loose material (two normalized bytes), written here. */
export const REALROAD_STATE_ATTRIBUTE = 'surfaceRealRoad';
/** Bytes per element of a replay surface state: rubber laid, loose material, surface water, surface temperature. */
export const SURFACE_STATE_CHANNELS = 4;
/** The rubber drawn where no replay state is at hand: a fifth of full, near what a captured practice frame held (0.18 and 0.24). */
export const ASSUMED_RUBBER = 51;

/**
 * The track's median rubber, for surfaces that draw the track average instead of their own vertices' (`flags.groove: 'trackAverage'`);
 * shared by every program that reads it, set by the scene's surface.
 */
export const realRoadUniforms: {surface_realRoadMedian: IUniform<number>} = {surface_realRoadMedian: {value: 0}};

/** Vertex declarations of a surface that reads the state. */
export const REALROAD_VERTEX_DECLARATIONS = `
    attribute vec2 ${REALROAD_STATE_ATTRIBUTE};
    varying vec2 vSurfaceRealRoad;
`;

/** The vertex's rubber and loose material (0 to 1); a geometry without the attribute reads none. */
export const REALROAD_VERTEX_MAIN = `
    vSurfaceRealRoad = ${REALROAD_STATE_ATTRIBUTE};
`;

/** Writes each point's rubber and loose material from `state` (elements x 4 bytes) through `table`; a point without an element reads none. */
export function gatherPointStates(table: Uint32Array, state: Uint8Array, out: Uint8Array): void {
  for (let point = 0; point < table.length; point++) {
    const element = table[point];
    if (element === REALROAD_NONE) { out[2 * point] = 0; out[2 * point + 1] = 0; continue; }
    out[2 * point] = state[SURFACE_STATE_CHANNELS * element];
    out[2 * point + 1] = state[SURFACE_STATE_CHANNELS * element + 1];
  }
}

/** Writes each vertex its point's two bytes; a vertex without a point, or naming one past the table, reads none. */
export function fillVertexStates(pointIds: ArrayLike<number>, points: Uint8Array, out: Uint8Array): void {
  const count = points.length / 2;
  for (let vertex = 0; vertex < pointIds.length; vertex++) {
    const point = Math.round(pointIds[vertex]);
    const known = point >= 0 && point < count;
    out[2 * vertex] = known ? points[2 * point] : 0;
    out[2 * vertex + 1] = known ? points[2 * point + 1] : 0;
  }
}

/** The median rubber of the elements, 0 to 1. */
export function medianRubber(state: Uint8Array): number {
  const counts = new Uint32Array(256), elements = state.length / SURFACE_STATE_CHANNELS;
  for (let i = 0; i < state.length; i += SURFACE_STATE_CHANNELS) counts[state[i]]++;
  let seen = 0;
  for (let level = 0; level < 256; level++) if ((seen += counts[level]) * 2 >= elements) return level / 255;
  return 0;
}

/** The state drawn without a replay's: the assumed rubber on every element, nothing else. */
export function assumedSurfaceState(elements: number): Uint8Array {
  const state = new Uint8Array(elements * SURFACE_STATE_CHANNELS);
  for (let i = 0; i < state.length; i += SURFACE_STATE_CHANNELS) state[i] = ASSUMED_RUBBER;
  return state;
}

/** Whether a geometry carries both attributes, with their data on the CPU side. */
function stateOf(geometry: BufferGeometry): {ids: BufferAttribute; state: BufferAttribute} | null {
  const ids = geometry.getAttribute(REALROAD_POINT_ATTRIBUTE), state = geometry.getAttribute(REALROAD_STATE_ATTRIBUTE);
  return ids instanceof BufferAttribute && state instanceof BufferAttribute ? {ids, state} : null;
}

export interface RealRoadSurface {
  /** The layout's element count: a state is `elements` x 4 bytes. */
  readonly elements: number;
  /** Draws `state` (the assumed state for null) on every geometry it follows. */
  setState(state: Uint8Array | null): void;
  /** Gives each mesh under `root` that names points its state attribute, at the state drawn now. Before the chunk is batched. */
  prepare(root: Object3D): void;
  /** Follows the geometries under `objects` that hold the state attribute (unbatched meshes, batches) until they are disposed. */
  follow(objects: readonly Object3D[]): void;
  /** Takes the shared uniform back to no state. */
  dispose(): void;
}

/** The layout's surface state over its point table (`table[point]` = element index or `REALROAD_NONE`), drawing the assumed state. */
export function createRealRoadSurface(table: Uint32Array, elements: number): RealRoadSurface {
  for (const element of table) if (element !== REALROAD_NONE && element >= elements) throw Error(`RealRoad table names element ${element} of ${elements}`);
  const points = new Uint8Array(table.length * 2), assumed = assumedSurfaceState(elements);
  const followed = new Set<BufferGeometry>();
  const forget = ({target}: {target: BufferGeometry}) => { followed.delete(target); };
  const refill = (geometry: BufferGeometry) => {
    const held = stateOf(geometry);
    if (!held) return;
    fillVertexStates(held.ids.array, points, held.state.array as Uint8Array);
    held.state.clearUpdateRanges(); held.state.needsUpdate = true;
  };
  const setState = (state: Uint8Array | null) => {
    const drawn = state ?? assumed;
    if (drawn.length !== elements * SURFACE_STATE_CHANNELS) throw Error(`Surface state of ${drawn.length} bytes for ${elements} elements`);
    gatherPointStates(table, drawn, points);
    realRoadUniforms.surface_realRoadMedian.value = medianRubber(drawn);
    for (const geometry of followed) refill(geometry);
  };
  setState(null);
  const meshes = (objects: readonly Object3D[], visit: (geometry: BufferGeometry) => void) => {
    for (const object of objects) object.traverse(child => { if (child instanceof Mesh) visit((child as Mesh).geometry); });
  };
  return {
    elements,
    setState,
    prepare(root) {
      meshes([root], geometry => {
        const ids = geometry.getAttribute(REALROAD_POINT_ATTRIBUTE);
        if (!(ids instanceof BufferAttribute) || geometry.getAttribute(REALROAD_STATE_ATTRIBUTE)) return;
        geometry.setAttribute(REALROAD_STATE_ATTRIBUTE, new BufferAttribute(new Uint8Array(ids.count * 2), 2, true));
        refill(geometry);
      });
    },
    follow(objects) {
      meshes(objects, geometry => {
        if (followed.has(geometry) || !stateOf(geometry)) return;
        followed.add(geometry); geometry.addEventListener('dispose', forget);
      });
    },
    dispose() {
      for (const geometry of followed) geometry.removeEventListener('dispose', forget);
      followed.clear();
      realRoadUniforms.surface_realRoadMedian.value = 0;
    },
  };
}
