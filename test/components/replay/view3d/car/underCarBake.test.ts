import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  HEIGHT_VERTEX, OCCLUSION_FRAGMENT, bakeArea, bakeCamera, underCarQuadGeometry,
} from '../../../../../src/components/replay/view3d/car/underCarBake.js';

it('covers a square one metre longer than the car about the footprint centre', () => {
  const area = bakeArea(new Box3(new Vector3(-1, 0.1, -2.3), new Vector3(1.2, 1, 2.4)));
  expect(area.size).toBeCloseTo(5.7); expect(area.centreX).toBeCloseTo(0.1); expect(area.centreZ).toBeCloseTo(0.05); expect(area.minY).toBeCloseTo(0.1);
});

it('lands each point of the quad on the texel the height camera drew under it, front-left under front-left', () => {
  const bounds = new Box3(new Vector3(-1, 0, -2.3), new Vector3(1, 1, 2.3)), {camera, local} = bakeCamera(bounds), {size} = bakeArea(bounds);
  camera.matrixWorldInverse.copy(local).invert(); // The car's frame is the world here.
  const quad = underCarQuadGeometry(size), position = quad.getAttribute('position'), uv = quad.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const ndc = new Vector3(x, 0.02, z).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    expect(ndc.x / 2 + 0.5).toBeCloseTo(uv.getX(i), 6); expect(ndc.y / 2 + 0.5).toBeCloseTo(uv.getY(i), 6);
  }
  // A footprint corner (each side of each axis) reads the quarter of the map on its own side.
  for (const [x, z] of [[-1, -2.3], [1, -2.3], [-1, 2.3], [1, 2.3]]) {
    const ndc = new Vector3(x, 0.02, z).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    expect(Math.sign(ndc.x)).toBe(Math.sign(x)); expect(Math.sign(ndc.y)).toBe(Math.sign(z));
  }
});

it('builds the shader from the bake constants', () => {
  expect(OCCLUSION_FRAGMENT).toContain('const int AZIMUTHS = 32'); expect(OCCLUSION_FRAGMENT).toContain('uHeights');
  expect(OCCLUSION_FRAGMENT).toContain('1.0 - stored'); expect(HEIGHT_VERTEX).toContain('uMinY');
});
