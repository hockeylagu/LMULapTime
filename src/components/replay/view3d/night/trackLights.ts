/**
 * The track lights at night (docs/SCENE_PACKAGE.md "Night", track lights and nodes). The game adds them per vertex, diffuse only,
 * under the ambient occlusion: a vertex of a scene node (its `SCENE_NODE_ATTRIBUTE`) takes the node's lights (`nodeTrackLights`), any
 * other vertex every light in reach. Scenery and lights never move, so each chunk vertex's sum is worked out once when the chunk loads
 * and replaces its node id: `TRACK_LIGHT_ATTRIBUTE`, the same four bytes. Every light in reach is found through a grid of cells over
 * the lights' reach (ours: the game lists the lights per draw).
 */
import { BufferAttribute, Matrix3, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import { SCENE_NODE_ATTRIBUTE, SCENE_NODE_NONE, type SceneryNight } from '../../../../../shared/packageContract/index.js';

type Vec3 = readonly [number, number, number];

/** One of the layout's track lights (the package's night `lights`): an omni light in the scenery frame. */
export interface TrackLight {position: Vec3; rangeM: number; colour: Vec3}

/** The game stretches the vertical distance to a light below the vertex by this factor (the package contract states it). */
export const BELOW_STRETCH = 20;

/**
 * Adds what one track light gives a point with a unit normal to `sum`, before the albedo and the occlusion:
 * N·L · colour · saturate(1 − d / range).
 */
export function addTrackLight(light: TrackLight, px: number, py: number, pz: number, nx: number, ny: number, nz: number, sum: number[]): void {
  const dx = light.position[0] - px, dz = light.position[2] - pz;
  // A light below the vertex: its vertical distance counts twenty times.
  const dy = (light.position[1] - py) * (light.position[1] < py ? BELOW_STRETCH : 1);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d === 0 || d >= light.rangeM) return;
  const lit = Math.max(0, (nx * dx + ny * dy + nz * dz) / d) * (1 - d / light.rangeM);
  sum[0] += light.colour[0] * lit; sum[1] += light.colour[1] * lit; sum[2] += light.colour[2] * lit;
}

/** The chunk vertex attribute holding the vertex's track light sum, RGBE in four normalized bytes (`TRACK_LIGHT_DECODE_GLSL`). */
export const TRACK_LIGHT_ATTRIBUTE = '_lmu_tracklight';
/** The shared exponent's bias: sums from 2^−EXPONENT_BIAS to 2^(255 − EXPONENT_BIAS) of the brightest channel, all normal floats. */
const EXPONENT_BIAS = 64;
export const TRACK_LIGHT_DECODE_GLSL = (rgbe: string) => `(${rgbe}.rgb * exp2(floor(${rgbe}.a * 255.0 + 0.5) - ${EXPONENT_BIAS.toFixed(1)}))`;

/** Writes `sum` as RGBE at `at`: each channel over the power of two above the brightest, in 255ths, and that power. */
export function encodeTrackLight(sum: readonly number[], out: Uint8Array, at: number): void {
  const peak = Math.max(sum[0], sum[1], sum[2]);
  if (!(peak > 0)) { out.fill(0, at, at + 4); return; }
  const exponent = Math.min(255 - EXPONENT_BIAS, Math.max(-EXPONENT_BIAS, Math.ceil(Math.log2(peak * 255 / 254.5))));
  const scale = 255 / 2 ** exponent;
  for (let c = 0; c < 3; c++) out[at + c] = Math.min(255, Math.round(sum[c] * scale));
  out[at + 3] = exponent + EXPONENT_BIAS;
}

/** The grid's cell edge, metres. Ours. */
export const TRACK_LIGHT_CELL_M = 32;

/** The layout's lights by cell: every light whose range reaches a cell, across (a light below a vertex reaches less far). */
export interface TrackLightGrid {minX: number; minZ: number; columns: number; rows: number; cells: number[][]}

