import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { SCENE_NODE_ATTRIBUTE } from '../../../../../shared/packageContract/index.js';
import type { SceneryNightLight, SceneryNode } from '../../../../../shared/packageContract/index.js';
import {
  addTrackLight, cellLights, createTrackLighting, encodeTrackLight, NODE_TRACK_LIGHTS, nodeTrackLights, TRACK_LIGHT_ATTRIBUTE, trackLightGrid,
} from '../../../../../src/components/replay/view3d/night/trackLights.js';

const light = (x: number, rangeM = 10, y = 5): SceneryNightLight => ({position: [x, y, 0], rangeM, colour: [2, 1, 0.5]});
const at = (lit: SceneryNightLight, point: [number, number, number], normal: [number, number, number]) => {
  const sum = [0, 0, 0]; addTrackLight(lit, ...point, ...normal, sum); return sum;
};
/** What the program decodes from four bytes (trackLights.ts `TRACK_LIGHT_DECODE_GLSL`). */
const decode = (bytes: Uint8Array, i = 0) => [0, 1, 2].map(c => bytes[4 * i + c] / 255 * 2 ** (bytes[4 * i + 3] - 64));

it('adds NÂ·L Â· colour Â· (1 âˆ’ d / range), diffuse only, nothing beyond its range or behind the face', () => {
  // Straight above a face looking up, 5 m away: full facing, half the range.
  expect(at(light(0), [0, 0, 0], [0, 1, 0])).toEqual([1, 0.5, 0.25]);
  expect(at(light(0), [0, 0, 0], [0, -1, 0])).toEqual([0, 0, 0]);
  expect(at(light(0, 4), [0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0]);
});

it('stretches the vertical distance to a light below the vertex twenty times, so the lamps shine down', () => {
  // A light 0.1 m below and 1 m beside a face turned toward it: 2 m away once stretched, the facing from the stretched vector.
  const below = at({position: [1, -0.1, 0], rangeM: 10, colour: [1, 1, 1]}, [0, 0, 0], [1, 0, 0]);
  const d = Math.hypot(1, 2);
  expect(below[0]).toBeCloseTo(1 / d * (1 - d / 10), 9);
});

it('encodes a sum in four bytes to within a part in 255 of its brightest channel, and nothing as zero', () => {
  const bytes = new Uint8Array(8);
  for (const sum of [[1, 0.5, 0.25], [123.4, 7, 0], [0.003, 0.002, 0.001]]) {
    encodeTrackLight(sum, bytes, 4);
    decode(bytes, 1).forEach((c, i) => expect(Math.abs(c - sum[i])).toBeLessThanOrEqual(Math.max(...sum) / 255));
  }
  encodeTrackLight([0, 0, 0], bytes, 0);
  expect([...bytes.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
});

it('lists in each grid cell every light whose range reaches it', () => {
  // Two lights 40 m apart, 10 m reach: the grid spans [âˆ’10, 50] Ã— [âˆ’10, 10], two cells by one; the second starts 22 m from the first light.
  const grid = trackLightGrid([light(0), light(40)]);
  expect([grid.minX, grid.minZ, grid.columns, grid.rows]).toEqual([-10, -10, 2, 1]);
  expect([cellLights(grid, 0, 0), cellLights(grid, 40, 0), cellLights(grid, 100, 0)]).toEqual([[0], [1], []]);
  expect(trackLightGrid([]).columns).toBe(0);
});

it("picks a node's lights by its mesh sphere: those whose range reaches it, nearest first, up to the game's 20", () => {
  // 25 lights along x, 10 m reach; a mesh sphere of radius 2 at x 30 is reached from x 18 to x 42 (exclusive).
  const lights = Array.from({length: 25}, (_, i) => light(2 * i));
  const lists = nodeTrackLights(lights, [[3, 0, 0, 0, 50, 30, 5, 0, 2], [4, 0, 0, 0, 0, 30, 5, 0, 200]]);
  expect(lists.get(3)).toEqual([15, 14, 16, 13, 17, 12, 18, 11, 19, 10, 20]);
  // Every light reaches the large sphere; the 20 nearest are kept.
  expect(lists.get(4)).toHaveLength(NODE_TRACK_LIGHTS);
  expect(lists.get(4)!.slice(0, 3)).toEqual([15, 14, 16]);
});

it("lights a node's vertex by the node's lights, any other by every light in reach, and drops the node ids", () => {
  // Node 7's mesh sphere is reached by the second light only.
  const night = {lights: [light(0, 10, 3), light(2, 10, 3)], nodes: [[7, 0, 0, 0, 0, 12, 3, 0, 0.5]] as SceneryNode[]};
  // Three vertices at the origin facing up: node 7, node 8 (a node of another layout of the venue, no row here), no node.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setAttribute(SCENE_NODE_ATTRIBUTE.toLowerCase(), new BufferAttribute(new Float32Array([7, 8, -1]), 1));
  const root = new Group(); root.add(new Mesh(geometry));
  createTrackLighting(night).prepare(root);
  const bytes = geometry.getAttribute(TRACK_LIGHT_ATTRIBUTE).array as Uint8Array;
  const both = at(night.lights[0], [0, 0, 0], [0, 1, 0]).map((c, i) => c + at(night.lights[1], [0, 0, 0], [0, 1, 0])[i]);
  const listed = at(night.lights[1], [0, 0, 0], [0, 1, 0]);
  [listed, both, both].forEach((sum, vertex) => decode(bytes, vertex).forEach((c, i) => expect(c).toBeCloseTo(sum[i], 1)));
  expect(geometry.getAttribute(SCENE_NODE_ATTRIBUTE.toLowerCase())).toBeUndefined();
});
