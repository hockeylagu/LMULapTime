import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, BufferGeometry } from 'three';
import { prepareSceneryMesh } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';

const mesh = (name: string) => Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial()), {name});

it('keeps coplanar track decals from casting onto asphalt while retaining received shadows', () => {
  const skidmarks = mesh('SURFACE_SKIDMARKS__M_HASH__DECAL__BLEND');
  prepareSceneryMesh(skidmarks);
  expect(skidmarks.castShadow).toBe(false);
  expect(skidmarks.receiveShadow).toBe(true);

  const road = mesh('SURFACE_ROADA_WET__M_HASH__OPAQUE');
  prepareSceneryMesh(road);
  expect(road.castShadow).toBe(false);
  expect(road.receiveShadow).toBe(true);

  const gantry = mesh('SURFACE_GANTRY__M_HASH__OPAQUE');
  prepareSceneryMesh(gantry);
  expect(gantry.castShadow).toBe(true);
});