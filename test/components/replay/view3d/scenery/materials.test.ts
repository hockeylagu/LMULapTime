import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial, Texture, Vector2, Vector4 } from 'three';
import { TRACK_LIGHT_ATTRIBUTE } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import { configureSurfaceMaterial, createSharedSurfaceMaterials } from '../../../../../src/components/replay/view3d/scenery/materials/configureSurfaceMaterial.js';
import { prepareSceneryMesh } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';
import { surfaceFamilyPart, surfaceMaterial } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceProgram.js';
import { SCENE_BLOCK_GROUPS } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { shaderParts, surfaceUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { readSurfaceConfig, SURFACE_KINDS, terrainLayerCount, textureAsset, type SurfaceConfig, type SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { imageUriMap, resolveMapUri } from '../../../../../src/components/replay/view3d/scenery/materials/textureSource.js';
import { surface } from './surfaceFixture.js';

const map = (texture: string, srgb = false, uv: SurfaceMap['uv'] = 'uv0'): SurfaceMap => ({ texture, uv, scale: [2, 3], srgb });
const holder = (config: unknown) => ({ lmuSurface: config }) as Record<string, unknown>;

describe('readSurfaceConfig', () => {
  it('leaves a material without a surface description alone', () => { expect(readSurfaceConfig({})).toBeNull(); });
  it('accepts a version 4 surface of every known kind', () => {
    for (const kind of SURFACE_KINDS) expect(readSurfaceConfig(holder(surface(kind)))?.kind).toBe(kind);
  });
  it('throws for another schema version, an unknown kind or an unsupported UV set', () => {
    expect(() => readSurfaceConfig(holder({ ...surface('terrain'), version: 2 }))).toThrow('Unsupported private surface material');
    expect(() => readSurfaceConfig(holder({ ...surface('terrain'), kind: 'hologram' }))).toThrow('Unsupported source shader family: hologram');
    expect(() => readSurfaceConfig(holder(surface('standard', { maps: { albedo: map('A', true, 'UV_Z' as 'uv0') } })))).toThrow('Unsupported shader UV');
    expect(() => readSurfaceConfig(holder({ version: 4, kind: 'standard', name: 'x' }))).toThrow('Incomplete surface material');
  });
});

describe('terrain layers', () => {
  it('reads the layer count and rejects a missing or other count', () => {
    expect(terrainLayerCount({ layers: '3' })).toBe(3); expect(terrainLayerCount({ layers: '4' })).toBe(4);
    for (const flags of [{}, { layers: '5' }, { layers: 'x' }]) expect(() => terrainLayerCount(flags)).toThrow(/terrain layer count/);
  });
  it('picks the layer weights of the configured count', () => {
    const maps = { layerA: map('A', true), layerB: map('B', true) };
    expect(shaderParts(surface('terrain', { maps, flags: { layers: '2' } })).albedo).toContain('surfaceWeights = vec4(1.0-blend.r, blend.r, 0.0, 0.0);');
    expect(shaderParts(surface('terrain', { maps, flags: { layers: '4' } })).albedo).toContain('blend.g*(1.0-blend.b), blend.b)');
  });
  it('applies non-white terrain tint once instead of multiplying the already tinted diffuse colour again', () => {
    const config = surface('terrain', {maps: {layerA: map('A', true)}, flags: {layers: '1'},
      parameters: {adjust: {tint: [0.5, 0.75, 1]}}});
    const uniform = shaderParts(config, {uniforms: true}).albedo;
    expect(uniform).toContain('diffuseColor.rgb = ground.rgb * diffuse;');
    expect(uniform).not.toContain('diffuseColor.rgb *= ground.rgb * diffuse;');
    expect(shaderParts(config, {uniforms: false}).albedo).toContain('ground.rgb * vec3(0.50000000,0.75000000,1.00000000) * vec3(0.50000000,0.75000000,1.00000000)');
  });
  it('multiplies the albedo by a decal after the layers and takes its alpha as the surface alpha, for a MASK cut', () => {
    const maps = { layerA: map('A', true), decal: map('SKIDMARKS', true) };
    const albedo = shaderParts(surface('terrain', { maps, flags: { layers: '1', decal: 'albedoMultiply' } })).albedo;
    expect(albedo).toMatch(/diffuseColor\.rgb \*?= ground\.rgb[^;]*;\s*vec4 terrainDecal=[^;]*; diffuseColor\.rgb\*=terrainDecal\.rgb; diffuseColor\.a=terrainDecal\.a;/);
    expect(shaderParts(surface('terrain', { maps: { layerA: map('A', true) }, flags: { layers: '1' } })).albedo).not.toContain('terrainDecal');
    expect(() => shaderParts(surface('terrain', { maps: { layerA: map('A', true) }, flags: { layers: '1', decal: 'albedoMultiply' } }))).toThrow('Unsupported terrain decal');
    expect(() => shaderParts(surface('terrain', { maps, flags: { layers: '1', decal: 'splatter' } }))).toThrow('Unsupported terrain decal');
  });
});

describe('texture resolution', () => {
  it('names an image by stem and colour role', () => {
    expect(textureAsset('ROAD_ALB', true)).toBe('ROAD_ALB__srgb.ktx2.zst'); expect(textureAsset('ROAD_NRM', false)).toBe('ROAD_NRM__linear.ktx2.zst');
    expect(() => textureAsset('a/b', true)).toThrow('Invalid source texture stem');
  });
  it('maps a declared image to its content-named file and throws for an undeclared one', () => {
    const uris = imageUriMap({ images: [{ name: 'ROAD_ALB__srgb.ktx2.zst', uri: 'textures/abc.ktx2.zst' }, { name: 'nameless' }] });
    expect(uris.size).toBe(1);
    expect(resolveMapUri(map('ROAD_ALB', true), uris)).toBe('textures/abc.ktx2.zst');
    expect(() => resolveMapUri(map('ROAD_ALB', false), uris)).toThrow('ROAD_ALB__linear.ktx2.zst is not declared');
  });
});

describe('shaderParts', () => {
  it('declares one sampler, scale and UV set uniform per map, sorted, and samples through them with the fade-in', () => {
    const parts = shaderParts(surface('standard', { maps: { normal: map('N'), albedo: map('A', true) } }));
    expect(parts.declarations.indexOf('surface_albedo;')).toBeLessThan(parts.declarations.indexOf('surface_normal;'));
    expect(parts.declarations).toContain('uniform vec2 surface_scale_normal;');
    expect(parts.declarations).toContain('uniform vec4 surface_uv_normal;');
    expect(parts.albedo).toContain('focusTexture(surface_albedo, focus_surface_albedo, (surfaceUv(surface_uv_albedo) * surface_scale_albedo))');
    expect(parts.normals).toContain('surfaceNormalVector(normal,(surfaceUv(surface_uv_normal) * surface_scale_normal)');
  });
  it('bakes constants and UV sets instead of uniforms when asked', () => {
    const parts = shaderParts(surface('standard', { maps: { albedo: map('A', true) } }), { uniforms: false });
    expect(parts.declarations).not.toContain('surface_scale_albedo'); expect(parts.albedo).toContain('vec2(2.00000000,3.00000000)');
    expect(parts.albedo).toContain('texture2D(surface_albedo, (vSurfaceUV01.xy * vec2(');
    expect(shaderParts(surface('diffuse', { maps: { albedo: map('A', true, 'worldPlanar') } }), { uniforms: false }).albedo).toContain('(vSurfaceXZ * vec2(');
  });
  it('weighs the UV sets per material: one set 1, the world XZ none, so maps on other sets share the program', () => {
    const weights = (uv: SurfaceMap['uv']) => (surfaceUniforms(surface('diffuse', { maps: { albedo: map('A', true, uv) } }), { albedo: new Texture() }).surface_uv_albedo.value as Vector4).toArray();
    expect([weights('uv0'), weights('uv1'), weights('uv2'), weights('uv3'), weights('worldPlanar')])
      .toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 0, 0]]);
    expect(shaderParts(surface('diffuse', { maps: { albedo: map('A', true, 'uv2') } }))).toEqual(shaderParts(surface('diffuse', { maps: { albedo: map('A', true) } })));
  });
  it('names every tunable for every surface (values 0 where it carries none), and throws for a map without its texture', () => {
    const tunables = ['surface_specular', 'surface_mixBias', 'surface_decalStrength', 'surface_grooveAlbedo', 'surface_coatIOR', 'surface_coatStrength', 'surface_coatLacquerThickness', 'surface_normalScale'];
    for (const kind of ['standard', 'road', 'clearcoat'] as const) expect(Object.keys(surfaceUniforms(surface(kind), {}))).toEqual(expect.arrayContaining(tunables));
    const road = surfaceUniforms(surface('road'), {});
    expect([road.surface_coatStrength.value, road.surface_decalStrength.value]).toEqual([0, 0.4]);
    expect(() => surfaceUniforms(surface('standard', { maps: { albedo: map('A', true) } }), {})).toThrow('has no texture for its map albedo');
  });
  it('refuses a malformed tunable: a value that is not a finite number, a group the surface carries without its list', () => {
    for (const strength of [Number.NaN, Number.POSITIVE_INFINITY, '0.4' as unknown as number]) {
      expect(() => surfaceUniforms(surface('road', { parameters: { decal: { strength } } }), {})).toThrow('Missing surface value: strength');
    }
    expect(() => surfaceUniforms(surface('clearcoat', { parameters: { clearCoat: { lacquerColour: undefined } } }), {})).toThrow('Missing surface value: lacquerColour');
  });
  it('drives the luminous kinds by emission only, with their native multipliers in the game light unit, the bright panels brightest head-on', () => {
    const maps = { albedo: map('A', true) };
    const unit = (k: number) => (k * GAME_LIGHT_UNIT).toFixed(8);
    expect(shaderParts(surface('highLumSun', { maps })).emissive).toBe(`lum.rgb*${unit(500)}*(1.0+2.0*pow(clamp(vSurfaceFacing,0.0,1.0),64.0))*vSurfaceLampShare*lum.a`);
    expect(shaderParts(surface('highLumTrackside', { maps })).emissive).toBe(`lum.rgb*${unit(100)}*(1.0+2.0*pow(clamp(vSurfaceFacing,0.0,1.0),8.0))*vSurfaceLampShare*lum.a`);
    expect(shaderParts(surface('lowLumEmissive', { maps })).declarations).toContain('varying float vSurfaceLampShare;');
    expect(shaderParts(surface('highLumSun', { maps })).declarations).toContain('varying float vSurfaceFacing;');
    expect(shaderParts(surface('lowLumEmissive', { maps })).declarations).not.toContain('vSurfaceFacing');
    expect(shaderParts(surface('lowLumEmissive', { maps })).emissive).toBe(`lum.rgb*${unit(20)}*vSurfaceLampShare*clamp(vSurfaceColour.rgb,0.0,1.0)*lum.a`);
    expect(shaderParts(surface('highLumSun', { maps })).albedo).toContain('diffuseColor.rgb=vec3(0.0)');
  });
  it('lays a dashboard decal over the screen with its own roughness, and multiplies a monitor by its decal', () => {
    const maps = { albedo: map('A', true), decal: map('D', true) };
    const decal = shaderParts(surface('dashboard', { maps, flags: { decal: 'alphaBlend' }, parameters: { dashboard: { roughness: 0.2, decalRoughness: 0.7, emissiveStrength: 9, emissiveNight: 1 } } }), { uniforms: false });
    expect(decal.albedo).toContain('diffuseColor.rgb=mix(diffuseColor.rgb,dashDecal.rgb,dashDecal.a)');
    expect(decal.albedo).toContain('surfaceRoughness=mix(surfaceRoughness,0.70000000,dashDecal.a)');
    expect(shaderParts(surface('dashboard', { maps }), { uniforms: false }).albedo).not.toContain('dashDecal');
    const monitor = shaderParts(surface('externalMonitor', { maps }), { uniforms: false });
    expect(monitor.albedo).toContain('diffuseColor*=texture2D(surface_albedo');
    expect(monitor.albedo).not.toContain('vSurfaceColour');
  });
  it('reads the dashboard controls and ignores vertex colour only for the diffuse shader without it', () => {
    const config = surface('dashboard', { maps: { albedo: map('A', true) }, parameters: { dashboard: { roughness: 0.4, emissiveStrength: 9, emissiveNight: 1.5 } } });
    const dash = shaderParts(config, { uniforms: false });
    // The screen's light is a constant light in the diffuse sum: albedo times its strength over pi, less the specular share; the
    // strength runs from the night one to the day one with the scene's day share. The strength is a game light value, in the sun's
    // unit: converted by GAME_LIGHT_UNIT as the sun is (a strength of 100, the midday sun's, gives 4 / pi before the specular share).
    const share = (1 - 0.5 * (0.4 / 2.4) ** 2) / Math.PI * GAME_LIGHT_UNIT;
    expect(100 * GAME_LIGHT_UNIT).toBeCloseTo(4, 9);
    expect(dash.albedo).toContain('surfaceRoughness=0.40000000');
    expect(dash.emissive).toBe(`diffuseColor.rgb*mix(1.50000000,9.00000000,lit_dayLight)*${share.toFixed(8)}`);
    expect(dash.declarations).not.toContain('lit_dayLight'); // The day share is the scene block's.
    expect(dash.albedo).toContain('surfaceSpecular=0.5;');
    // With uniforms, the values leave the source for `surface_constants`.
    const shared = shaderParts(config);
    expect([shared.albedo, shared.emissive, shared.constants]).toEqual([expect.stringContaining('surfaceRoughness=surface_constants[0].x'),
      'diffuseColor.rgb*mix(surface_constants[0].y,surface_constants[0].z,lit_dayLight)*surface_constants[0].w', [0.4, 1.5, 9, share]]);
    expect(shared.declarations).toContain('uniform vec4 surface_constants[1];');
    expect(shaderParts(surface('diffuse', { vertexColour: false, maps: { albedo: map('A', true) } })).albedo).not.toContain('*vSurfaceColour');
    expect(shaderParts(surface('diffuse', { maps: { albedo: map('A', true) } })).albedo).toContain('*vSurfaceColour');
  });
  it('glows a standard surface always, at night only (under full day), or not at all, by its emissive flag', () => {
    const glow = (emissive: string | undefined) => shaderParts(surface('standard', { flags: { emissive } }), { uniforms: false });
    expect(glow('always').emissive).not.toContain('lit_dayLight');
    expect(glow('always').declarations).not.toContain('lit_dayLight');
    expect(glow('night').emissive).toMatch(/\*\(1\.0-step\(1\.0,lit_dayLight\)\)$/);
    expect(glow('night').declarations).not.toContain('lit_dayLight');
    expect(glow(undefined).emissive).toBe('vec3(0.0)');
    // Its strength is a game light value summed with the sun's light before the 1/pi: converted by GAME_LIGHT_UNIT as the sun is.
    expect(glow('always').emissive).toContain(`*diffuseColor.rgb*${(GAME_LIGHT_UNIT / Math.PI).toFixed(8)}*`);
  });
  it("masks a standard surface's glow by its map's rgb, or its green for rg and for a map named without a mode, and not at all without a map", () => {
    const mask = (emissiveMask?: string) => shaderParts(surface('standard', { flags: { emissive: 'always', ...(emissiveMask ? { emissiveMask } : {}) }, maps: { albedo: map('A', true), emissive: map('E') } }), { uniforms: false }).emissive;
    expect(mask('rgb')).toMatch(/\.rgb\*diffuseColor/);
    expect(mask('rg')).toMatch(/\.g\)\*diffuseColor/);
    expect(mask('map')).toMatch(/\.g\)\*diffuseColor/);
    expect(mask()).toContain('*vec3(1.0)*diffuseColor');
  });
  it('lays the vertex colour on a standard albedo by its mode, a masked one faded by the albedo alpha', () => {
    const parts = (vertexColour: string) => shaderParts(surface('standard', { maps: { albedo: map('A', true) }, flags: { vertexColour, roughnessFromAlbedoAlpha: 'on' } })).albedo;
    expect(parts('albedoMultiply')).toContain('surfaceAlbedo*=vSurfaceColour.rgb;');
    expect(parts('albedoMultiply')).toContain('mr.g=base.a;');
    expect(parts('albedoMultiplyMasked')).toContain('surfaceAlbedo*=mix(vec3(1.0),vSurfaceColour.rgb,base.a);');
    expect(parts('albedoOverlay')).toContain('surfaceOverlay(sqrt(max(surfaceAlbedo,vec3(0.0))),vSurfaceColour.rgb)');
    const overlay = parts('albedoOverlayMasked');
    expect(overlay).toContain('mix(vec3(0.5),vSurfaceColour.rgb,base.a)');
    // The masked modes take the albedo alpha as their mask: neither roughness nor opacity.
    expect(overlay).not.toContain('mr.g=base.a;'); expect(overlay).toContain('diffuseColor.a*=1.0;');
  });
  it('adds the blink clock for digital flags and keeps the authored period', () => {
    const parts = shaderParts(surface('digitalFlag', { maps: { on: map('ON', true), off: map('OFF', true) }, parameters: { blink: { period: 0.5 } } }), { uniforms: false });
    expect(parts.albedo).toContain('surface_time'); expect(parts.declarations).not.toContain('surface_time'); expect(parts.albedo).toContain('3.141592653589793/0.50000000');
  });
  it('widens the water roughness by the screen-space spread of the wave normal', () => {
    const water = shaderParts(surface('water', { maps: { albedo: map('A', true), normalA: map('N', false) } }));
    expect(water.normals).toContain('dFdx(normal)'); expect(water.normals).toContain('roughnessFactor = sqrt(');
    expect(shaderParts(surface('water', { maps: { albedo: map('A', true) } })).normals).toBe('');
  });
  it('draws water opaque: its albedo alpha is its depth, not its opacity', () => {
    const water = shaderParts(surface('water', { maps: { albedo: map('A', true) } }));
    expect(water.albedo).toContain('diffuseColor.a = 1.0;'); expect(water.albedo).not.toContain('waterAlbedo.a');
  });
  it('keeps glass a mirror unless its occlusion/roughness map is on, and draws windscreens with the glass program', () => {
    const maps = { albedo: map('A', true), occlusionRoughness: map('R') };
    expect(shaderParts(surface('glass', { maps }), { uniforms: false }).albedo).toContain('surfaceRoughness=0.0;');
    const rough = shaderParts(surface('glass', { maps, flags: { occlusionRoughness: 'on' } }), { uniforms: false }).albedo;
    expect(rough).toContain('surfaceRoughness=surfaceAdjust(texture2D(surface_occlusionRoughness');
    const screen = shaderParts(surface('windscreen', { maps, flags: { vertexColour: 'albedoMultiply', vertexAlpha: 'opacityMultiply' } }), { uniforms: false });
    expect(screen.albedo).toContain('diffuseColor.rgb*=vSurfaceColour.rgb;'); expect(screen.albedo).toContain('diffuseColor.a*=vSurfaceColour.a;');
    expect(screen.finish).toContain('totalSpecular/clamp(diffuseColor.a+0.001');
  });
  it('samples the alpha-composited glass finish and the clearcoat absorption', () => {
    const glassFinish = shaderParts(surface('glass', { maps: { albedo: map('A', true) } })).finish;
    expect(glassFinish).toContain('totalSpecular/clamp(diffuseColor.a+0.001');
    // Smooth glass halves the sun's GGX highlight with the sun disc's glint.
    expect(glassFinish).toMatch(/surfaceRoughness < 0\.1[\s\S]*0\.99985[\s\S]*0\.5 \* \(/);
    const clearcoat = shaderParts(surface('clearcoat', { maps: { albedo: map('A', true) } }));
    expect(clearcoat.absorption).toContain('surface_coatLacquerColour'); expect(clearcoat.physical).toContain('material.clearcoatF0');
  });
  it('throws for malformed or unsupported sources instead of substituting', () => {
    const { clearCoat: _, ...noCoat } = surface('clearcoat').parameters;
    expect(() => shaderParts({ ...surface('clearcoat', { maps: { albedo: map('A', true) } }), parameters: noCoat })).toThrow('Missing surface value: roughness');
    const noRoughness = surface('road', { maps: { albedo: map('A', true) } });
    delete noRoughness.parameters.adjust?.roughness;
    expect(() => shaderParts(noRoughness)).toThrow('Missing surface value: roughness');
    expect(() => shaderParts(surface('standardBlend', { flags: { blendMask: 'nonsense' } }))).toThrow('Unsupported source blend mask nonsense');
    expect(() => shaderParts(surface('standardBlend', { flags: { albedoBlend: 'dither' } }))).toThrow('Unsupported StandardBlend albedo function: dither');
    expect(() => shaderParts(surface('roadDecal'))).toThrow('Road decal albedo atlas is required');
    expect(() => shaderParts(surface('clearcoat', { maps: { albedo: map('A', true), detail: map('D') }, flags: { detailAlbedo: 'overlay' } }))).toThrow('Unimplemented clearcoat detail blend');
  });
  it('enters road, kerb and standard through their own families', () => {
    expect(shaderParts(surface('road', { maps: { albedo: map('A', true) } })).physical).toContain('0.05'); // F0 of IOR 1.635
    expect(shaderParts(surface('kerb', { maps: { albedo: map('A', true) } })).albedo).toContain('surfaceAltBlend=1.0-sourceBlend');
    // The overlay's colour blends at full strength (pulling it halfway to grey halved the road's grain contrast).
    expect(shaderParts(surface('road', { maps: { albedo: map('A', true), overlay: map('O') }, flags: { decalBlend: 'addSub', ambientOcclusion: 'local', overlayMap: 'on' } })).albedo).toContain('surfaceOverlay(overlayBase,sourceOverlay.rgb)');
    expect(shaderParts(surface('standard', { maps: { albedo: map('A', true) } })).occlusion).toBe('');
    expect(shaderParts(surface('standard', { maps: { albedo: map('A', true), aoSpec: map('AO') } })).occlusion).toBe('reflectedLight.indirectSpecular*=aoSpec.r;');
  });
});

