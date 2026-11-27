import { describe, expect, it } from 'vitest';
import { Color, MeshStandardMaterial, Texture, type Vector2, type Vector4 } from 'three';
import { hazePart } from '../../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { ambientLookupPart } from '../../../../../../src/components/replay/view3d/shaders/ambientLookup.js';
import { sceneryReflectionUniforms } from '../../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { surfaceDefines, surfaceMaterial } from '../../../../../../src/components/replay/view3d/scenery/materials/surfaceProgram.js';
import { SURFACE_KINDS, type SurfaceConfig, type SurfaceMap } from '../../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { leafTranslucencyPart } from '../../../../../../src/components/replay/view3d/scenery/materials/vegetationSurface.js';
import { composedCutOut, composedParts, composedTextures, composeShader } from '../../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { surface } from '../surfaceFixture.js';

const map = (texture: string, uv: SurfaceMap['uv'] = 'uv0'): SurfaceMap => ({ texture, uv, scale: [2, 3], srgb: true });
const texturesOf = (config: SurfaceConfig) => Object.fromEntries(Object.keys(config.maps).map(key => [key, new Texture()]));
const composed = (config: SurfaceConfig, glb = new MeshStandardMaterial()) => surfaceMaterial(glb, config, texturesOf(config));
const names = (config: SurfaceConfig) => composedParts(composed(config))?.map(part => part.name);
const key = (config: SurfaceConfig) => composed(config).customProgramCacheKey();
/** The fragment's text from `first` on, so `before` checks an order. */
const before = (source: string, first: string, second: string) => {
  expect(source).toContain(first); expect(source).toContain(second);
  expect(source.indexOf(first)).toBeLessThan(source.indexOf(second));
};

