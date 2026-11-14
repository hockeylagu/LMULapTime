import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  HEIGHT_VERTEX, OCCLUSION_FRAGMENT, SKY_HEIGHT_M, bakeArea, bakeCamera, underCarQuadGeometry, underCarStored,
} from '../../../../../src/components/replay/view3d/car/underCarBake.js';

const N = 64, SIZE = 5.7;

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

it('is open sky everywhere on an empty map', () => {
  const heights = new Float32Array(N * N).fill(SKY_HEIGHT_M);
  for (const [c, r] of [[32, 32], [3, 60], [0, 0]]) expect(underCarStored(heights, N, SIZE, c, r, 1, 2.3)).toBe(1);
});

it('is dark under a flat plate and open past the footprint edge', () => {
  const heights = new Float32Array(N * N).fill(SKY_HEIGHT_M), mpt = SIZE / N;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.abs((c + 0.5) * mpt - SIZE / 2) < 1.5 && Math.abs((r + 0.5) * mpt - SIZE / 2) < 1.5) heights[r * N + c] = 0.2;
  expect(underCarStored(heights, N, SIZE, 32, 32, 1.5, 1.5)).toBeCloseTo(0.05, 2);
  expect(underCarStored(heights, N, SIZE, 1, 32, 1.5, 1.5)).toBe(1);
  expect(underCarStored(heights, N, SIZE, 32, 1, 1.5, 1.5)).toBe(1);
});

it('keeps the shader in step with the reference constants', () => {
  expect(OCCLUSION_FRAGMENT).toContain('const int AZIMUTHS = 32'); expect(OCCLUSION_FRAGMENT).toContain('uHeights');
  expect(OCCLUSION_FRAGMENT).toContain('1.0 - stored'); expect(HEIGHT_VERTEX).toContain('uMinY');
});