/** The composed program key of a surface (surfaceProgram.ts), its maps loaded. */
const programKey = (config: SurfaceConfig) => composedSurface(config).customProgramCacheKey();
const composedSurface = (config: SurfaceConfig) => surfaceMaterial(new MeshStandardMaterial(), config, Object.fromEntries(Object.keys(config.maps).map(key => [key, new Texture()])));

describe('surface program keys', () => {
  const base = () => surface('standard', { maps: { albedo: map('A', true), normal: map('N') }, parameters: { adjust: { roughness: 0.3 } } });
  it('is shared by materials that differ only in tunables, scales, UV sets and texture names', () => {
    const other = surface('standard', { maps: { albedo: { ...map('OTHER', true, 'uv2'), scale: [9, 9] }, normal: map('N2') }, parameters: { adjust: { roughness: 0.9, normalStrength: 0.2 } } });
    expect(programKey(other)).toBe(programKey(base()));
  });
  it('differs when the generated GLSL differs', () => {
    expect(programKey({ ...base(), flags: { vertexColour: 'aoMultiply' } })).not.toBe(programKey(base()));
  });
});

describe('the surface program', () => {
  it('reads the albedo by the family and registers the surface, focus and sun uniforms', () => {
    const shader = composedSurface(surface('standard', { maps: { albedo: map('A', true) }, parameters: { adjust: { normalStrength: 0.5 } } }));
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>'); expect(shader.fragmentShader).toContain('surfaceStandardBlend');
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect((uniforms.surface_scale_albedo.value as Vector2).toArray()).toEqual([2, 3]);
    expect((uniforms.surface_normalScale.value as Vector2).toArray()).toEqual([0.5, -1]);
    // The alpha cut, the emission switch and the sun are the scene and pass blocks' members, never the material's uniforms.
    for (const name of ['surface_alphaCut', 'surface_emission', 'lit_sunDirection']) expect(uniforms).not.toHaveProperty(name);
    expect(shader.uniformsGroups).toEqual(SCENE_BLOCK_GROUPS);
    expect(uniforms).toHaveProperty('focus_surface_albedo');
    expect(shader.fragmentShader).toContain('focusTexture(surface_albedo, focus_surface_albedo, (surfaceUv(surface_uv_albedo) * surface_scale_albedo))');
    expect(shader.vertexShader).toContain('vSurfaceColour = _lmu_colour;');
    expect(shader.vertexShader).toContain('attribute vec4 _lmu_colour;');
    // A car part without the package's vertex colour reads white.
    const config = surface('standard', { maps: { albedo: map('A', true) } });
    expect(surfaceFamilyPart(config, shaderParts(config, { uniforms: true }), {}, false).slots.vertexPars?.glsl).toContain('const vec4 _lmu_colour = vec4(1.0);');
  });
  it('cuts by the pass block alpha cut scale, reflects by the package rule and takes the halved ambient lookup', () => {
    const shader = composedSurface(surface('standard', { maps: { albedo: map('A', true) } })).fragmentShader;
    expect(shader).toContain('if (diffuseColor.a < alphaTest * surface_alphaCut || diffuseColor.a == 0.0) discard;');
    expect(shader).toContain('surfaceIndirectSpecular(');
    expect(shader.indexOf('surfaceReflectionSpecular=surfaceSpecular;')).toBeLessThan(shader.indexOf('surfaceCascadeShadow( - vViewPosition.z )'));
    expect(shader).toContain('getIBLIrradiance( transformDirection( inverseTransformDirection( geometryNormal, viewMatrix ) * vec3( 1.0, 0.5, 1.0 ), viewMatrix ) )');
    expect(composedSurface(surface('glass', { maps: { albedo: map('A', true) } })).fragmentShader).not.toContain('surfaceIndirectSpecular(');
  });
  it('lights the glass glint by the scene sun', () => {
    const glass = composedSurface(surface('glass', { maps: { albedo: map('A', true) } })).fragmentShader;
    expect(glass).toContain('glintL = normalize((viewMatrix * vec4(lit_sunDirection, 0.0)).xyz)'); expect(glass).not.toContain('directionalLights[');
  });
});it('draws a blended two-sided surface once, both sides in one pass, but glass back faces first', async () => {
  const configured = async (config: SurfaceConfig) => {
    const material = new MeshStandardMaterial({transparent: true, depthWrite: false, side: DoubleSide});
    material.userData = holder(config);
    const mesh = new Mesh(new BufferGeometry(), material);
    await configureSurfaceMaterial(mesh, {load: () => Promise.resolve(new Texture())}, createSharedSurfaceMaterials());
    expect(mesh.material).not.toBe(material);
    return mesh.material;
  };
  const lines = await configured(surface('standard'));
  expect([lines.transparent, lines.side, lines.forceSinglePass]).toEqual([true, DoubleSide, true]);
  // Panes overlap within one glass mesh, so the far ones blend first: three's back-then-front passes stay.
  const glass = await configured(surface('glass', {maps: {albedo: map('glass')}}));
  expect([glass.transparent, glass.side, glass.forceSinglePass]).toEqual([true, DoubleSide, false]);
});