describe('composed scenery surfaces', () => {
  it('composes the fade-in, cascade shadow, ambient lookup, track lights, the family and the kind parts, hazed last', () => {
    expect(names(surface('standard', { maps: { albedo: map('A') } })))
      .toEqual(['textureFocus', 'cascadeShadow', 'ambientLookup', 'trackLights', 'surface', 'sceneryReflection', 'haze']);
    expect(names(surface('glass', { maps: { albedo: map('A') } }))).toEqual(['textureFocus', 'cascadeShadow', 'ambientLookup', 'trackLights', 'surface', 'haze']);
    expect(names(surface('highLumSun', { maps: { albedo: map('A') } }))).toContain('lampSize');
    expect(names(surface('road', { maps: { albedo: map('A') }, flags: { decalBlend: 'addSub', ambientOcclusion: 'local', groove: 'perVertex' } }))).toContain('realRoad');
    const tree = surface('vegetation', { maps: { albedo: map('A') }, flags: { translucency: 'on' }, billboard: true });
    expect(names(tree)).toEqual(expect.arrayContaining(['billboard', 'leafTranslucency', 'sceneryReflection']));
    expect(composedParts(composed(tree))?.at(-1)).toBe(hazePart);
  });
  it('composes every surface kind', () => {
    for (const kind of SURFACE_KINDS) {
      const config = surface(kind, { maps: { albedo: map('A'), layerA: map('L'), on: map('ON'), off: map('OFF') } });
      expect(composedParts(composed(config))?.find(part => part.name === 'surface')).toBeDefined();
    }
  });
  it('gives surfaces that differ only in values, UV sets and textures one program, and another shape its own', () => {
    const base = key(surface('standard', { maps: { albedo: map('A'), normal: map('N') }, parameters: { adjust: { roughness: 0.3 } } }));
    expect(key(surface('standard', { maps: { albedo: map('B', 'uv1'), normal: map('N2', 'uv3') }, parameters: { adjust: { roughness: 0.9, normalStrength: 0.2 } } }))).toBe(base);
    expect(key(surface('standard', { maps: { albedo: map('A'), normal: map('N') }, flags: { vertexColour: 'aoMultiply' } }))).not.toBe(base);
    expect(key(surface('standard', { maps: { albedo: map('A'), normal: map('N') }, billboard: true }))).not.toBe(base);
    const tree = (power: number, flags: Record<string, string> = { translucency: 'on' }) => key(surface('vegetation', { flags, maps: { albedo: map('A') }, parameters: { translucency: { power, scale: 1 } } }));
    expect(tree(2)).toBe(tree(3)); expect(tree(2, {})).not.toBe(tree(2));
  });
  it("holds the material's own values: the tint squared, its roughness and metalness, its maps' textures, scales and UV weights", () => {
    const config = surface('standard', { maps: { albedo: map('A', 'uv1') }, parameters: { adjust: { tint: [0.5, 1, 1], roughness: 0.3 } } });
    const glb = new MeshStandardMaterial({ emissive: new Color(1, 0.5, 0), emissiveIntensity: 2 });
    const material = surfaceMaterial(glb, config, { albedo: new Texture() }), u = material.uniforms;
    expect((u.diffuse.value as Color).toArray()).toEqual([0.25, 1, 1]);
    expect((u.emissive.value as Color).toArray()).toEqual([2, 1, 0]);
    expect([u.roughness.value, u.metalness.value]).toEqual([0.3, 0.4]);
    expect((u.surface_uv_albedo.value as Vector4).toArray()).toEqual([0, 1, 0, 0]);
    expect((u.surface_scale_albedo.value as Vector2).toArray()).toEqual([2, 3]);
    expect(u).not.toHaveProperty('surface_alphaCut'); // The pass block's.
    expect(u.surface_reflection).toBe(sceneryReflectionUniforms.surface_reflection);
    expect(composedTextures(material)).toEqual([u.surface_albedo.value]);
    // The shadow pass cuts it out by its albedo where the surface reads it: its UV set's weights and scale, unshifted.
    const cut = composedCutOut(material)!;
    expect([cut.map, cut.uvSets, cut.scale]).toEqual([u.surface_albedo, u.surface_uv_albedo, u.surface_scale_albedo]);
    expect(cut.scale).toBe(u.surface_scale_albedo);
    expect([cut.transform.value.elements, cut.shift.value.toArray()]).toEqual([[1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0]]);
    expect(composedCutOut(composed(surface('standard')))).toBeNull();
    // An animated map's cut-out moves with it.
    const scrolling = composed(surface('standard', { maps: { albedo: { ...map('A'), uvAnimation: { mode: 'scroll', rate: [0.5, 0], step: [0, 0] } } } }));
    expect(composedCutOut(scrolling)?.shift).toBe(scrolling.uniforms.surface_shift_albedo);
  });
  it("keeps the GLB material's own state", () => {
    const glb = new MeshStandardMaterial({ transparent: true, opacity: 0.5, alphaTest: 0.25, vertexColors: true, flatShading: true });
    const material = composed(surface('standard'), glb);
    expect([material.transparent, material.opacity, material.alphaTest, material.vertexColors, material.fog]).toEqual([true, 0.5, 0.25, true, false]);
    expect((material as typeof material & { flatShading?: boolean }).flatShading).toBe(true);
    expect(material.uniforms.alphaTest.value).toBe(0.25);
  });
  it('puts the family where the patched standard program had it, in the template order', () => {
    const { fragmentShader: f, vertexShader: v } = composed(surface('standard', { maps: { albedo: map('A') } }));
    before(f, 'diffuseColor.rgb *= diffuse;', '#include <color_fragment>');
    before(f, '#include <color_fragment>', 'if (diffuseColor.a < alphaTest * surface_alphaCut || diffuseColor.a == 0.0) discard;');
    before(f, 'discard;', 'roughnessFactor = clamp(surfaceRoughness,0.045,1.0);');
    before(f, '#include <normal_fragment_begin>', 'totalEmissiveRadiance*=surface_emission;');
    before(f, '#include <lights_physical_fragment>', 'material.specularF90=mix(surfaceSpecular,1.0,metalnessFactor);');
    before(f, 'material.specularF90=mix(surfaceSpecular', 'surfaceReflectionSpecular=surfaceSpecular;');
    before(f, 'surfaceIndirectSpecular( radiance', 'reflectedLight.indirectDiffuse+=(vTrackLight');
    before(f, 'reflectedLight.indirectDiffuse+=(vTrackLight', 'reflectedLight.indirectDiffuse*=surfaceAO;');
    expect(f).toContain('focusTexture(surface_albedo, focus_surface_albedo, (surfaceUv(surface_uv_albedo) * surface_scale_albedo))');
    expect(f).toContain(ambientLookupPart.slots.fragmentIrradiance?.glsl);
    // Every extra UV set, so a map reads its own by weight.
    for (const set of [1, 2, 3]) expect(v).toContain(`#ifndef USE_UV${set}\n    attribute vec2 uv${set};\n    #endif`);
    before(v, '#include <begin_vertex>', 'vSurfaceUV01 = vec4(uv,uv1);');
  });
  it("draws the physical kinds on three's physical defines, clear coat with its coat mixed in, glass with its finish and the scene sun", () => {
    expect(surfaceDefines(surface('standard'))).toEqual({});
    expect(surfaceDefines(surface('glass'))).toEqual({ IOR: '', USE_SPECULAR: '' });
    expect(surfaceDefines(surface('clearcoat'))).toEqual({ IOR: '', USE_SPECULAR: '', USE_CLEARCOAT: '' });
    const coat = composed(surface('clearcoat', { maps: { albedo: map('A'), normal: map('N') } }));
    expect([coat.uniforms.clearcoat.value, coat.uniforms.ior.value, coat.uniforms.specularIntensity.value]).toEqual([0.4, 0.4, 1]);
    expect(coat.defines).toMatchObject({ USE_CLEARCOAT: '' });
    before(coat.fragmentShader, '#include <clearcoat_normal_fragment_begin>', 'clearcoatNormal=surfaceNormal');
    expect(coat.fragmentShader).toContain('outgoingLight = outgoingLight * (mix(vec3(1.0),pow(clamp(surface_coatLacquerColour');
    expect(coat.fragmentShader).toContain('clearcoatSpecularDirect*=surfaceSpecularOcclusion;');
    const glass = composed(surface('glass', { maps: { albedo: map('A') } }));
    expect(glass.uniforms.ior.value).toBe(1.5);
    expect(glass.fragmentShader).toContain('normalize((viewMatrix * vec4(lit_sunDirection, 0.0)).xyz)'); expect(glass.fragmentShader).not.toContain('directionalLights');
    before(glass.fragmentShader, 'vec3 outgoingLight', 'totalSpecular/clamp(diffuseColor.a+0.001');
    before(glass.fragmentShader, 'totalSpecular/clamp(diffuseColor.a+0.001', '#include <opaque_fragment>');
  });
  it('shades terrain by its baked shadow on the sun as well as the ambient', () => {
    const terrain = composed(surface('terrain', { maps: { layerA: map('A'), splatter: map('S') }, flags: { layers: '1' } })).fragmentShader;
    expect(terrain).toContain('surfaceBakedShadow=splatter.a;');
    expect(terrain).toContain('float sunShadow = receiveShadow ? min(surfaceCascadeShadow( - vViewPosition.z ), surfaceBakedShadow) : 1.0;');
    expect(composed(surface('standard')).fragmentShader).not.toContain(', surfaceBakedShadow)');
  });
  it("takes a bright panel's facing cosine before a lamp grows on screen", () => {
    const bright = composed(surface('highLumTrackside', { maps: { albedo: map('A') } })).vertexShader;
    before(bright, 'vSurfaceFacing = max(0.0, dot(normalize(transformedNormal), normalize(-mvPosition.xyz)));', 'vSurfaceLampShare = 1.0 / (growth * growth);');
    expect(composed(surface('lowLumEmissive', { maps: { albedo: map('A') } })).vertexShader).not.toContain('vSurfaceFacing');
  });
  it('turns cards toward the camera, a leaf card with its crown, and lets its cascade lookup skip its own plane', () => {
    const tree = composed(surface('vegetation', { maps: { albedo: map('A') }, billboard: true }));
    expect(tree.vertexShader).toContain('vec3 toEye = surface_cardFacing.w > 0.5 ? surface_cardFacing.xyz : eye - pivotWorld;');
    expect(tree.vertexShader).toContain('vec3 crownNormal = facing + across * side + vec3(0.0, up, 0.0);');
    expect(tree.uniforms).not.toHaveProperty('surface_crownSun'); expect(tree.uniforms).not.toHaveProperty('surface_cardFacing'); // The scene block's.
    before(tree.fragmentShader, '#define SURFACE_CARD', '#ifdef SURFACE_CARD');
    const crowd = composed(surface('standard', { maps: { albedo: map('A') }, billboard: true }));
    expect(crowd.vertexShader).not.toContain('crownNormal');
    expect(composed(surface('vegetation', { maps: { albedo: map('A') } })).vertexShader).not.toContain('_lmu_pivot');
  });
  it("adds a leaf's light through it to the sun's diffuse before the cascade's split, by its own power and scale", () => {
    const part = leafTranslucencyPart(surface('vegetation', { parameters: { translucency: { power: 3, scale: 4 } } }));
    expect(part.slots.fragmentSunDirect?.glsl.trim()).toBe('surfaceLeafScatter( directLight, geometryNormal, geometryViewDir, material, reflectedLight );');
    expect(part.slots.fragmentPars?.glsl).toContain('pow(clamp(dot(-viewDir,normalize(normal+light.direction)),0.0,1.0),surface_leafPower)');
    expect([part.uniforms?.().surface_leafPower.value, part.uniforms?.().surface_leafScale.value]).toEqual([3, 4]);
    const leaf = composed(surface('vegetation', { maps: { albedo: map('A') }, flags: { translucency: 'on' } })).fragmentShader;
    before(leaf, 'RE_Direct_Physical(', 'surfaceLeafScatter( directLight');
    before(leaf, 'surfaceLeafScatter( directLight', '* surfaceSunDiffuse;');
    expect(leaf).not.toContain('3.00000000');
    // The same composition as the template takes it: compiles into the sun's slot only.
    expect(composeShader(litTemplate, [part]).fragmentShader).toContain('surfaceLeafScatter( directLight');
  });
});
