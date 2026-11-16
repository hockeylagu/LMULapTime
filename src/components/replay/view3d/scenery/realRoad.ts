import { BufferAttribute, Mesh, type IUniform, type Object3D } from 'three';
import { REALROAD_NONE } from '../../../../../shared/packageContract/scenery.js';

/**
 * The track surface state the road and kerb surfaces draw (docs/SCENE_PACKAGE.md#realroad-elements): each vertex names a venue point
 * (`_lmu_realroad`), the layout's table maps the point to a surface element, and the element's state gives its rubber and loose
 * material. The table is applied here into each vertex's own two bytes (`surfaceRealRoad`, rubber and loose material as fractions of
 * full). An attribute rather than a texture: a texture unit more would keep the roads with the most maps out of their batches
 * (`sceneryBatches.ts`). Water is not drawn. The state drawn is the assumed one: the replay's own (docs/VCR_FORMAT.md §4.21,
 * `server/replay/decode/replaySurface.ts`) waits for a replay cache step that is not planned yet.
 */

/** The package's per-vertex point (float, -1 for none). */
export const REALROAD_POINT_ATTRIBUTE = '_lmu_realroad';
/** The vertex's rubber and loose material (two normalized bytes), written here. */
export const REALROAD_STATE_ATTRIBUTE = 'surfaceRealRoad';
/** Bytes per element of a replay surface state: rubber laid, loose material, surface water, surface temperature. */
const SURFACE_STATE_CHANNELS = 4;
/** The rubber drawn on every element: a fifth of full, near what a captured practice frame held (0.18 and 0.24). */
export const ASSUMED_RUBBER = 51;

/**
 * The track's median rubber, for surfaces that draw the track average instead of their own vertices' (`flags.groove: 'trackAverage'`):
 * the assumed rubber, every element having it.
 */
export const realRoadUniforms: {surface_realRoadMedian: IUniform<number>} = {surface_realRoadMedian: {value: ASSUMED_RUBBER / 255}};

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

/** The state drawn: the assumed rubber on every element, nothing else. */
function assumedSurfaceState(elements: number): Uint8Array {
  const state = new Uint8Array(elements * SURFACE_STATE_CHANNELS);
  for (let i = 0; i < state.length; i += SURFACE_STATE_CHANNELS) state[i] = ASSUMED_RUBBER;
  return state;
}

export interface RealRoadSurface {
  /** Gives each mesh under `root` that names points its state attribute. Before the chunk is batched. */
  prepare(root: Object3D): void;
}

/** The layout's surface over its point table (`table[point]` = element index or `REALROAD_NONE`), drawing the assumed state. */
export function createRealRoadSurface(table: Uint32Array, elements: number): RealRoadSurface {
  for (const element of table) if (element !== REALROAD_NONE && element >= elements) throw Error(`RealRoad table names element ${element} of ${elements}`);
  const points = new Uint8Array(table.length * 2);
  gatherPointStates(table, assumedSurfaceState(elements), points);
  return {
    prepare(root) {
      root.traverse(child => {
        if (!(child instanceof Mesh)) return;
        const geometry = (child as Mesh).geometry, ids = geometry.getAttribute(REALROAD_POINT_ATTRIBUTE);
        if (!(ids instanceof BufferAttribute) || geometry.getAttribute(REALROAD_STATE_ATTRIBUTE)) return;
        const state = new Uint8Array(ids.count * 2);
        fillVertexStates(ids.array, points, state);
        geometry.setAttribute(REALROAD_STATE_ATTRIBUTE, new BufferAttribute(state, 2, true));
      });
    },
  };
}
