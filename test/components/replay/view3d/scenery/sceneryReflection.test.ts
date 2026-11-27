import { expect, it } from 'vitest';
import { CubeTexture, LinearFilter, RGFormat } from 'three';
import { integrationTexture, reflectionPart, SCENERY_REFLECTION_INPUTS, sceneryReflectionPart, sceneryReflectionUniforms, setSceneryReflection } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { sceneValue } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
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
  expect([u.surface_reflection.value, u.surface_reflectionReady.value]).toEqual([cube, 1]);
  // The package's scalars in the scene block, which the function reads without declaring them.
  expect([sceneValue('surface_reflectionLodScale'), sceneValue('surface_dielectricF0')]).toEqual([7, Math.fround(0.08)]);
  expect(sceneryReflectionPart.slots.fragmentPars?.glsl).toContain('uniform float surface_reflectionReady;');
  expect(sceneryReflectionPart.slots.fragmentPars?.glsl).not.toMatch(/uniform float[^;]*surface_dielectricF0/);
  setSceneryReflection(shading, null, integration); integration.dispose();
});

it("gives a composed program the reflection: its inputs set on the material, its own call in place of three's", () => {
  const {slots} = sceneryReflectionPart;
  expect(slots.fragmentMaterial?.glsl).toBe(SCENERY_REFLECTION_INPUTS);
  expect(slots.fragmentIndirectSpecular?.glsl.trim()).toMatch(/^surfaceIndirectSpecular\( radiance, iblIrradiance, clearcoatRadiance,/);
  expect(slots.fragmentPars?.glsl).not.toContain('#define RE_');
  expect(sceneryReflectionPart.uniforms?.().surface_reflection).toBe(sceneryReflectionUniforms.surface_reflection);
});

it('gives a car the same function on uniforms of its own, with its declarations and a correction once the cube is read', () => {
  const own = {...sceneryReflectionUniforms, surface_reflection: {value: null}}, part = reflectionPart('carReflection', own, {declarations: 'uniform float CAR;', afterRead: 'light *= CAR;'});
  expect(part.name).toBe('carReflection'); expect(part.uniforms?.()).toBe(own);
  const glsl = part.slots.fragmentPars?.glsl ?? '';
  expect(glsl).toContain('uniform float CAR;');
  expect(glsl.indexOf('uniform float CAR;')).toBeLessThan(glsl.indexOf('light *= CAR;'));
  expect(glsl.replace('uniform float CAR;', '').replace('light *= CAR;', '').replace(/\s+/g, ' ')).toBe((sceneryReflectionPart.slots.fragmentPars?.glsl ?? '').replace(/\s+/g, ' '));
  expect(part.slots.fragmentIndirectSpecular).toEqual(sceneryReflectionPart.slots.fragmentIndirectSpecular);
});