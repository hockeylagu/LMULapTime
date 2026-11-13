import { expect, it } from 'vitest';
import { ClampToEdgeWrapping, Data3DTexture, LinearFilter, RedFormat, Texture, UnsignedByteType, Vector3, type IUniform } from 'three';
import { cockpitVolumeTexture } from '../../../../../src/components/replay/view3d/car/cockpitOcclusion.js';
import { carMaterialKey, createCarMaterial } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const row = { sha256: 'cc', byteLength: 24, width: 2, height: 3, depth: 4 };
const box = { volume: 'volumes/cc.bin', size: [1, 0.8, 2] as [number, number, number], offset: [0, 0.5, -0.2] as [number, number, number] };
const appearance = { alias: 'a', albedo: 'paint', optionNodes: [] } as unknown as CarAppearance;
const standardSurface = {
  version: 4, kind: 'standard', name: 'DASH', flags: {}, normalYSign: -1, normalShadowInfluence: 0.5, finish: { roughness: 0.5, metalness: 0.5 },
  parameters: {
    adjust: { tint: [1, 1, 1], normalStrength: 0.8, roughness: 0.4, metalness: 0.6, specular: 0.5 },
    base: { albedo: [1, 1, 1, 1], albedoAlt: [1, 1, 1, 1], metalness: 0, roughness: 0.5, metalnessAlt: 0, roughnessAlt: 0.5 },
    detail: {
      albedo: 0, ao: 1, aoBlend: 1, specular: 0.5, specularBlend: 1, roughness: 0.5, roughnessBlend: 1, metalness: 0, metalnessBlend: 0,
      normal: [0.5, 0.5], normalBlend: 1, normalAltBlend: 1, maskAlbedo: 1, maskMetalness: 1, maskRoughness: 1, maskNormal: 1,
    },
    emissive: { colour: [1, 1, 1], strength: 0 },
  },
  maps: { albedo: { texture: 'textures/albedo', uv: 'uv0', scale: [1, 1], srgb: true } },
} as CarSurface;
const standard: CarMaterialRecipe = { id: 's', name: 'DASH', paint: false, surface: standardSurface, reflectionOcclusion: box };
const display: CarMaterialRecipe = {
  id: 'd', name: 'SCREEN', paint: false, reflectionOcclusion: box,
  surface: { version: 4, kind: 'display', normalShadowInfluence: 0, finish: { roughness: 0.2, metalness: 0 }, maps: { albedo: { texture: 'textures/screen', uv: 'uv0', scale: [1, 1] } } },
};
const volume = () => cockpitVolumeTexture(new ArrayBuffer(24), row);
const compile = (recipe: CarMaterialRecipe) => {
  const material = createCarMaterial(recipe, appearance, () => new Texture(), testShading(), volume);
  const shader = {
    uniforms: {} as Record<string, IUniform>,
    vertexShader: '#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>\n#include <project_vertex>\n#include <fog_pars_vertex>\n#include <fog_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <shadowmap_pars_fragment>\n#include <lights_physical_pars_fragment>\n#include <lights_fragment_begin>\n#include <lights_fragment_maps>\n#include <lights_fragment_end>\n#include <fog_pars_fragment>\n#include <fog_fragment>',
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return {material, shader};
};

it('reads a body volume as one linear, edge-clamped byte a voxel, and rejects one of another size', () => {
  const texture = volume();
  expect(texture).toBeInstanceOf(Data3DTexture);
  expect([texture.image.width, texture.image.height, texture.image.depth, texture.format, texture.type, texture.minFilter, texture.magFilter, texture.wrapR, texture.unpackAlignment, texture.generateMipmaps])
    .toEqual([2, 3, 4, RedFormat, UnsignedByteType, LinearFilter, LinearFilter, ClampToEdgeWrapping, 1, false]);
  expect(() => cockpitVolumeTexture(new ArrayBuffer(23), row)).toThrow('23 bytes for 2×3×4');
});

it('occludes the cube reflection of the surface program, marching from the vertex in the object space of the part', () => {
  const {material, shader} = compile(standard);
  expect((shader.uniforms.cockpit_size.value as Vector3).toArray()).toEqual([1, 0.8, 2]);
  expect((shader.uniforms.cockpit_offset.value as Vector3).toArray()).toEqual([0, 0.5, -0.2]);
  expect(shader.uniforms.cockpit_volume.value).toBeInstanceOf(Data3DTexture);
  // The batched car draws each part through its batching matrix: the eye is taken into the part's own frame.
  expect(shader.vertexShader).toContain('modelMatrix * batchingMatrix');
  expect(shader.fragmentShader).toContain('surfaceReflectionOcclusion=cockpitOcclusion(surfaceReflectionRoughness);');
  expect(shader.fragmentShader.indexOf('float cockpitOcclusion')).toBeLessThan(shader.fragmentShader.indexOf('light *= cockpitReflectionScale'));
  expect(material.customProgramCacheKey()).toContain('cockpitOcclusion');
});

it('occludes the prefiltered environment of a material on the standard program of three', () => {
  const {shader} = compile(display);
  expect(shader.fragmentShader).toMatch(/radiance \*= cockpitReflectionScale\(.*cockpitOcclusion\(material\.roughness\)\)/);
});

it('rejects an occluded material without its volume, and keys it apart from the same material without one', () => {
  expect(() => createCarMaterial(standard, appearance, () => new Texture(), testShading())).toThrow('no cabin volume');
  expect(carMaterialKey(standard, appearance)).not.toBe(carMaterialKey({ ...standard, reflectionOcclusion: undefined }, appearance));
});

it('frees its own copy of the volume with the material', () => {
  const copy = volume();
  let disposed = false; copy.addEventListener('dispose', () => { disposed = true; });
  createCarMaterial(standard, appearance, () => new Texture(), testShading(), () => copy).dispose();
  expect(disposed).toBe(true);
});