it('casts a foliage card from both sides, and leaves the other cut-outs to the caster pass', async () => {
  const configured = async (config: SurfaceConfig) => {
    const material = new MeshStandardMaterial({alphaTest: 0.5});
    material.userData = holder(config);
    const mesh = new Mesh(new BufferGeometry(), material);
    await configureSurfaceMaterial(mesh, {load: () => Promise.resolve(new Texture())}, createSharedSurfaceMaterials());
    return mesh.material;
  };
  expect((await configured(surface('vegetation', {maps: {albedo: map('A', true)}}))).shadowSide).toBe(DoubleSide);
  expect((await configured(surface('standard', {maps: {albedo: map('fence', true)}}))).shadowSide).toBeNull();
});

it('shares one configured material among meshes of the same surface, textures and GLB state, disposed with the set', async () => {
  const shared = createSharedSurfaceMaterials(), grass = new Texture(), gravel = new Texture();
  const configured = async (texture: Texture, glb: Partial<MeshStandardMaterial> = {}, packageKey = 'fb81305939eff0a5') => {
    const material = Object.assign(new MeshStandardMaterial(), glb);
    material.userData = {...holder(surface('standard', {maps: {albedo: map('ground')}})), lmuMaterial: packageKey};
    const mesh = new Mesh(new BufferGeometry().setAttribute(TRACK_LIGHT_ATTRIBUTE, new BufferAttribute(new Uint8Array(4), 4, true)), material);
    prepareSceneryMesh(mesh);
    await configureSurfaceMaterial(mesh, {load: () => Promise.resolve(texture)}, shared);
    return mesh;
  };
  const [first, second, differentTexture, differentBlend] = [await configured(grass), await configured(grass), await configured(gravel), await configured(grass, {transparent: true})];
  const {material: a} = first, {material: b} = second, {material: other} = differentTexture, {material: blended} = differentBlend;
  expect(a).toBe(b); expect(other).not.toBe(a); expect(blended).not.toBe(a);
  const otherBatch = await configured(grass, {}, '1b81305939eff0a5');
  expect(otherBatch.material).toBe(a);
  expect(first.userData.lmuMaterial).toBe('fb81305939eff0a5');
  expect(otherBatch.userData.lmuMaterial).toBe('1b81305939eff0a5');
  expect(shared.owns(a)).toBe(true); expect(shared.owns(new MeshStandardMaterial())).toBe(false);
  let disposed = 0, texturesFreed = 0; a.addEventListener('dispose', () => { disposed++; }); grass.addEventListener('dispose', () => { texturesFreed++; });
  shared.dispose();
  expect([disposed, shared.owns(a)]).toEqual([1, false]);
  // The textures belong to the pool, not the shared material.
  expect(texturesFreed).toBe(0);
});

describe('shared surface programs', () => {
  it('gives materials that differ only in values one program, and a different shape its own', () => {
    const at = (roughness: number, maps: Record<string, ReturnType<typeof map>> = { albedo: map('A', true) }) =>
      surface('dashboard', { maps, parameters: { dashboard: { roughness, emissiveStrength: 9, emissiveNight: 1 } } });
    expect(programKey(at(0.4))).toBe(programKey(at(0.7)));
    expect(programKey(at(0.4))).not.toBe(programKey(at(0.4, {})));
  });
});
