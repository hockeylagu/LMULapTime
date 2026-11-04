import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import { computeCustomProgramCacheKey, patchSurfaceShader } from '../../../../../src/components/replay/view3d/scenery/materials/patchSurfaceShader.js';
import { shaderParts } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import { readSurfaceConfig, SURFACE_KINDS, terrainLayerCount, textureAsset, type SurfaceConfig, type SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { imageUriMap, resolveMapUri } from '../../../../../src/components/replay/view3d/scenery/materials/textureSource.js';

const map = (texture: string, srgb = false, uv: SurfaceMap['uv'] = 'UV_A'): SurfaceMap => ({ texture, uv, scale: [2, 3], srgb });
function surface(kind: SurfaceConfig['kind'], over: Partial<SurfaceConfig> = {}): SurfaceConfig {
  return { version: 3, kind, name: `test_${kind}`, shader: 'TEST', flags: {}, parameters: {}, maps: {}, normalYSign: -1, ...over };
}
const holder = (config: unknown) => ({ lmuSurface: config }) as Record<string, unknown>;

describe('readSurfaceConfig', () => {
  it('leaves a material without a surface description alone', () => { expect(readSurfaceConfig({})).toBeNull(); });
  it('accepts a schema-3 surface of every known kind', () => {
    for (const kind of SURFACE_KINDS) expect(readSurfaceConfig(holder(surface(kind)))?.kind).toBe(kind);
  });
  it('throws for another schema version, an unknown kind or an unsupported UV set', () => {
    expect(() => readSurfaceConfig(holder({ ...surface('terrain'), version: 2 }))).toThrow('Unsupported private surface material');
    expect(() => readSurfaceConfig(holder({ ...surface('terrain'), kind: 'hologram' }))).toThrow('Unsupported source shader family: hologram');
    expect(() => readSurfaceConfig(holder(surface('standard', { maps: { albedo: map('A', true, 'UV_Z' as 'UV_A') } })))).toThrow('Unsupported shader UV');
    expect(() => readSurfaceConfig(holder({ version: 3, kind: 'standard', name: 'x' }))).toThrow('Incomplete surface material');
  });
});

describe('terrain layers', () => {
  it('reads ALBEDOMAPS with a default of three and rejects other counts', () => {
    expect(terrainLayerCount({})).toBe(3); expect(terrainLayerCount({ ALBEDOMAPS: '4' })).toBe(4);
    expect(terrainLayerCount({ ALBEDOMAPS: '5' })).toBeNull(); expect(terrainLayerCount({ ALBEDOMAPS: 'x' })).toBeNull();
  });
  it('picks the layer weights of the configured count', () => {
    const maps = { layerA: map('A', true), layerB: map('B', true) };
    expect(shaderParts(surface('terrain', { maps, flags: { ALBEDOMAPS: '2' } })).albedo).toContain('surfaceWeights = vec4(1.0-blend.r, blend.r, 0.0, 0.0);');
    expect(shaderParts(surface('terrain', { maps, flags: { ALBEDOMAPS: '4' } })).albedo).toContain('blend.g*(1.0-blend.b), blend.b)');
  });
  it('applies non-white terrain tint once instead of multiplying the already tinted diffuse colour again', () => {
    const config = surface('terrain', {maps: {layerA: map('A', true)}, flags: {ALBEDOMAPS: '1'},
      parameters: {Material_Adjust: {AlbedoTint: [0.5, 0.75, 1]}}});
    const uniform = shaderParts(config, {uniforms: true}).albedo;
    expect(uniform).toContain('diffuseColor.rgb = ground.rgb * diffuse;');
    expect(uniform).not.toContain('diffuseColor.rgb *= ground.rgb * diffuse;');
    expect(shaderParts(config, {uniforms: false}).albedo).toContain('ground.rgb * vec3(0.50000000,0.75000000,1.00000000) * vec3(0.50000000,0.75000000,1.00000000)');
  });
});

describe('texture resolution', () => {
  it('names an image by stem and colour role', () => {
    expect(textureAsset('ROAD_ALB', true)).toBe('ROAD_ALB__srgb.ktx2'); expect(textureAsset('ROAD_NRM', false)).toBe('ROAD_NRM__linear.ktx2');
    expect(() => textureAsset('a/b', true)).toThrow('Invalid source texture stem');
  });
  it('maps a declared image to its content-named file and throws for an undeclared one', () => {
    const uris = imageUriMap({ images: [{ name: 'ROAD_ALB__srgb.ktx2', uri: 'textures/abc.ktx2' }, { name: 'nameless' }] });
    expect(uris.size).toBe(1);
    expect(resolveMapUri(map('ROAD_ALB', true), uris)).toBe('textures/abc.ktx2');
    expect(() => resolveMapUri(map('ROAD_ALB', false), uris)).toThrow('ROAD_ALB__linear.ktx2 is not declared');
  });
});

describe('shaderParts', () => {
  it('declares one sampler and scale uniform per map, sorted, and samples through the scale uniform', () => {
    const parts = shaderParts(surface('standard', { maps: { normal: map('N'), albedo: map('A', true) } }));
    expect(parts.declarations.indexOf('surface_albedo;')).toBeLessThan(parts.declarations.indexOf('surface_normal;'));
    expect(parts.declarations).toContain('uniform vec2 surface_scale_normal;');
    expect(parts.albedo).toContain('texture2D(surface_albedo, (vSurfaceUV01.xy * surface_scale_albedo))');
    expect(parts.normals).toContain('surfaceNormalVector(normal,(vSurfaceUV01.xy * surface_scale_normal)');
  });
  it('bakes constants instead of uniforms when asked', () => {
    const parts = shaderParts(surface('standard', { maps: { albedo: map('A', true) } }), { uniforms: false });
    expect(parts.declarations).not.toContain('surface_scale_albedo'); expect(parts.albedo).toContain('vec2(2.00000000,3.00000000)');
  });
  it('selects the UV expression by the map UV set', () => {
    const parts = shaderParts(surface('diffuse', { maps: { albedo: map('A', true, 'WorldPlanar') } }));
    expect(parts.albedo).toContain('vSurfaceXZ * surface_scale_albedo');
  });
  it('drives the luminous kinds by emission only, with their native multipliers', () => {
    const maps = { albedo: map('A', true) };
    expect(shaderParts(surface('highLumSun', { maps })).emissive).toBe('lum.rgb*500.0*lum.a');
    expect(shaderParts(surface('highLumTrackside', { maps })).emissive).toBe('lum.rgb*100.0*lum.a');
    expect(shaderParts(surface('lowLumEmissive', { maps })).emissive).toBe('lum.rgb*20.0*clamp(vSurfaceColour.rgb,0.0,1.0)*lum.a');
    expect(shaderParts(surface('highLumSun', { maps })).albedo).toContain('diffuseColor.rgb=vec3(0.0)');
  });
  it('reads the dashboard controls from the flat parameters and ignores vertex colour only for the diffuse shader without it', () => {
    const dash = shaderParts(surface('dashboard', { maps: { albedo: map('A', true) }, parameters: { BaseRoughness: 0.4, EmissiveDayIntensity: 9 } as unknown as SurfaceConfig['parameters'] }));
    expect(dash.albedo).toContain('surfaceRoughness=0.40000000'); expect(dash.emissive).toBe('diffuseColor.rgb*9.00000000');
    expect(shaderParts(surface('diffuse', { vertexColour: false, maps: { albedo: map('A', true) } })).albedo).not.toContain('*vSurfaceColour');
    expect(shaderParts(surface('diffuse', { maps: { albedo: map('A', true) } })).albedo).toContain('*vSurfaceColour');
  });
  it('adds the blink clock for digital flags and keeps the authored period', () => {
    const parts = shaderParts(surface('digitalFlag', { maps: { on: map('ON', true), off: map('OFF', true) }, parameters: { cbIntensity: { PeriodSeconds: 0.5 } } }));
    expect(parts.declarations).toContain('uniform float surface_flag_elapsed;'); expect(parts.albedo).toContain('3.141592653589793/0.50000000');
  });
  it('samples the alpha-composited glass finish and the clearcoat absorption', () => {
    expect(shaderParts(surface('glass', { maps: { albedo: map('A', true) } })).finish).toContain('totalSpecular/clamp(diffuseColor.a+0.001');
    const coat = { Roughness: 0.2, RefractiveIndex: 1.4, Specular: 0.5, NormalStrength: 1, Strength: 1, LacquerThickness: 0.03, LacquerColour: [1, 1, 1] };
    const clearcoat = shaderParts(surface('clearcoat', { maps: { albedo: map('A', true) }, parameters: { BaseCoat: coat, ClearCoat: coat } }));
    expect(clearcoat.absorption).toContain('surface_coatLacquerColour'); expect(clearcoat.physical).toContain('material.clearcoatF0');
  });
  it('throws for malformed or unsupported sources instead of substituting', () => {
    expect(() => shaderParts(surface('clearcoat', { maps: { albedo: map('A', true) } }))).toThrow('Missing clearcoat controls');
    expect(() => shaderParts(surface('standardBlend', { flags: { BLENDMASK: 'Nonsense' } }))).toThrow('Unsupported source blend mask Nonsense');
    expect(() => shaderParts(surface('standardBlend', { flags: { ALBEDOFUNCTION: 'Dither' } }))).toThrow('Unsupported StandardBlend albedo function: Dither');
    expect(() => shaderParts(surface('roadDecal'))).toThrow('Road decal albedo atlas is required');
    expect(() => shaderParts(surface('clearcoat', { maps: { albedo: map('A', true), detail: map('D') }, flags: { DETAILALBEDO: 'Overlay' }, parameters: { BaseCoat: { Roughness: 1, RefractiveIndex: 1, Specular: 1, NormalStrength: 1 }, ClearCoat: { Roughness: 1, RefractiveIndex: 1, Specular: 1, NormalStrength: 1, Strength: 1 } } }))).toThrow('Unimplemented clearcoat detail blend');
  });
  it('enters road, kerb and standard through their own families', () => {
    expect(shaderParts(surface('road', { maps: { albedo: map('A', true) } })).physical).toContain('0.05'); // F0 of IOR 1.635
    expect(shaderParts(surface('kerb', { maps: { albedo: map('A', true) } })).albedo).toContain('surfaceAltBlend=1.0-sourceBlend');
    expect(shaderParts(surface('standard', { maps: { albedo: map('A', true) } })).occlusion).toBe('');
    expect(shaderParts(surface('standard', { maps: { albedo: map('A', true), aoSpec: map('AO') } })).occlusion).toBe('reflectedLight.indirectSpecular*=aoSpec.r;');
  });
});

describe('computeCustomProgramCacheKey', () => {
  const base = () => surface('standard', { maps: { albedo: map('A', true), normal: map('N') }, parameters: { Material_Adjust: { Roughness: 0.3 } } });
  it('is shared by materials that differ only in tunables, scales and texture names', () => {
    const other = surface('standard', { maps: { albedo: { ...map('OTHER', true), scale: [9, 9] }, normal: map('N2') }, parameters: { Material_Adjust: { Roughness: 0.9, NormalIntensity: 0.2 } } });
    expect(computeCustomProgramCacheKey(other)).toBe(computeCustomProgramCacheKey(base()));
  });
  it('differs when the generated GLSL or a vertex hook differs', () => {
    const key = computeCustomProgramCacheKey(base());
    expect(computeCustomProgramCacheKey({ ...base(), flags: { VERTEXCOLOR: 'AoMultiply' } })).not.toBe(key);
    expect(computeCustomProgramCacheKey({ ...base(), billboard: true })).not.toBe(key);
    expect(key.startsWith('standard_')).toBe(true);
  });
  it('keys the leaf translucency curve, which is baked into the program', () => {
    const tree = (power: number) => surface('vegetation', { flags: { TRANSLUCENCY: 'On' }, maps: { albedo: map('A', true) }, parameters: { Translucency: { Power: power } } });
    expect(computeCustomProgramCacheKey(tree(2))).not.toBe(computeCustomProgramCacheKey(tree(3)));
  });
});

describe('patchSurfaceShader', () => {
  const vertex = '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>';
  const fragment = ['common', 'map_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_maps', 'lights_physical_fragment', 'aomap_fragment', 'emissivemap_fragment', 'normal_fragment_begin', 'lights_physical_pars_fragment', 'opaque_fragment']
    .map(chunk => `#include <${chunk}>`).join('\n');
  const patched = (config: SurfaceConfig) => {
    const shader = { uniforms: {}, vertexShader: vertex, fragmentShader: fragment } as unknown as Parameters<typeof patchSurfaceShader>[0];
    const own = { surface_albedo: { value: 'tex' } };
    patchSurfaceShader(shader, config, own);
    return shader;
  };

  it('replaces the albedo include and registers scale, tunable and caller uniforms', () => {
    const shader = patched(surface('standard', { maps: { albedo: map('A', true) }, parameters: { Material_Adjust: { NormalIntensity: 0.5 } } }));
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>'); expect(shader.fragmentShader).toContain('surfaceStandardBlend');
    expect(shader.uniforms).toHaveProperty('surface_albedo');
    expect((shader.uniforms as Record<string, { value: Vector2 }>).surface_scale_albedo.value.toArray()).toEqual([2, 3]);
    expect((shader.uniforms as Record<string, { value: Vector2 }>).surface_normalScale.value.toArray()).toEqual([0.5, -1]);
    expect(shader.vertexShader).toContain('vSurfaceColour = _lmu_colour;');
  });
  it('makes billboards camera-facing in the vertex stage only when the config says so', () => {
    const tree = surface('vegetation', { maps: { albedo: map('A', true) }, flags: { BILLBOARD: 'Pointy' } });
    expect(patched(tree).vertexShader).not.toContain('_lmu_pivot');
    const billboard = patched({ ...tree, billboard: true });
    expect(billboard.vertexShader).toContain('attribute vec3 _lmu_pivot;'); expect(billboard.vertexShader).toContain('directionToCamera');
    // The card's normal turns with it toward the camera; the rest-plane normal faced whole crowds away from the sun.
    expect(billboard.vertexShader).toContain('vec3 objectNormal = facingCamera ?'); expect(billboard.vertexShader).not.toContain('#include <beginnormal_vertex>');
    expect(billboard.fragmentShader).toContain('normal = normalize(mat3(viewMatrix) * vec3(0.0,1.0,0.0));');
  });
  it('declares only the extra UV attributes its maps need', () => {
    expect(patched(surface('standard', { maps: { albedo: map('A', true, 'UV_B') } })).vertexShader).toContain('attribute vec2 uv1;');
    expect(patched(surface('standard', { maps: { albedo: map('A', true) } })).vertexShader).toContain('vec2 uv1 = vec2(0.0);');
  });
  it('hooks leaf translucency into the lighting only for flagged vegetation', () => {
    const tree = surface('vegetation', { maps: { albedo: map('A', true) }, flags: { TRANSLUCENCY: 'On' }, parameters: { Translucency: { Power: 3, Scale: 4 } } });
    expect(patched(tree).fragmentShader).toContain('#define RE_Direct surfaceLeafDirect');
    expect(patched(tree).fragmentShader).toContain('3.00000000');
    expect(patched({ ...tree, flags: {} }).fragmentShader).not.toContain('surfaceLeafDirect');
  });
  it('shares the digital flag clock uniform object', () => {
    const shader = patched(surface('digitalFlag', { maps: { on: map('ON', true), off: map('OFF', true) } }));
    expect(shader.uniforms).toHaveProperty('surface_flag_elapsed');
  });
});
