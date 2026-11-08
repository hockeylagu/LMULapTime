import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Scene, Vector3, WebGLCoordinateSystem, type WebGLRenderer } from 'three';
const pmrem = vi.hoisted(() => ({conversions: 0}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  const prefiltered = {texture: new actual.Texture(), dispose() {}};
  return {...actual, PMREMGenerator: class {
    compileCubemapShader() {}
    fromCubemap(_cube: unknown, reuse: unknown) { pmrem.conversions++; return reuse ?? prefiltered; }
    dispose() {}
  }};
});
import { createCarReflection } from '../../../../../src/components/replay/view3d/car/carReflection.js';

function stubRenderer() {
  const faces: Array<{face: number; carShown: boolean; shadowUpdate: boolean}> = [];
  let target: unknown = null, face = 0;
  const renderer = {
    coordinateSystem: WebGLCoordinateSystem, shadowMap: {autoUpdate: true},
    getRenderTarget: () => target,
    setRenderTarget(next: unknown, activeFace = 0) { target = next; face = activeFace; },
    render() { faces.push({face, carShown: cars.visible, shadowUpdate: renderer.shadowMap.autoUpdate}); },
  };
  const cars = new Group();
  return {renderer: renderer as unknown as WebGLRenderer, faces, cars, target: () => target};
}

it('renders the probe a face a frame without the cars, then gives the car its reflection', () => {
  const {renderer, faces, cars, target} = stubRenderer();
  const paint = new MeshPhysicalMaterial(), unlit = new MeshBasicMaterial({envMap: null});
  const car = new Group().add(new Mesh(new BoxGeometry(), [paint, unlit]));
  cars.add(car);
  const reflection = createCarReflection(renderer, new Scene()), centre = new Vector3(10, 0.5, 20);
  reflection.setCar(car, cars);
  for (let i = 0; i < 6; i++) expect(reflection.update(centre)).toBe(true);
  expect(faces).toEqual([0, 1, 2, 3, 4, 5].map(face => ({face, carShown: false, shadowUpdate: false})));
  expect(cars.visible).toBe(true); expect(renderer.shadowMap.autoUpdate).toBe(true); expect(target()).toBeNull();
  // Only after the sixth face: an incomplete cube would reflect black.
  expect(pmrem.conversions).toBe(1); expect(paint.envMap).not.toBeNull(); expect(unlit.envMap).toBeNull();

  // A paused car keeps its probe; moving the car or new scenery starts another.
  expect(reflection.update(centre)).toBe(false);
  reflection.stale(); expect(reflection.update(centre)).toBe(true);
  for (let i = 0; i < 5; i++) reflection.update(centre);
  expect(reflection.update(centre)).toBe(false);
  expect(reflection.update(new Vector3(11, 0.5, 20))).toBe(true);
  expect(faces).toHaveLength(13); expect(pmrem.conversions).toBe(2);

  reflection.dispose();
  expect(paint.envMap).toBeNull();
});
