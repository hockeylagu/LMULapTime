import { expect, it } from 'vitest';
import { Texture, Vector3 } from 'three';
import { CORE_DEFAULT_TEXTURE, coreSurface, drawsOnCore } from '../../../../../../src/components/replay/view3d/scenery/materials/coreSurface.js';
import { shaderParts } from '../../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceConfig, SurfaceMap } from '../../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

const map = (texture: string, uv: SurfaceMap['uv'] = 'uv0'): SurfaceMap => ({texture, uv, scale: [2, 2], srgb: false});
const surface = (maps: SurfaceConfig['maps'], flags: SurfaceConfig['flags'] = {}, kind: SurfaceConfig['kind'] = 'standard'): SurfaceConfig => ({
  kind, name: 'PART', flags, maps, normalYSign: -1, normalShadowInfluence: 0.5,
  parameters: {
    adjust: {tint: [1, 1, 1], normalStrength: 0.8, roughness: 0.4, metalness: 0.6, specular: 0.5},
    base: {albedo: [0.5, 0.5, 0.5, 1], albedoAlt: [1, 1, 1, 1], metalness: 0, roughness: 0.5, metalnessAlt: 0, roughnessAlt: 0.5},
    detail: {albedo: 0, ao: 1, aoBlend: 1, specular: 0.5, specularBlend: 1, roughness: 0.5, roughnessBlend: 1, metalness: 0, metalnessBlend: 0,
      normal: [0.5, 0.5], normalBlend: 1, normalAltBlend: 1, maskAlbedo: 1, maskMetalness: 1, maskRoughness: 1, maskNormal: 1},
    emissive: {colour: [0.5, 1, 1], strength: 3},
  },
} as unknown as SurfaceConfig);
const full = {albedo: map('a'), aoSpec: map('o', 'uv2'), metalRough: map('m'), normal: map('n')};
/** The program source of a core surface (its uniforms' values aside). */
const source = (config: SurfaceConfig) => {
  const {constants: _constants, ...code} = shaderParts(coreSurface(config, {}).config, {uniforms: true, core: true});
  return JSON.stringify(code);
};

it('draws a standard surface on the core maps without its own program code through the core', () => {
  expect(drawsOnCore(surface(full, {detailAlbedo: 'alphaBlend'}))).toBe(true);
  expect(drawsOnCore(surface({albedo: map('a')}, {emissive: 'night'}))).toBe(true);
  expect(drawsOnCore(surface({...full, alternate: map('x')}))).toBe(false);
  expect(drawsOnCore(surface({}))).toBe(false); // Map-less materials already share their program.
  expect(drawsOnCore(surface({albedo: map('a')}, {}, 'glass'))).toBe(false);
  expect(drawsOnCore(surface(full, {blendMask: 'vertexAlpha'}))).toBe(false);
  expect(drawsOnCore(surface(full, {normalBlend: 'overlay'}))).toBe(false);
  expect(drawsOnCore(surface({...full, normal: {...map('n'), uvAnimation: {mode: 'scroll', rate: [1, 0], step: [0, 0]}}}))).toBe(false);
  expect(drawsOnCore(surface({...full, emissive: map('e')}, {cockpitMode: 'emissiveAlpha'}))).toBe(false);
  expect(drawsOnCore(surface({albedo: map('a')}, {roughnessFromAlbedoAlpha: 'true'}))).toBe(false); // The filled metal/rough map would stop it.
});

it('fills a core surface to five maps on the default texture, its switches on its own maps only', () => {
  const albedo = new Texture(), core = coreSurface(surface({albedo: map('a')}, {detailAlbedo: 'alphaBlend'}), {albedo});
  expect(Object.keys(core.config.maps).sort()).toEqual(['albedo', 'aoSpec', 'detail', 'metalRough', 'normal']);
  expect(core.textures.albedo).toBe(albedo);
  expect(core.textures.normal).toBe(CORE_DEFAULT_TEXTURE);
  expect(core.switches.surface_hasMap.value).toEqual([1, 0, 0, 0, 0, 0]);
  expect(core.config.flags.detailAlbedo).toBeUndefined(); // Read only with a detail map.
  const glowing = coreSurface(surface({albedo: map('a'), emissive: map('e')}), {});
  expect(Object.keys(glowing.config.maps).sort()).toEqual(['albedo', 'aoSpec', 'emissive', 'metalRough', 'normal']);
});

it('shares one program across the core maps, emission and lamp modes', () => {
  const plain = source(surface({albedo: map('a')}));
  expect(source(surface(full, {detailAlbedo: 'alphaBlend'}))).toBe(plain);
  expect(source(surface({metalRough: map('m', 'uv1')}, {emissive: 'always', emissiveMask: 'rgb'}))).toBe(plain);
  expect(source(surface({normal: map('n')}, {emissive: 'night', cockpitMode: 'on'}))).toBe(plain);
  expect(source(surface({albedo: map('a'), emissive: map('e')}, {emissive: 'night', emissiveMask: 'rg'})))
    .toBe(source(surface({normal: map('n'), emissive: map('e')}, {emissive: 'always', emissiveMask: 'rgb'})));
});

it('carries the emission its own program bakes as uniforms', () => {
  const glow = coreSurface(surface({albedo: map('a')}, {emissive: 'night', emissiveMask: 'rg'}), {}).switches;
  expect(glow.surface_emissiveColour.value).toEqual(new Vector3(0.25, 1, 1));
  expect([glow.surface_emissiveStrength.value, glow.surface_emissiveMask.value, glow.surface_emissiveNight.value]).toEqual([3, 2, 1]);
  const dark = coreSurface(surface({albedo: map('a')}), {}).switches;
  expect([dark.surface_emissiveColour.value, dark.surface_emissiveStrength.value, dark.surface_emissiveMask.value, dark.surface_emissiveNight.value])
    .toEqual([new Vector3(), 0, 0, 0]);
});
