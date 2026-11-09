import { expect, it } from 'vitest';
import { NoColorSpace, SRGBColorSpace, Texture, Vector2, type IUniform } from 'three';
import { createCarMaterial, materialTexturePaths } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { sceneryReflectionUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const appearance = { alias: 'a', albedo: 'paint', optionNodes: [] } as unknown as CarAppearance;
const recipe = (scale?: [number, number]): CarMaterialRecipe => ({
  id: 'm', name: 'GRID', paint: false,
  surface: { version: 4, kind: 'diffuse', finish: { roughness: 0.5, metalness: 0 }, maps: { albedo: { texture: 'a', uv: 'uv0', scale: scale as [number, number] } } },
});
const build = (scale?: [number, number]) => createCarMaterial(recipe(scale), appearance, () => new Texture(), testShading()).map!;

const standardSurface: CarSurface = {
  version: 4, kind: 'standard', name: 'CARBON', flags: {}, normalYSign: -1, finish: { roughness: 0.5, metalness: 0.5 },
  parameters: {
    adjust: { tint: [1, 1, 1], normalStrength: 0.8, roughness: 0.4, metalness: 0.6, specular: 0.5 },
    base: { albedo: [1, 1, 1, 1], albedoAlt: [1, 1, 1, 1], metalness: 0, roughness: 0.5, metalnessAlt: 0, roughnessAlt: 0.5 },
    detail: {
      albedo: 0, ao: 1, aoBlend: 1, specular: 0.5, specularBlend: 1, roughness: 0.5, roughnessBlend: 1, metalness: 0, metalnessBlend: 0,
      normal: [0.5, 0.5], normalBlend: 1, normalAltBlend: 1, maskAlbedo: 1, maskMetalness: 1, maskRoughness: 1, maskNormal: 1,
    },
    emissive: { colour: [1, 1, 1], strength: 0 },
  },
  maps: {
    albedo: { texture: 'textures/albedo', uv: 'uv0', scale: [50, 50], srgb: true },
    metalRough: { texture: 'textures/mr', uv: 'uv0', scale: [2, 2], srgb: false },
    aoSpec: { texture: 'textures/ao', uv: 'uv2', scale: [1, 1], srgb: false },
    normal: { texture: 'textures/normal', uv: 'uv0', scale: [50, 50], srgb: false },
  },
};
const standard: CarMaterialRecipe = { id: 's', name: 'CARBON', paint: false, surface: standardSurface };

it('tiles the albedo map by its descriptor scale', () => {
  const map = build([14, 6]);
  expect(map.repeat.toArray()).toEqual([14, 6]);
});

it('keeps an unscaled, zero or missing scale at one repeat', () => {
  expect(build([1, 1]).repeat.toArray()).toEqual([1, 1]);
  expect(build([0, 0]).repeat.toArray()).toEqual([1, 1]);
  expect(build().repeat.toArray()).toEqual([1, 1]);
});

it('does not change the shared source texture', () => {
  const source = new Texture();
  createCarMaterial(recipe([50, 50]), appearance, () => source, testShading());
  expect(source.repeat.toArray()).toEqual([1, 1]);
});

it('loads every map of a standard material, with the livery albedo in place of its own', () => {
  expect(materialTexturePaths(standard, appearance)).toEqual(['textures/albedo', 'textures/mr', 'textures/ao', 'textures/normal']);
  const livery = { ...appearance, materialTextures: { CARBON: 'textures/livery' } } as CarAppearance;
  expect(materialTexturePaths(standard, livery)[0]).toBe('textures/livery');
});

it('draws a standard material with its metal/roughness, AO/specular and normal maps at their own scales', () => {
  const material = createCarMaterial(standard, appearance, () => new Texture(), testShading());
  const shader = { uniforms: {} as Record<string, IUniform>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>' };
  material.onBeforeCompile(shader as never, undefined as never);
  expect(Object.keys(shader.uniforms)).toEqual(expect.arrayContaining(['surface_albedo', 'surface_metalRough', 'surface_aoSpec', 'surface_normal']));
  expect((shader.uniforms.surface_scale_metalRough.value as Vector2).toArray()).toEqual([2, 2]);
  expect((shader.uniforms.surface_albedo.value as Texture).colorSpace).toBe(SRGBColorSpace);
  expect((shader.uniforms.surface_normal.value as Texture).colorSpace).toBe(NoColorSpace);
  expect(shader.fragmentShader).toContain('surface_metalRough');
  // The reflection uniforms are the car's own, not the scenery's shared ones.
  expect(shader.uniforms.surface_reflection).not.toBe(sceneryReflectionUniforms.surface_reflection);
  expect(material.roughness).toBe(0.4);
  expect(material.metalness).toBe(0.6);
});

it('rejects a standard material without its surface description', () => {
  const bare: CarMaterialRecipe = { ...standard, surface: { ...standardSurface, flags: undefined } };
  expect(() => createCarMaterial(bare, appearance, () => new Texture(), testShading())).toThrow('has no surface description');
});
