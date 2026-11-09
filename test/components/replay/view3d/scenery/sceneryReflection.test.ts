import { expect, it } from 'vitest';
import { CubeTexture, LinearFilter, RGFormat } from 'three';
import { integrationTexture, sceneryReflectionUniforms, setSceneryReflection } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

it("packs the split-sum table's scale and bias into a filtered two-channel texture, row 0 at roughness 0", () => {
  const texture = integrationTexture(testShading().integrationMap);
  expect([texture.image.width, texture.image.height, texture.format, texture.magFilter, texture.generateMipmaps]).toEqual([2, 2, RGFormat, LinearFilter, false]);
  expect(Array.from(texture.image.data as Uint8Array)).toEqual([10, 250, 200, 40, 20, 100, 150, 20]);
  texture.dispose();
});

it("points every scenery program at the venue's convolved cube with the package's level scale and F0, three's environment until then", () => {
  const shading = testShading(), integration = integrationTexture(shading.integrationMap), cube = new CubeTexture(), u = sceneryReflectionUniforms;
  setSceneryReflection(shading, null, integration);
  expect([u.surface_reflection.value, u.surface_reflectionReady.value, u.surface_integration.value]).toEqual([null, 0, integration]);
  setSceneryReflection(shading, cube, integration);
  expect([u.surface_reflection.value, u.surface_reflectionReady.value, u.surface_reflectionLodScale.value, u.surface_dielectricF0.value]).toEqual([cube, 1, 7, 0.08]);
  setSceneryReflection(shading, null, integration); integration.dispose();
});
