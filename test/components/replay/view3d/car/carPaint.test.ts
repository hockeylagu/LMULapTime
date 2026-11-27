import { expect, it } from 'vitest';
import { CubeTexture, MeshPhysicalMaterial, NoColorSpace, Object3D, SRGBColorSpace, Texture, WebGLCubeRenderTarget, type ShaderMaterial, type Vector3, type Vector4 } from 'three';
import { isCarPaint, placePaintBox, setPaintBox, setPaintReflection } from '../../../../../src/components/replay/view3d/car/carPaint.js';
import { createCarMaterial, materialTexturePaths } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import { composedTextures } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { SCENE_BLOCK, sceneBlock } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import type { CarAppearance, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const region = (over: Record<string, unknown> = {}) => ({
  baseCoatRoughness: 0.3, baseCoatSpecStrength: 0.5, baseCoatRefractiveIndex: 2.25, clearCoatSpecStrength: 1, clearCoatRoughness: 0,
  clearCoatRefractiveIndex: 1.44, lacquerColour: [1, 1, 1, 1], metallicPaintStrength: 0.8, metallicFlakeStrength: 0, carbonFibreStrength: 0.6,
  orangePeelStrength: 1, ...over,
});
const map = (texture: string, srgb?: boolean) => ({texture, uv: 'uv0' as const, scale: [1, 1] as [number, number], srgb});
const paint = (maps: CarSurface['maps']): CarSurface => ({
  version: 4, kind: 'carPaint', normalShadowInfluence: 0.5, maps,
  parameters: {regions: {black: region(), red: region(), green: region({clearCoatSpecStrength: 0}), blue: region(), white: region()},
    clearCoatStrength: 0.5, lacquerThickness: 0.3, carbonFibreAlbedoColour: [0.43, 0.43, 0.43, 0], metallicFlakeColour: [1, 1, 1],
    uvScale: {carbonFibre: [125, 125], metallicFlakes: [1, 1], orangePeel: [1, 1]}},
});

const appearance = (surface: CarSurface): CarAppearance => ({alias: 'x', albedo: 'a', paint: surface, optionNodes: []}) as unknown as CarAppearance;
/** A car paint material as a car draws it (carMaterials.ts), its map copies by path. */
function paintMaterial(surface: CarSurface, texture: (path: string) => Texture = () => new Texture()): ShaderMaterial {
  return createCarMaterial({id: 'p', name: 'BODY', paint: true}, appearance(surface), texture, testShading());
}

it("builds regional layered car paint on three's physical model", () => {
  const textures: string[] = [];
  const material = paintMaterial(paint({albedo: map('a', true), region: map('r', true), aoSpec: map('s', true), carbon: map('c', false)}), path => { textures.push(path); return new Texture(); });
  expect(textures).toEqual(['a', 'r', 's', 'c']);
  const shader = material, uniforms = shader.uniforms;
  expect(material.defines).toEqual({USE_ENVMAP: '', ENVMAP_TYPE_PMREM: '', USE_CLEARCOAT: ''});
  // Each map decoded by its colour role: the region and AO/spec masks are colour stages, read through sRGB.
  expect([uniforms.paint_region, uniforms.paint_aoSpec, uniforms.paint_carbon].map(uniform => (uniform.value as Texture).colorSpace)).toEqual([SRGBColorSpace, SRGBColorSpace, NoColorSpace]);
  // The paint maps are the material's own textures, warmed with it.
  expect(composedTextures(material)).toEqual(expect.arrayContaining([uniforms.map.value, uniforms.paint_region.value, uniforms.paint_aoSpec.value, uniforms.paint_carbon.value]));
  // The coat output carries the lacquer absorption, and the livery and both paint maps are sampled, each fading in as it sharpens
  // (textureFocus.ts).
  expect(shader.fragmentShader).not.toContain('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )');
  for (const marker of ['focusTexture(map, focus_map, vCarMapUv)', 'focusTexture(paint_region, focus_paint_region, vCarMapUv)', 'focusTexture(paint_aoSpec, focus_paint_aoSpec, vCarMapUv)',
    'roughnessFactor = clamp(paintBaseRoughness', 'reflectedLight.indirectDiffuse *= paintAO',
    // The coats' rising rays are tested against the scenery over the car, its tops and undersides (car/overheadMap.ts), read
    // compared and filtered.
    'uniform sampler2DShadow overhead_top, overhead_below', 'vec4 fix = overheadFix(r);']) {
    expect(shader.fragmentShader).toContain(marker);
  }
  expect(shader.fragmentShader).toContain('material.clearcoatF0 = vec3(paintCoatF0)');
  // The paint's diffuse takes the composed sun, not three's light loop.
  expect(shader.fragmentShader).toContain('lit_sunDirection'); expect(shader.fragmentShader).not.toContain('directionalLights[');
  // Each coat reads the car's own cubes by the package's rule (bias for the clear coat, explicit for the base coat in the fixture).
  expect(shader.fragmentShader).toContain('clearcoatRadiance = paintReflection( geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, false, paintCoatCos );');
  expect(shader.fragmentShader).toContain('radiance = paintReflection( geometryViewDir, geometryNormal, paintBaseRoughness, true, paintBaseCos );');
  // Both coats read the cube box-projected, their Fresnel at the half vector of the view and the direction read.
  expect(shader.fragmentShader).toContain('vec3 r = paintBoxRead(');
  expect(shader.fragmentShader).toContain('float dotNVcc = paintCoatCos < 0.0 ?');
  expect(shader.fragmentShader).toContain('pow(1.0 - (paintBaseCos < 0.0 ?');
  expect(shader.fragmentShader).not.toContain('getIBLRadiance( geometryViewDir, geometryClearcoatNormal');
  expect(uniforms.paint_lodScale.value).toBe(6); expect(uniforms.paint_probe.value).toBe(0);
  const cubes = {sharp: new Texture(), convolved: new CubeTexture(), levels: 8, target: new WebGLCubeRenderTarget(4), dispose() {}};
  expect(isCarPaint(material)).toBe(true);
  expect(setPaintReflection(material, cubes)).toBe(true);
  expect(uniforms.paint_sharp.value).toBe(cubes.sharp); expect(uniforms.paint_convolved.value).toBe(cubes.convolved);
  expect(uniforms.paint_levels.value).toBe(8); expect(uniforms.paint_probe.value).toBe(1);
  expect(setPaintReflection(material, null)).toBe(true); expect(uniforms.paint_probe.value).toBe(0); expect(uniforms.paint_sharp.value).toBeNull();
  expect(setPaintReflection(new MeshPhysicalMaterial(), cubes)).toBe(false);
  // The sun glint joins both coats' direct specular right after the sun's, from the package's shading values.
  expect(shader.fragmentShader).toContain('clearcoatSpecularDirect = paintGlint(clearcoatSpecularDirect, directLight');
  expect(shader.fragmentShader).toContain('reflectedLight.directSpecular = paintGlint(reflectedLight.directSpecular, directLight');
  expect((uniforms.paint_glint.value as Vector3).toArray()).toEqual([0.999, 0.2, 0.4]);
  expect((uniforms.paint_edge.value as Vector4).toArray()).toEqual([5, 4, 0.5, 100]);
  expect(uniforms.paint_coatCutoff.value).toBe(0.2);
  expect(shader.fragmentShader).not.toContain('geometryClearcoatNormal, material.clearcoatRoughness )');
  expect(shader.fragmentShader).toContain('pow(paintLacquer');
  // The metallic layer replaces a share of the base layer with a flake-tinted reflection: never three's albedo-tinted metalness.
  expect(shader.fragmentShader).toContain('metalnessFactor = 0.0;');
  expect(shader.fragmentShader).toContain('* paintFlake, paintMetallic)');
  expect((uniforms.paint_flakeColour.value as Vector3).toArray()).toEqual([1, 1, 1]);
  // Indices are blended as square roots; metallic comes from the black region only, carbon from the red region only.
  const base = uniforms.paint_base.value as Vector4[], coat = uniforms.paint_coat.value as Vector4[];
  expect(base[0].y).toBeCloseTo(1.5); expect(base[0].z).toBe(0); expect(base[1].z).toBe(0);
  expect(base[1].w).toBeCloseTo(0.6); expect(base[0].w).toBe(0);
  expect(coat[2].x).toBe(0); expect(coat[0].z).toBeCloseTo(1.2);
  expect(uniforms.paint_coatStrength.value).toBe(0.5);
  // Paints with the same maps share one program; the values are uniforms.
  const other = paint({albedo: map('a', true), region: map('r', true), aoSpec: map('s', true), carbon: map('c', false)});
  (other.parameters!.regions as Record<string, Record<string, unknown>>).black.baseCoatRoughness = 0.9;
  expect(paintMaterial(other).customProgramCacheKey()).toBe(material.customProgramCacheKey());
});
it("places the reflected car's box in the scene block: its corners under the car's frame as the frame now stands, none without a car", () => {
  const frame = new Object3D(), block = (name: keyof typeof SCENE_BLOCK.offsets, count: number) => [...sceneBlock.subarray(SCENE_BLOCK.offsets[name], SCENE_BLOCK.offsets[name] + count)];
  // A box 4 m long, 2 m wide and 1.2 m tall in the car frame, the car turned a quarter turn and moved.
  const corners = [-1, 1].flatMap(x => [0, 1.2].flatMap(y => [-2, 2].map(z => [x, y, z] as [number, number, number])));
  frame.position.set(10, 0, 5); frame.rotation.y = Math.PI / 2; frame.updateMatrixWorld();
  setPaintBox(frame, corners);
  try {
    expect(block('paint_boxLow', 4)[3]).toBe(0); // Placed with the frame, not before.
    placePaintBox();
    [8, 0, 4, 1].forEach((value, i) => expect(block('paint_boxLow', 4)[i]).toBeCloseTo(value));
    [12, 1.2, 6].forEach((value, i) => expect(block('paint_boxHigh', 3)[i]).toBeCloseTo(value));
    [10, 0.6, 5].forEach((value, i) => expect(block('paint_boxCentre', 3)[i]).toBeCloseTo(value));
    // The car moves on: the box follows at the next frame's placing.
    frame.position.x = 20; frame.updateMatrixWorld();
    expect(block('paint_boxCentre', 1)[0]).toBeCloseTo(10);
    placePaintBox(); expect(block('paint_boxCentre', 1)[0]).toBeCloseTo(20);
  } finally { setPaintBox(null); }
  expect(block('paint_boxLow', 4)[3]).toBe(0);
  placePaintBox(); expect(block('paint_boxLow', 4)[3]).toBe(0);
  expect(paintMaterial(paint({albedo: map('a')})).uniforms).not.toHaveProperty('paint_boxLow');
});
it('draws the metallic layer only for paint with a flake map, from the black region', () => {
  const metallic = (maps: CarSurface['maps']) => {
    return (paintMaterial(paint(maps)).uniforms.paint_base.value as Vector4[]).map(base => base.z);
  };
  expect(metallic({albedo: map('a')})).toEqual([0, 0, 0, 0, 0]);
  const flaked = metallic({albedo: map('a'), metallicFlakeNoise: map('f')});
  expect(flaked[0]).toBeCloseTo(0.8); expect(flaked.slice(1)).toEqual([0, 0, 0, 0]);
});

it('treats a paint without a region map as all black region and without carbon', () => {
  const shader = paintMaterial(paint({albedo: map('a'), aoSpec: map('s')}));
  expect(shader.fragmentShader).toContain('vec3 region = vec3(0.0);');
  expect((shader.uniforms.paint_base.value as Vector4[])[1].w).toBe(0);
  // No region map read: its sampler holds the albedo, and is no texture of the material's own beyond it.
  expect(shader.uniforms.paint_region.value).toBe(shader.uniforms.map.value);
  expect(shader.fragmentShader).not.toContain('focus_paint_region');
  expect(shader.customProgramCacheKey()).not.toBe(paintMaterial(paint({albedo: map('a'), region: map('r'), aoSpec: map('s')})).customProgramCacheKey());
});

it('loads the paint maps with the albedo for paint materials only', () => {
  const appearance = {alias: 'x', albedo: 'albedo', paint: paint({albedo: map('a'), region: map('r'), aoSpec: map('s'), carbon: map('c')})} as CarAppearance;
  expect(materialTexturePaths({id: 'p', name: 'BODY', paint: true}, appearance)).toEqual(['albedo', 'r', 's', 'c']);
  expect(materialTexturePaths({id: 'g', name: 'SCREEN', paint: false, surface: {version: 4, kind: 'staticEffect', maps: {albedo: map('g')}}}, appearance)).toEqual(['g']);
});

it('refuses a paint value the package does not fill', () => {
  const incomplete = paint({albedo: map('a')});
  delete (incomplete.parameters!.regions as Record<string, Record<string, unknown>>).red.clearCoatRoughness;
  expect(() => paintMaterial(incomplete)).toThrow(/no clearCoatRoughness/);
});
