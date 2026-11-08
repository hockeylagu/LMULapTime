import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, BufferGeometry } from 'three';
import { prepareSceneryMesh } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';

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
