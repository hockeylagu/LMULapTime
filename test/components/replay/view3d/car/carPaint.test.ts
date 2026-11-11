import { expect, it } from 'vitest';
import { CubeTexture, MeshPhysicalMaterial, ShaderLib, Texture, WebGLCubeRenderTarget, type Vector3, type Vector4, type WebGLProgramParametersWithUniforms } from 'three';
import { configureCarPaint, setPaintReflection } from '../../../../../src/components/replay/view3d/car/carPaint.js';
import { materialTexturePaths } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import type { CarAppearance, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const region = (over: Record<string, unknown> = {}) => ({
  baseCoatRoughness: 0.3, baseCoatSpecStrength: 0.5, baseCoatRefractiveIndex: 2.25, clearCoatSpecStrength: 1, clearCoatRoughness: 0,
  clearCoatRefractiveIndex: 1.44, lacquerColour: [1, 1, 1, 1], metallicPaintStrength: 0.8, metallicFlakeStrength: 0, carbonFibreStrength: 0.6,
  orangePeelStrength: 1, ...over,
});
const map = (texture: string) => ({texture, uv: 'uv0' as const, scale: [1, 1] as [number, number]});
const paint = (maps: CarSurface['maps']): CarSurface => ({
  version: 4, kind: 'carPaint', normalShadowInfluence: 0.5, maps,
  parameters: {regions: {black: region(), red: region(), green: region({clearCoatSpecStrength: 0}), blue: region(), white: region()},
    clearCoatStrength: 0.5, lacquerThickness: 0.3, carbonFibreAlbedoColour: [0.43, 0.43, 0.43, 0], metallicFlakeColour: [1, 1, 1],
    uvScale: {carbonFibre: [125, 125], metallicFlakes: [1, 1], orangePeel: [1, 1]}},
});

function compile(material: MeshPhysicalMaterial): WebGLProgramParametersWithUniforms {
  const shader = {uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader} as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, null as never);
  return shader;
}

it("builds regional layered car paint on three's physical model", () => {
  const material = new MeshPhysicalMaterial({map: new Texture()}), textures: string[] = [];
  configureCarPaint(material, paint({albedo: map('a'), region: map('r'), aoSpec: map('s'), carbon: map('c')}), path => { textures.push(path); return new Texture(); }, testShading());
  expect(textures).toEqual(['r', 's', 'c']);
  const shader = compile(material), uniforms = shader.uniforms;
  // Every hook applied: the coat output now carries the lacquer absorption, and both paint maps are sampled.
  expect(shader.fragmentShader).not.toContain('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )');
  for (const marker of ['texture2D(paint_region, vMapUv)', 'texture2D(paint_aoSpec, vMapUv)', 'roughnessFactor = clamp(paintBaseRoughness', 'reflectedLight.indirectDiffuse *= paintAO']) {
    expect(shader.fragmentShader).toContain(marker);
  }
  expect(shader.fragmentShader).toContain('material.clearcoatF0 = vec3(paintCoatF0)');
  // Each coat reads the car's own cubes by the package's rule (bias for the clear coat, explicit for the base coat in the fixture).
  expect(shader.fragmentShader).toContain('clearcoatRadiance += paintReflection( geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, false );');
  expect(shader.fragmentShader).toContain('vec3 iblRadiance = paintReflection( geometryViewDir, geometryNormal, paintBaseRoughness, true );');
  expect(shader.fragmentShader).not.toContain('getIBLRadiance( geometryViewDir, geometryClearcoatNormal');
  expect(uniforms.paint_lodScale.value).toBe(6); expect(uniforms.paint_probe.value).toBe(0);
  const cubes = {sharp: new Texture(), convolved: new CubeTexture(), levels: 8, target: new WebGLCubeRenderTarget(4), dispose() {}};
  expect(setPaintReflection(material, cubes)).toBe(true);
  expect(uniforms.paint_sharp.value).toBe(cubes.sharp); expect(uniforms.paint_convolved.value).toBe(cubes.convolved);
  expect(uniforms.paint_levels.value).toBe(8); expect(uniforms.paint_probe.value).toBe(1);
  expect(setPaintReflection(material, null)).toBe(true); expect(uniforms.paint_probe.value).toBe(0); expect(uniforms.paint_sharp.value).toBeNull();
  expect(setPaintReflection(new MeshPhysicalMaterial(), cubes)).toBe(false);
  // The sun glint joins both coats' direct specular inside the directional light loop, from the package's shading values.
  expect(shader.fragmentShader).toContain('clearcoatSpecularDirect = paintGlint(clearcoatSpecularDirect, directLight');
  expect(shader.fragmentShader).toContain('reflectedLight.directSpecular = paintGlint(reflectedLight.directSpecular, directLight');
  expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
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
  expect(material.customProgramCacheKey()).toBe('lmu-car-paint-region-ao-bias-explicit');
});

it('draws the metallic layer only for paint with a flake map, from the black region', () => {
  const metallic = (maps: CarSurface['maps']) => {
    const material = new MeshPhysicalMaterial({map: new Texture()});
    configureCarPaint(material, paint(maps), () => new Texture(), testShading());
    return (compile(material).uniforms.paint_base.value as Vector4[]).map(base => base.z);
  };
  expect(metallic({albedo: map('a')})).toEqual([0, 0, 0, 0, 0]);
  const flaked = metallic({albedo: map('a'), metallicFlakes: map('f')});
  expect(flaked[0]).toBeCloseTo(0.8); expect(flaked.slice(1)).toEqual([0, 0, 0, 0]);
});

it('treats a paint without a region map as all black region and without carbon', () => {
  const albedo = new Texture(), material = new MeshPhysicalMaterial({map: albedo});
  configureCarPaint(material, paint({albedo: map('a'), aoSpec: map('s')}), () => new Texture(), testShading());
  const shader = compile(material);
  expect(shader.fragmentShader).toContain('vec3 region = vec3(0.0);');
  expect((shader.uniforms.paint_base.value as Vector4[])[1].w).toBe(0);
  expect(shader.uniforms.paint_region.value).toBe(albedo);
  expect(material.customProgramCacheKey()).toBe('lmu-car-paint-black-ao-bias-explicit');
});

it('loads the paint maps with the albedo for paint materials only', () => {
  const appearance = {alias: 'x', albedo: 'albedo', paint: paint({albedo: map('a'), region: map('r'), aoSpec: map('s'), carbon: map('c')})} as CarAppearance;
  expect(materialTexturePaths({id: 'p', name: 'BODY', paint: true}, appearance)).toEqual(['albedo', 'r', 's', 'c']);
  expect(materialTexturePaths({id: 'g', name: 'GLASS', paint: false, surface: {version: 4, kind: 'glass', maps: {albedo: map('g')}}}, appearance)).toEqual(['g']);
});

it('refuses a paint value the package does not fill', () => {
  const incomplete = paint({albedo: map('a')});
  delete (incomplete.parameters!.regions as Record<string, Record<string, unknown>>).red.clearCoatRoughness;
  expect(() => configureCarPaint(new MeshPhysicalMaterial({map: new Texture()}), incomplete, () => new Texture(), testShading())).toThrow(/no clearCoatRoughness/);
});
