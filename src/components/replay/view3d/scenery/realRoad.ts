import { DataTexture, NearestFilter, RGFormat, UnsignedByteType, type IUniform } from 'three';
import { REALROAD_NONE } from '../../../../../shared/packageContract/scenery.js';

/**
 * The track surface state the road and kerb surfaces draw (docs/SCENE_PACKAGE.md#realroad-elements): each vertex names a venue point
 * (`_lmu_realroad`), the layout's table maps the point to a surface element, and the replay's state at the scene's time gives the
 * element's rubber and loose material (docs/VCR_FORMAT.md §4.21). The table is applied here, once per state, into one texture of
 * points (red rubber, green loose material, as fractions of full), so a vertex reads its state with one fetch. Water is not drawn.
 */

/** Points per row of the state texture. */
export const REALROAD_TEXTURE_WIDTH = 2048;
/** Bytes per element of a replay surface state: rubber laid, loose material, surface water, surface temperature. */
export const SURFACE_STATE_CHANNELS = 4;
/** The rubber drawn where no replay state is at hand: a fifth of full, near what a captured practice frame held (0.18 and 0.24). */
export const ASSUMED_RUBBER = 51;

/** Texture units the vertex stage adds to a surface that reads the state. */
export const REALROAD_SAMPLERS = 1;

function stateTexture(points: number): DataTexture {
  const height = Math.max(1, Math.ceil(points / REALROAD_TEXTURE_WIDTH));
  const texture = new DataTexture(new Uint8Array(REALROAD_TEXTURE_WIDTH * height * 2), REALROAD_TEXTURE_WIDTH, height, RGFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const NO_STATE = stateTexture(0);

/**
 * Shared by every surface program that reads the state; the scene's surface sets them. `surface_realRoad` holds no point (every vertex
 * reads none) until a layout's table is in. `surface_realRoadMedian` is the track's median rubber, for surfaces that draw the track
 * average instead of their own vertices' (`flags.groove: 'trackAverage'`).
 */
export const realRoadUniforms: {surface_realRoad: IUniform<DataTexture>; surface_realRoadMedian: IUniform<number>} = {
  surface_realRoad: {value: NO_STATE},
  surface_realRoadMedian: {value: 0},
};

/** Vertex declarations of a surface that reads the state. */
export const REALROAD_VERTEX_DECLARATIONS = `
    attribute float _lmu_realroad;
    uniform sampler2D surface_realRoad;
    varying vec2 vSurfaceRealRoad;
`;

/** The vertex's rubber and loose material (0 to 1), none for a vertex without a point or a point outside the texture. */
export const REALROAD_VERTEX_MAIN = `
    vSurfaceRealRoad = vec2(0.0);
    if (_lmu_realroad >= 0.0) {
      ivec2 realRoadSize = textureSize(surface_realRoad, 0);
      int realRoadPoint = int(_lmu_realroad + 0.5);
      if (realRoadPoint < realRoadSize.x * realRoadSize.y)
        vSurfaceRealRoad = texelFetch(surface_realRoad, ivec2(realRoadPoint % realRoadSize.x, realRoadPoint / realRoadSize.x), 0).rg;
    }
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

export interface RealRoadSurface {
  /** The layout's element count: a state is `elements` x 4 bytes. */
  readonly elements: number;
  /** Draws `state` (the assumed state for null). */
  setState(state: Uint8Array | null): void;
  /** Takes the shared uniforms back to no state. */
  dispose(): void;
}

/** The layout's surface state texture over its point table (`table[point]` = element index or `REALROAD_NONE`), drawing the assumed state. */
export function createRealRoadSurface(table: Uint32Array, elements: number): RealRoadSurface {
  for (const element of table) if (element !== REALROAD_NONE && element >= elements) throw Error(`RealRoad table names element ${element} of ${elements}`);
  const texture = stateTexture(table.length), assumed = assumedSurfaceState(elements);
  const setState = (state: Uint8Array | null) => {
    const drawn = state ?? assumed;
    if (drawn.length !== elements * SURFACE_STATE_CHANNELS) throw Error(`Surface state of ${drawn.length} bytes for ${elements} elements`);
    gatherPointStates(table, drawn, texture.image.data as Uint8Array);
    texture.needsUpdate = true;
    realRoadUniforms.surface_realRoadMedian.value = medianRubber(drawn);
  };
  setState(null);
  realRoadUniforms.surface_realRoad.value = texture;
  return {
    elements,
    setState,
    dispose() {
      if (realRoadUniforms.surface_realRoad.value === texture) {
        realRoadUniforms.surface_realRoad.value = NO_STATE;
        realRoadUniforms.surface_realRoadMedian.value = 0;
      }
      texture.dispose();
    },
  };
}