export function trackLightGrid(lights: readonly TrackLight[]): TrackLightGrid {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const {position: [x, , z], rangeM} of lights) {
    minX = Math.min(minX, x - rangeM); maxX = Math.max(maxX, x + rangeM); minZ = Math.min(minZ, z - rangeM); maxZ = Math.max(maxZ, z + rangeM);
  }
  if (!lights.length) return {minX: 0, minZ: 0, columns: 0, rows: 0, cells: []};
  const cell = TRACK_LIGHT_CELL_M, columns = Math.max(1, Math.ceil((maxX - minX) / cell)), rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cells: number[][] = Array.from({length: columns * rows}, () => []);
  const column = (x: number) => Math.min(columns - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const row = (z: number) => Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / cell)));
  lights.forEach(({position: [x, , z], rangeM}, index) => {
    for (let r = row(z - rangeM); r <= row(z + rangeM); r++) for (let c = column(x - rangeM); c <= column(x + rangeM); c++) {
      const nx = Math.min(minX + (c + 1) * cell, Math.max(minX + c * cell, x)), nz = Math.min(minZ + (r + 1) * cell, Math.max(minZ + r * cell, z));
      if ((x - nx) ** 2 + (z - nz) ** 2 < rangeM * rangeM) cells[r * columns + c].push(index);
    }
  });
  return {minX, minZ, columns, rows, cells};
}

const NO_LIGHTS: readonly number[] = [];

/** The lights a point takes when it has no list: those of its cell. */
export function cellLights(grid: TrackLightGrid, x: number, z: number): readonly number[] {
  const c = Math.floor((x - grid.minX) / TRACK_LIGHT_CELL_M), r = Math.floor((z - grid.minZ) / TRACK_LIGHT_CELL_M);
  return c < 0 || r < 0 || c >= grid.columns || r >= grid.rows ? NO_LIGHTS : grid.cells[r * grid.columns + c];
}

export interface TrackLighting {
  /** Gives each mesh under `root` (a chunk in the scenery frame) its track light sums, in place of its node ids. Before the chunk is batched. */
  prepare(root: Object3D): void;
}

const NODE_ATTRIBUTE = SCENE_NODE_ATTRIBUTE.toLowerCase(); // three's glTF loader names a custom attribute in lower case.

/** The lights one scene node takes: the game's 20. */
export const NODE_TRACK_LIGHTS = 20;

/**
 * Each node's lights, by node id, as the game picks them per draw: the lights whose range reaches the node's mesh sphere (distance from the
 * centre under range plus radius), nearest the centre first, up to `NODE_TRACK_LIGHTS`.
 */
export function nodeTrackLights(lights: readonly TrackLight[], nodes: SceneryNight['nodes']): Map<number, number[]> {
  const lists = new Map<number, number[]>(), reach: {index: number; d: number}[] = [];
  for (const [id, , , , , x, y, z, radius] of nodes) {
    reach.length = 0;
    lights.forEach(({position, rangeM}, index) => {
      const d = Math.hypot(position[0] - x, position[1] - y, position[2] - z);
      if (d < rangeM + radius) reach.push({index, d});
    });
    lists.set(id, reach.sort((a, b) => a.d - b.d).slice(0, NODE_TRACK_LIGHTS).map(({index}) => index));
  }
  return lists;
}

export function createTrackLighting(night: Pick<SceneryNight, 'lights' | 'nodes'>): TrackLighting {
  const lights = night.lights, grid = trackLightGrid(lights), lists = nodeTrackLights(lights, night.nodes);
  const point = new Vector3(), normal = new Vector3(), normalMatrix = new Matrix3(), sum = [0, 0, 0];
  const light = (geometry: BufferGeometry, matrixWorld: Mesh['matrixWorld']) => {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), ids = geometry.getAttribute(NODE_ATTRIBUTE);
    const out = new Uint8Array(positions.count * 4);
    normalMatrix.getNormalMatrix(matrixWorld);
    for (let i = 0; lights.length && i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrixWorld);
      if (normals) normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize(); else normal.set(0, 1, 0);
      const id = ids ? Math.round(ids.getX(i)) : SCENE_NODE_NONE;
      const reaching = (id === SCENE_NODE_NONE ? undefined : lists.get(id)) ?? cellLights(grid, point.x, point.z);
      sum[0] = sum[1] = sum[2] = 0;
      for (const index of reaching) addTrackLight(lights[index], point.x, point.y, point.z, normal.x, normal.y, normal.z, sum);
      encodeTrackLight(sum, out, 4 * i);
    }
    return out;
  };
  return {
    prepare(root) {
      root.updateWorldMatrix(true, true);
      // Shared geometry takes the sums of its first mesh: the exporter writes one geometry per node.
      const done = new WeakSet<BufferGeometry>();
      root.traverse(child => {
        if (!(child instanceof Mesh)) return;
        const geometry = (child as Mesh).geometry;
        if (done.has(geometry) || !geometry.getAttribute('position')) return;
        done.add(geometry);
        geometry.setAttribute(TRACK_LIGHT_ATTRIBUTE, new BufferAttribute(light(geometry, child.matrixWorld), 4, true));
        geometry.deleteAttribute(NODE_ATTRIBUTE);
      });
    },
  };
}
