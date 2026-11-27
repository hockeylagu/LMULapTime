import { expect, it } from 'vitest';
import { FrontSide, MeshBasicMaterial, NoColorSpace, SRGBColorSpace, Texture, Vector2, type Color } from 'three';
import { carMaterialKey, carPartOrder, carSortOffset, createCarMaterial, lampSortOffset, materialTexturePaths } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import { composedGhost, composedParts, composedTextures } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { isPlainSurface } from '../../../../../src/components/replay/view3d/shaders/plainSurface.js';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { sceneryReflectionUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const appearance = { alias: 'a', albedo: 'paint', optionNodes: [] } as unknown as CarAppearance;
const recipe = (scale?: [number, number]): CarMaterialRecipe => ({
  id: 'm', name: 'GRID', paint: false,
  surface: { version: 4, kind: 'diffuse', normalShadowInfluence: 1, finish: { roughness: 0.5, metalness: 0 }, maps: { albedo: { texture: 'a', uv: 'uv0', scale: scale as [number, number] } } },
});
const build = (scale?: [number, number]) => createCarMaterial(recipe(scale), appearance, () => new Texture(), testShading()).uniforms.map.value as Texture;

const standardSurface: CarSurface = {
  version: 4, kind: 'standard', name: 'CARBON', flags: {}, normalYSign: -1, normalShadowInfluence: 0.5, finish: { roughness: 0.5, metalness: 0.5 },
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

it('loads every map of a standard material, with the livery albedo in place of its own', () => {
  expect(materialTexturePaths(standard, appearance)).toEqual(['textures/albedo', 'textures/mr', 'textures/ao', 'textures/normal']);
  const livery = { ...appearance, materialTextures: { CARBON: 'textures/livery' } } as CarAppearance;
  expect(materialTexturePaths(standard, livery)[0]).toBe('textures/livery');
});

it('draws a rear-view mirror as dark glass: no maps, no reflection', () => {
  const mirror: CarMaterialRecipe = { ...standard, name: 'MIRROR', surface: { ...standardSurface, rearView: true } };
  expect(materialTexturePaths(mirror, appearance)).toEqual([]);
  const material = createCarMaterial(mirror, appearance, () => { throw Error('no maps'); }, testShading());
  expect(isPlainSurface(material)).toBe(true);
  const u = material.uniforms;
  expect([material.name, (u.plain_colour.value as Color).getHex(), u.plain_roughness.value, u.plain_metalness.value, u.plain_environment.value]).toEqual(['MIRROR', 0, 1, 0, 0]);
  expect(composedTextures(material)).toEqual([]);
});

it('draws a standard material with its metal/roughness, AO/specular and normal maps at their own scales', () => {
  const material = createCarMaterial(standard, appearance, () => new Texture(), testShading()), u = material.uniforms;
  expect(Object.keys(u)).toEqual(expect.arrayContaining(['surface_albedo', 'surface_metalRough', 'surface_aoSpec', 'surface_normal']));
  expect((u.surface_scale_metalRough.value as Vector2).toArray()).toEqual([2, 2]);
  expect((u.surface_albedo.value as Texture).colorSpace).toBe(SRGBColorSpace);
  expect((u.surface_normal.value as Texture).colorSpace).toBe(NoColorSpace);
  expect(material.fragmentShader).toContain('surface_metalRough');
  expect(composedTextures(material)).toEqual(expect.arrayContaining(['albedo', 'metalRough', 'aoSpec', 'normal'].map(key => u[`surface_${key}`].value as Texture)));
  // The reflection uniforms are the car's own, not the scenery's shared ones.
  expect(u.surface_reflection).not.toBe(sceneryReflectionUniforms.surface_reflection);
  expect([u.roughness.value, u.metalness.value]).toEqual([0.4, 0.6]);
  // A ghost starts from roughness 0.7 and no metal.
  composedGhost(material);
  expect([u.roughness.value, u.metalness.value]).toEqual([0.7, 0]);
});

it('draws car glass with the scenery glass program on the physical model, its reflection kept whole through its opacity', () => {
  const glass: CarMaterialRecipe = { id: 'g', name: 'GLASS', paint: false, surface: {
    version: 4, kind: 'glass', flags: {}, normalYSign: -1, normalShadowInfluence: 0.5, finish: { roughness: 0.05, metalness: 0 }, renderState: { alphaBlend: true },
    parameters: { adjust: { tint: [1, 1, 1], normalStrength: 1, roughness: 0.5, metalness: 0, specular: 0.5 } },
    maps: { albedo: { texture: 'textures/glass', uv: 'uv0', scale: [1, 1], srgb: true } },
  } };
  const material = createCarMaterial(glass, appearance, () => new Texture(), testShading());
  expect(material.transparent).toBe(true); expect(material.depthWrite).toBe(false); expect(material.forceSinglePass).toBe(false);
  expect(material.defines).toMatchObject({ IOR: '', USE_SPECULAR: '' });
  expect(material.uniforms.ior.value).toBe(1.5);
  expect(material.fragmentShader).toContain('totalSpecular/clamp(diffuseColor.a+0.001,0.001,1.0)');
});

it('draws tyres, screens and windscreens with the surface program: a screen layer as its game blend, the inside of a windscreen blended, its outside as glass', () => {
  const adjust = { tint: [1, 1, 1], normalStrength: 1, roughness: 0.5, metalness: 0, specular: 0.5 };
  const of = (kind: string, parameters: Record<string, unknown> = {}, alphaBlend?: boolean): CarMaterialRecipe => ({ id: kind, name: kind.toUpperCase(), paint: false, surface: {
    version: 4, kind, flags: {}, normalYSign: -1, normalShadowInfluence: 0.5, finish: { roughness: 0.5, metalness: 0 },
    parameters: { adjust, ...parameters }, maps: { albedo: { texture: `textures/${kind}`, uv: 'uv0', scale: [1, 1], srgb: true } },
    ...(alphaBlend === undefined ? {} : { renderState: { alphaBlend, alphaMask: false } }),
  } });
  const screen = { dashboard: { roughness: 0.2, emissiveStrength: 15, emissiveNight: 1.5 } };
  // A screen's backing layer is opaque (its alpha unused) and its readout layer blends over it, as the game draws them.
  const built = [of('tyre', { wear: { albedoMultiply: 0.6, roughnessAdjust: 0.3 } }), of('dashboard', screen, false), of('dashboard', screen, true),
    of('externalMonitor', screen, true), of('windscreen', { windscreen: {} }), of('windscreenInside')]
    .map(recipe => createCarMaterial(recipe, appearance, () => new Texture(), testShading()));
  // The surface program's family, on its own albedo map. The windscreen is on the standard model: three's physical model at index 1.5,
  // specular level 1 and white, as three drew it, is the same light.
  expect(built.map(material => composedParts(material)?.find(part => part.name === 'surface')?.ownTextures)).toEqual(Array(6).fill(['surface_albedo']));
  expect(built.map(material => [material.transparent, material.depthWrite, 'IOR' in material.defines])).toEqual([
    [false, true, false], [false, true, false], [true, false, false], [true, false, false], [true, false, false], [true, false, false],
  ]);
});
it("orders blended parts by the game's sortOffset (the outside windscreen over the lamp glows), opaque parts first", () => {
  const blended = (sortOffset?: number) => createCarMaterial({ ...recipe(), surface: { ...recipe().surface, renderState: { alphaBlend: true }, ...(sortOffset === undefined ? {} : { sortOffset }) } as CarSurface }, appearance, () => new Texture(), testShading());
  const opaque = createCarMaterial({ ...recipe(), surface: { ...recipe().surface, sortOffset: 6 } as CarSurface }, appearance, () => new Texture(), testShading());
  expect(carSortOffset({ ...recipe(), surface: { ...recipe().surface, sortOffset: 5 } as CarSurface })).toBe(5);
  expect(carSortOffset(undefined)).toBe(0);
  expect(carPartOrder([blended(5)])).toBe(5);
  expect(carPartOrder([blended(), blended(2)])).toBe(2);
  expect(carPartOrder([blended()])).toBe(0);
  expect(carPartOrder([opaque])).toBe(0);
});

it('draws a blended lamp glow just before the glass of its own order, and after every lower order', () => {
  const lamp = Object.assign(new MeshBasicMaterial({ transparent: true }), { userData: { sortOffset: lampSortOffset(undefined) } });
  expect(lampSortOffset({ ...recipe(), surface: { ...recipe().surface, sortOffset: 2 } as CarSurface })).toBe(1.5);
  expect(carPartOrder([lamp])).toBe(-0.5);
});

it('draws an alpha-masked part one side, as every car part, its edges by alpha to coverage', () => {
  const masked: CarMaterialRecipe = { ...recipe(), surface: { ...recipe().surface, renderState: { alphaMask: true } } as CarSurface };
  const material = createCarMaterial(masked, appearance, () => new Texture(), testShading());
  expect(material.side).toBe(FrontSide); expect(material.alphaToCoverage).toBe(true); expect(material.alphaTest).toBe(0.5);
});

it('rejects a standard material without its surface description', () => {
  const bare: CarMaterialRecipe = { ...standard, surface: { ...standardSurface, flags: undefined } };
  expect(() => createCarMaterial(bare, appearance, () => new Texture(), testShading())).toThrow('has no surface description');
});

it('gives repeated materials of a car file one key, and tells apart a livery-textured or paint one', () => {
  const twin: CarMaterialRecipe = { ...standard, id: 's2', name: 'CARBON_REAR' };
  expect(carMaterialKey(twin, appearance)).toBe(carMaterialKey(standard, appearance));
  const livery = { ...appearance, materialTextures: { CARBON_REAR: 'textures/livery' } } as unknown as CarAppearance;
  expect(carMaterialKey(twin, livery)).not.toBe(carMaterialKey(standard, livery));
  const paint: CarMaterialRecipe = { id: 'p', name: 'BODY', paint: true };
  const otherPaint: CarAppearance = { ...appearance, albedo: 'other' };
  expect(carMaterialKey(paint, appearance)).not.toBe(carMaterialKey(paint, otherPaint));
});
