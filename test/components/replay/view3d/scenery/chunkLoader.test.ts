import { expect, it } from 'vitest';
import { BufferAttribute, Group, Mesh, MeshBasicMaterial, BufferGeometry } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { TRACK_LIGHT_ATTRIBUTE } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import { prepareSceneryMesh, skipSurfaceTextures } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';

/** A scenery primitive's geometry: every one carries its track light sum. */
const geometry = () => new BufferGeometry().setAttribute(TRACK_LIGHT_ATTRIBUTE, new BufferAttribute(new Uint8Array(4), 4, true));
const mesh = (name: string, extras: Record<string, unknown>) => Object.assign(new Mesh(geometry(), new MeshBasicMaterial()), {name, userData: extras});

it('refuses a primitive without its track light sum, naming it: the surface programs would decode NaN', () => {
  expect(() => prepareSceneryMesh(Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial()), {name: 'BARRIER_12'})))
    .toThrow(`Scenery mesh BARRIER_12 has no ${TRACK_LIGHT_ATTRIBUTE} attribute`);
});

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

  // The filler ground under the road receives no shadow: one there would show through the road.
  const filler = mesh('FILLER_GROUND_7', {});
  prepareSceneryMesh(filler);
  expect(filler.receiveShadow).toBe(false);
});

it("keeps the GLB material's package key on the mesh", () => {
  const floor = new Mesh(geometry(), Object.assign(new MeshBasicMaterial(), {userData: {lmuMaterial: '00b9c0040da09bea'}}));
  prepareSceneryMesh(floor);
  expect(floor.userData.lmuMaterial).toBe('00b9c0040da09bea');
});

it('hides the virtual screen framebuffer', () => {
  const screen = mesh('SURFACE_SCREENFRAMEBUFFER__M_HASH__OPAQUE', {lmuCastShadow: false});
  prepareSceneryMesh(screen);
  expect(screen.visible).toBe(false);
});

it('leaves every switched state visible for the warm-up: the night switch shows the current one afterwards', () => {
  const states = ['day', 'night', 'lightsOn'].map(lmuVisibility => mesh('FERRISWHEEL', {lmuVisibility}));
  // A node of several primitives carries the flag on its group.
  const card = mesh('NIGHTLIGHT001GLOW', {});
  new Group().add(card).userData.lmuVisibility = 'lightsOn';
  [...states, card].forEach(prepareSceneryMesh);
  expect([...states, card].map(part => part.visible)).toEqual([true, true, true, true]);
});

it('skips the glTF texture slots of materials with a surface description, and keeps them on the others', async () => {
  const surface = {extras: {lmuSurface: {}}, pbrMetallicRoughness: {baseColorTexture: {index: 0}, baseColorFactor: [1, 1, 1, 1]}, emissiveTexture: {index: 1}, normalTexture: {index: 2}};
  const plain = {pbrMetallicRoughness: {baseColorTexture: {index: 3}}, emissiveTexture: {index: 4}};
  await skipSurfaceTextures({json: {materials: [surface, plain]}} as unknown as GLTFParser).beforeRoot?.();
  expect(surface).toEqual({extras: {lmuSurface: {}}, pbrMetallicRoughness: {baseColorFactor: [1, 1, 1, 1]}});
  expect(plain).toEqual({pbrMetallicRoughness: {baseColorTexture: {index: 3}}, emissiveTexture: {index: 4}});
});
