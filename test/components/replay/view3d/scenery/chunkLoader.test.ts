import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, BufferGeometry } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { prepareSceneryMesh, skipSurfaceTextures } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';

const mesh = (name: string, extras: Record<string, unknown>) => Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial()), {name, userData: extras});

it("casts shadow only where the package's node flag says so; every mesh receives", () => {
  const gantry = mesh('SURFACE_GANTRY__M_HASH__OPAQUE__CAST', {lmuCastShadow: true});
  prepareSceneryMesh(gantry);
  expect(gantry.castShadow).toBe(true);
  expect(gantry.receiveShadow).toBe(true);

  const road = mesh('SURFACE_ROADA_WET__M_HASH__OPAQUE', {lmuCastShadow: false});
  prepareSceneryMesh(road);
  expect(road.castShadow).toBe(false);
  expect(road.receiveShadow).toBe(true);

  // A node without the flag (the horizon's coarse ground) does not cast.
  const ground = mesh('coarse-ground', {});
  prepareSceneryMesh(ground);
  expect(ground.castShadow).toBe(false);
});

it('hides the virtual screen framebuffer', () => {
  const screen = mesh('SURFACE_SCREENFRAMEBUFFER__M_HASH__OPAQUE', {lmuCastShadow: false});
  prepareSceneryMesh(screen);
  expect(screen.visible).toBe(false);
});

it('skips the glTF texture slots of materials with a surface description, and keeps them on the others', async () => {
  const surface = {extras: {lmuSurface: {}}, pbrMetallicRoughness: {baseColorTexture: {index: 0}, baseColorFactor: [1, 1, 1, 1]}, emissiveTexture: {index: 1}, normalTexture: {index: 2}};
  const plain = {pbrMetallicRoughness: {baseColorTexture: {index: 3}}, emissiveTexture: {index: 4}};
  await skipSurfaceTextures({json: {materials: [surface, plain]}} as unknown as GLTFParser).beforeRoot?.();
  expect(surface).toEqual({extras: {lmuSurface: {}}, pbrMetallicRoughness: {baseColorFactor: [1, 1, 1, 1]}});
  expect(plain).toEqual({pbrMetallicRoughness: {baseColorTexture: {index: 3}}, emissiveTexture: {index: 4}});
});
