import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { crownSun } from '../../../../../src/components/replay/view3d/scenery/materials/foliageCrown.js';
import { billboardShadowMaterial, computeCustomProgramCacheKey, patchSurfaceShader } from '../../../../../src/components/replay/view3d/scenery/materials/patchSurfaceShader.js';
import { trackShadowEye } from '../../../../../src/components/replay/view3d/scenery/materials/shadowEye.js';
import { sceneryReflectionUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { staticShadowUniforms } from '../../../../../src/components/replay/view3d/sunShadows.js';
import { surfaceAlphaCut } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import { shaderParts } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
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
    const parts = shaderParts(surface('diffuse', { maps: { albedo: map('A', true, 'worldPlanar') } }));
    expect(parts.albedo).toContain('vSurfaceXZ * surface_scale_albedo');
  });
  it('drives the luminous kinds by emission only, with their native multipliers', () => {
    const maps = { albedo: map('A', true) };
    expect(shaderParts(surface('highLumSun', { maps })).emissive).toBe('lum.rgb*500.0*lum.a');
    expect(shaderParts(surface('highLumTrackside', { maps })).emissive).toBe('lum.rgb*100.0*lum.a');
    expect(shaderParts(surface('lowLumEmissive', { maps })).emissive).toBe('lum.rgb*20.0*clamp(vSurfaceColour.rgb,0.0,1.0)*lum.a');
    expect(shaderParts(surface('highLumSun', { maps })).albedo).toContain('diffuseColor.rgb=vec3(0.0)');
  });
  it('reads the dashboard controls and ignores vertex colour only for the diffuse shader without it', () => {
    const dash = shaderParts(surface('dashboard', { maps: { albedo: map('A', true) }, parameters: { dashboard: { roughness: 0.4, emissiveStrength: 9 } } }));
    expect(dash.albedo).toContain('surfaceRoughness=0.40000000'); expect(dash.emissive).toBe('diffuseColor.rgb*9.00000000');
    expect(shaderParts(surface('diffuse', { vertexColour: false, maps: { albedo: map('A', true) } })).albedo).not.toContain('*vSurfaceColour');
    expect(shaderParts(surface('diffuse', { maps: { albedo: map('A', true) } })).albedo).toContain('*vSurfaceColour');
  });
  it('adds the blink clock for digital flags and keeps the authored period', () => {
    const parts = shaderParts(surface('digitalFlag', { maps: { on: map('ON', true), off: map('OFF', true) }, parameters: { blink: { period: 0.5 } } }));
    expect(parts.declarations).toContain('uniform float surface_flag_elapsed;'); expect(parts.albedo).toContain('3.141592653589793/0.50000000');
  });
  it('widens the water roughness by the screen-space spread of the wave normal', () => {
    const water = shaderParts(surface('water', { maps: { albedo: map('A', true), normalA: map('N', false) } }));
    expect(water.normals).toContain('dFdx(normal)'); expect(water.normals).toContain('roughnessFactor = sqrt(');
    expect(shaderParts(surface('water', { maps: { albedo: map('A', true) } })).normals).toBe('');
  });
  it('samples the alpha-composited glass finish and the clearcoat absorption', () => {
    expect(shaderParts(surface('glass', { maps: { albedo: map('A', true) } })).finish).toContain('totalSpecular/clamp(diffuseColor.a+0.001');
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

describe('computeCustomProgramCacheKey', () => {
  const base = () => surface('standard', { maps: { albedo: map('A', true), normal: map('N') }, parameters: { adjust: { roughness: 0.3 } } });
  it('is shared by materials that differ only in tunables, scales and texture names', () => {
    const other = surface('standard', { maps: { albedo: { ...map('OTHER', true), scale: [9, 9] }, normal: map('N2') }, parameters: { adjust: { roughness: 0.9, normalStrength: 0.2 } } });
    expect(computeCustomProgramCacheKey(other)).toBe(computeCustomProgramCacheKey(base()));
  });
  it('differs when the generated GLSL or a vertex hook differs', () => {
    const key = computeCustomProgramCacheKey(base());
    expect(computeCustomProgramCacheKey({ ...base(), flags: { vertexColour: 'aoMultiply' } })).not.toBe(key);
    expect(computeCustomProgramCacheKey({ ...base(), billboard: true })).not.toBe(key);
    expect(key.startsWith('standard_')).toBe(true);
  });
  it('keys the leaf translucency curve, which is baked into the program', () => {
    const tree = (power: number) => surface('vegetation', { flags: { translucency: 'on' }, maps: { albedo: map('A', true) }, parameters: { translucency: { power } } });
    expect(computeCustomProgramCacheKey(tree(2))).not.toBe(computeCustomProgramCacheKey(tree(3)));
  });
});

describe('patchSurfaceShader', () => {
  const vertex = '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <shadowmap_vertex>';
  const fragment = ['common', 'map_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_maps', 'lights_physical_fragment', 'aomap_fragment', 'emissivemap_fragment', 'normal_fragment_begin', 'lights_physical_pars_fragment', 'shadowmap_pars_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'opaque_fragment']
    .map(chunk => `#include <${chunk}>`).join('\n');
  const depthVertex = ['common', 'begin_vertex', 'project_vertex'].map(chunk => `#include <${chunk}>`).join('\n');
  const patched = (config: SurfaceConfig) => {
    const shader = { uniforms: {}, vertexShader: vertex, fragmentShader: fragment } as unknown as Parameters<typeof patchSurfaceShader>[0];
    const own = { surface_albedo: { value: 'tex' } };
    patchSurfaceShader(shader, config, own);
    return shader;
  };

  it('replaces the albedo include and registers scale, tunable and caller uniforms', () => {
    const shader = patched(surface('standard', { maps: { albedo: map('A', true) }, parameters: { adjust: { normalStrength: 0.5 } } }));
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>'); expect(shader.fragmentShader).toContain('surfaceStandardBlend');
    expect(shader.uniforms).toHaveProperty('surface_albedo');
    expect((shader.uniforms as Record<string, { value: Vector2 }>).surface_scale_albedo.value.toArray()).toEqual([2, 3]);
    expect((shader.uniforms as Record<string, { value: Vector2 }>).surface_normalScale.value.toArray()).toEqual([0.5, -1]);
    expect(shader.vertexShader).toContain('vSurfaceColour = _lmu_colour;');
  });
  it('cuts a cut-out by the shared alpha cut scale, so the multisampled scene pass can leave the cut to coverage', () => {
    const shader = { uniforms: {}, vertexShader: vertex, fragmentShader: `#include <alphatest_pars_fragment>\n${fragment}\n#include <alphatest_fragment>` } as unknown as Parameters<typeof patchSurfaceShader>[0];
    patchSurfaceShader(shader, surface('standard', { maps: { albedo: map('A', true) } }), {});
    expect(shader.fragmentShader).not.toContain('#include <alphatest_fragment>');
    expect(shader.fragmentShader).toContain('if (diffuseColor.a < alphaTest * surface_alphaCut || diffuseColor.a == 0.0) discard;');
    expect(shader.fragmentShader).toContain('uniform float surface_alphaCut;');
    expect((shader.uniforms as Record<string, unknown>).surface_alphaCut).toBe(surfaceAlphaCut);
    expect(surfaceAlphaCut.value).toBe(1);
  });
  it('makes billboards camera-facing in the vertex stage only when the config says so', () => {
    const tree = surface('vegetation', { maps: { albedo: map('A', true) } });
    expect(patched(tree).vertexShader).not.toContain('_lmu_pivot');
    const billboard = patched({ ...tree, billboard: true });
    expect(billboard.vertexShader).toContain('attribute vec3 _lmu_pivot;'); expect(billboard.vertexShader).toContain('directionToCamera');
    // The card's normal turns with it toward the camera; the rest-plane normal faced whole crowds away from the sun.
    expect(billboard.vertexShader).toContain('objectNormal = normalize(normalize(toEye) * mat3(modelMatrix));');
    // Leaves keep the card's own normal (fronds facing away from the sun stay shaded), not a world-up normal.
    expect(billboard.fragmentShader).not.toContain('vec3(0.0,1.0,0.0));');
    // A card skips its own plane in both sun shadow lookups (1 m of the near map's 799 m depth, 4 m of the static map's 1,999 m);
    // other cards and objects still shade it.
    expect(billboard.vertexShader).toContain('vDirectionalShadowCoord[ 0 ].z -= 0.00125156');
    expect(billboard.vertexShader).toContain('vStaticShadowCoord.z -= 0.00200100');
    expect(patched(tree).vertexShader).not.toContain('vDirectionalShadowCoord');
    // Leaf cards light with a crown-shaped normal: sideways by the corner's side, up above a metre and less so facing the sun; never down.
    expect(billboard.vertexShader).toContain('uniform vec3 surface_crownSun;'); expect(billboard.vertexShader).toContain('vec3 crownNormal = facing + across * side + vec3(0.0, up, 0.0);');
    expect(billboard.vertexShader).toContain('float up = clamp(2.0 * clamp(_lmu_corner.y, 0.0, 1.0) - 1.0, 0.0, 1.0) * clamp(1.0 - dot(facing, surface_crownSun), 0.0, 1.0);');
    expect((billboard.uniforms as Record<string, unknown>).surface_crownSun).toBe(crownSun);
    // Crowd cards keep the camera-facing normal: lit as seen, not as sunlit tops.
    const crowd = surface('standard', { maps: { albedo: map('A', true) }, billboard: true });
    expect(patched(crowd).fragmentShader).not.toContain('vec3(0.0,1.0,0.0));');
    expect(patched(crowd).vertexShader).not.toContain('crownNormal'); expect(patched(crowd).uniforms).not.toHaveProperty('surface_crownSun');
  });
  it("takes ambient light with the normal's height halved, and reflects by the package's rule except on glass and clear coat", () => {
    const shader = patched(surface('standard', { maps: { albedo: map('A', true) } }));
    expect(shader.fragmentShader).toContain('getIBLIrradiance( normalize( geometryNormal * vec3( 1.0, 0.5, 1.0 ) ) )');
    expect(shader.fragmentShader).not.toContain('getIBLIrradiance( geometryNormal )');
    // The venue's convolved cube at lodScale × roughness, the split-sum table at (N·V, roughness), the family's inputs set before the lights.
    expect(shader.fragmentShader).toContain('#define RE_IndirectSpecular surfaceIndirectSpecular');
    expect(shader.fragmentShader).toContain('textureLod(surface_reflection, r, surface_reflectionLodScale * roughness)');
    expect(shader.fragmentShader).toContain('mix(vec3(surfaceReflectionSpecular * (split.y + surface_dielectricF0 * split.x)), mix(surfaceReflectionAlbedo, vec3(1.0), split.y), material.metalness)');
    expect(shader.fragmentShader.indexOf('surfaceReflectionSpecular=surfaceSpecular;')).toBeLessThan(shader.fragmentShader.indexOf('surfaceSunShadow( getShadow('));
    expect(shader.uniforms.surface_reflection).toBe(sceneryReflectionUniforms.surface_reflection);
    for (const kind of ['glass', 'clearcoat'] as const) expect(patched(surface(kind, { maps: { albedo: map('A', true) } })).fragmentShader).not.toContain('surfaceIndirectSpecular');
  });
  it('shades terrain by its baked shadow on the sun as well as the ambient', () => {
    const terrain = patched(surface('terrain', { maps: { layerA: map('A', true), splatter: map('S') }, flags: { layers: '1' } }));
    expect(terrain.fragmentShader).toContain('surfaceBakedShadow=splatter.a;');
    expect(terrain.fragmentShader).toContain('min(( UNROLLED_LOOP_INDEX == 0 ? surfaceSunShadow(');
    expect(terrain.fragmentShader).toContain(', surfaceBakedShadow)');
    expect(patched(surface('standard', { maps: { albedo: map('A', true) } })).fragmentShader).not.toContain(', surfaceBakedShadow)');
  });
  it('turns shadow-pass cards toward the viewing camera, so a card shades what is drawn', () => {
    const material = billboardShadowMaterial();
    expect(billboardShadowMaterial()).toBe(material);
    const shader = { uniforms: {}, vertexShader: depthVertex, fragmentShader: '' } as unknown as Parameters<typeof patchSurfaceShader>[0];
    material.onBeforeCompile(shader, undefined as never);
    expect(shader.vertexShader).toContain('vec3 directionToCamera = surface_shadowEye - pivotWorld;');
    trackShadowEye(null, null, Object.assign(new PerspectiveCamera(), { matrixWorld: new Matrix4().makeTranslation(3, 4, 5) }));
    expect((shader.uniforms as Record<string, { value: Vector3 }>).surface_shadowEye.value.toArray()).toEqual([3, 4, 5]);
  });
  it('declares only the extra UV attributes its maps need', () => {
    expect(patched(surface('standard', { maps: { albedo: map('A', true, 'uv1') } })).vertexShader).toContain('attribute vec2 uv1;');
    expect(patched(surface('standard', { maps: { albedo: map('A', true) } })).vertexShader).toContain('vec2 uv1 = vec2(0.0);');
  });
  it('hooks leaf translucency into the lighting only for flagged vegetation', () => {
    const tree = surface('vegetation', { maps: { albedo: map('A', true) }, flags: { translucency: 'on' }, parameters: { translucency: { power: 3, scale: 4 } } });
    expect(patched(tree).fragmentShader).toContain('#define RE_Direct surfaceLeafDirect');
    expect(patched(tree).fragmentShader).toContain('3.00000000');
    expect(patched({ ...tree, flags: {} }).fragmentShader).not.toContain('surfaceLeafDirect');
  });
  it('doubles the sun shadow term on leaves', () => {
    const tree = surface('vegetation', { maps: { albedo: map('A', true) } });
    expect(patched(tree).fragmentShader).toContain('min(2.0 * ( UNROLLED_LOOP_INDEX == 0 ? surfaceSunShadow( getShadow( directionalShadowMap[ i ]');
    // Every surface reads the sun's shadow from the near map, fading to the static map at the near window's edge.
    const road = patched(surface('standard', { maps: { albedo: map('A', true) } })).fragmentShader;
    expect(road).toContain('( UNROLLED_LOOP_INDEX == 0 ? surfaceSunShadow( getShadow('); expect(road).not.toContain('min(2.0 *');
    expect(road).toContain('float surfaceSunShadow( float nearShadow, vec4 nearCoord )');
    expect(road).toContain('texture( surface_staticShadowMap, coord )');
    // Every surface reads the one static map through shared uniforms, its coordinate offset along the normal by ~1.3 texels.
    const roadShader = patched(surface('standard', { maps: { albedo: map('A', true) } }));
    expect(roadShader.uniforms.surface_staticShadowMap).toBe(staticShadowUniforms.map);
    expect(roadShader.uniforms.surface_staticShadowMatrix).toBe(staticShadowUniforms.matrix);
    expect(roadShader.vertexShader).toContain('vStaticShadowCoord = surface_staticShadowMatrix * ( worldPosition + vec4( shadowWorldNormal * 0.38085938');
  });
  it('shares the digital flag clock uniform object', () => {
    const shader = patched(surface('digitalFlag', { maps: { on: map('ON', true), off: map('OFF', true) } }));
    expect(shader.uniforms).toHaveProperty('surface_flag_elapsed');
  });
});
