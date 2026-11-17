import { expect, it, vi } from 'vitest';
import { Group, Scene, Vector3, Vector4, type WebGLRenderer } from 'three';
const draws = vi.hoisted(() => [] as Array<{viewport: unknown; dynamic: unknown[]; minCasterM: number}>);
vi.mock('../../../../../src/components/replay/view3d/shadows/shadowCasterPass.js', () => ({
  createShadowCasterPass: () => ({
    draw(_target: unknown, layers: Array<{viewport: unknown}>, _view: unknown, dynamic: unknown[], minCasterM: number) {
      draws.push({viewport: layers[0].viewport, dynamic, minCasterM});
    },
    dispose() {},
  }),
}));
import { createOverheadMap } from '../../../../../src/components/replay/view3d/car/overheadMap.js';

it('draws the scenery over the car from above and below, again once the car leaves its middle or the scenery changed, waiting on busy frames', () => {
  const map = createOverheadMap({initRenderTarget() {}} as unknown as WebGLRenderer, new Scene()), cars = new Group();
  expect(map.depth).toBeNull(); expect(map.below).toBeNull();
  // The first drawing never waits, busy or not; the cars are left out of both maps.
  expect(map.update(new Vector3(100, 5, -40), [cars], true)).toBe(true);
  const layer = {viewport: new Vector4(0, 0, 1024, 1024), dynamic: [cars], minCasterM: 1};
  expect(draws).toEqual([layer, layer]);
  expect(map.depth).not.toBeNull(); expect(map.below).not.toBeNull(); expect(map.below).not.toBe(map.depth);
  // A point at the car maps to each map's middle, at the depth of its height under the camera above (300 m over the car, 600 m
  // deep): one 6 m higher lies 6 m nearer it, and 6 m farther from the camera below.
  const at = (matrix: typeof map.matrix, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(matrix).toArray().map(v => +v.toFixed(6));
  expect(at(map.matrix, 100, 5, -40)).toEqual([0.5, 0.5, 0.5]);
  expect(at(map.matrix, 100, 11, -40)[2]).toBeCloseTo(0.5 - 6 / map.depthM, 6);
  expect(at(map.belowMatrix, 100, 5, -40)).toEqual([0.5, 0.5, 0.5]);
  expect(at(map.belowMatrix, 100, 11, -40)[2]).toBeCloseTo(0.5 + 6 / map.depthM, 6);
  // 128 m to each side (256 m across); seen from below, the map is mirrored.
  expect(at(map.matrix, 228, 5, -40)[0]).toBeCloseTo(1, 6);
  expect(at(map.belowMatrix, 228, 5, -40)[0]).toBeCloseTo(0, 6);
  // Within 48 m of where it was drawn, nothing; past it, again, but a busy frame waits once.
  expect(map.update(new Vector3(140, 5, -40), [cars])).toBe(false);
  expect(map.update(new Vector3(150, 5, -40), [cars], true)).toBe(false);
  expect(map.update(new Vector3(151, 5, -40), [cars], true)).toBe(true);
  expect(at(map.matrix, 151, 5, -40)).toEqual([0.5, 0.5, 0.5]); expect(at(map.belowMatrix, 151, 5, -40)).toEqual([0.5, 0.5, 0.5]);
  // New scenery: drawn again once 30 updates have passed since the last drawing, so a burst of chunks draws it once.
  map.stale();
  for (let i = 0; i < 29; i++) expect(map.update(new Vector3(151, 5, -40), [cars])).toBe(false);
  expect(map.update(new Vector3(151, 5, -40), [cars])).toBe(true);
  expect(map.update(new Vector3(151, 5, -40), [cars])).toBe(false);
  expect(draws).toHaveLength(6);
  map.dispose();
});
