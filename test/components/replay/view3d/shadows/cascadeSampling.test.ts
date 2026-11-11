import { DepthTexture, Matrix4, ShaderLib, Vector4, type Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { patchSurfaceShader } from '../../../../../src/components/replay/view3d/scenery/materials/patchSurfaceShader.js';
import { readSurfaceConfig, type SurfaceConfig } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { cascadeDepthRangeM } from '../../../../../src/components/replay/view3d/shadows/cascadeShadows.js';
import { cascadeShadowUniforms, patchCascadeShadow, stopCascadeShadows, sampleCascadeShadows, SUN_SHADOW_TERM } from '../../../../../src/components/replay/view3d/shadows/cascadeSampling.js';
import { staticShadowUniforms } from '../../../../../src/components/replay/view3d/sunShadows.js';
import { shadowCascadeLayout } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';
import { surface } from '../scenery/surfaceFixture.js';

const {shadows} = testShading();
const layout = shadowCascadeLayout(shadows, shadows.cameras.chase);
const state = () => ({
  // Two 64 px atlases stacked.
  atlas: new DepthTexture(64, 128),
  matrices: layout.cascades.map(() => new Matrix4()),
  tiles: layout.cascades.map((_, i) => new Vector4(i, 0, 0, 0.5)),
});

const VERTEX = ['common', 'beginnormal_vertex', 'begin_vertex', 'shadowmap_pars_vertex', 'shadowmap_vertex'].map(chunk => `#include <${chunk}>`).join('\n');
const FRAGMENT = ['common', 'map_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_maps', 'lights_physical_fragment',
  'aomap_fragment', 'emissivemap_fragment', 'lights_physical_pars_fragment', 'shadowmap_pars_fragment', 'lights_fragment_begin', 'opaque_fragment']
  .map(chunk => `#include <${chunk}>`).join('\n');
function patched(config: SurfaceConfig) {
  const shader = { uniforms: {}, vertexShader: VERTEX, fragmentShader: FRAGMENT } as unknown as Parameters<typeof patchSurfaceShader>[0];
  patchSurfaceShader(shader, config, {});
  return shader;
}

afterEach(stopCascadeShadows);

describe('cascade shadow sampling', () => {
  it('shares the cascade set with every surface: its atlas and live matrices, and the package filter, select, fade and offset', () => {
    const set = state();
    sampleCascadeShadows(shadows, layout, set);
    const u = cascadeShadowUniforms;
    expect(u.surface_cascadeCount.value).toBe(3);
    // The atlas takes the static map's sampler: the road and terrain programs have no texture unit to spare.
    expect(staticShadowUniforms.map.value).toBe(set.atlas);
    // The same objects the atlas pass rewrites each frame.
    set.matrices.forEach((matrix, i) => expect(u.surface_cascadeMatrices.value[i]).toBe(matrix));
    set.tiles.forEach((tile, i) => expect(u.surface_cascadeTiles.value[i]).toBe(tile));
    expect(u.surface_cascadeTapCount.value).toBe(2);
    expect(u.surface_cascadeTaps.value.slice(0, 2).map((tap: Vector3) => tap.toArray())).toEqual([[-0.5, 0.5, 2], [0.5, -0.5, 2]]);
    // A tap offset of one atlas texel is 1/64 across and 1/128 up the stacked texture.
    expect(u.surface_cascadeTexel.value.toArray()).toEqual([1 / 64, 1 / 128]);
    expect(u.surface_cascadeFilter.value.toArray()).toEqual([0.25, shadows.select.halfExtent]);
    expect(u.surface_cascadeFade.value.toArray()).toEqual([layout.fadeStartM, layout.farM]);
    expect(u.surface_cascadeNormalOffset.value).toBe(0.05);
  });

  it('lets a camera-facing card skip 1 m of its own depth, or 14 texels of a coarse cascade', () => {
    sampleCascadeShadows(shadows, layout, state());
    // The test cascades have 0.6875, 2.75 and 7.5625 m texels: 14 of them pass 1 m from the second on.
    layout.cascades.forEach((cascade, i) => expect(cascadeShadowUniforms.surface_cascadeCardDepth.value[i])
      .toBeCloseTo(Math.max(1, 14 * cascade.texelM) / cascadeDepthRangeM(cascade.sideM), 12));
  });

  it('throws for more cascades than the surfaces sample, and gives the static map its sampler back when stopped', () => {
    const many = {...layout, cascades: Array.from({length: 9}, () => layout.cascades[0])};
    expect(() => sampleCascadeShadows(shadows, many, state())).toThrow(/at most 8 shadow cascades/);
    const staticMap = new DepthTexture(1, 1);
    staticShadowUniforms.map.value = staticMap;
    try {
      // A second set replacing the first still hands back the static map, not the first set's atlas.
      sampleCascadeShadows(shadows, layout, state()); sampleCascadeShadows(shadows, layout, state());
      stopCascadeShadows();
      expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(0);
      expect(staticShadowUniforms.map.value).toBe(staticMap);
    } finally { staticShadowUniforms.map.value = null; }
  });

  it('samples the cascades in the scenery shader while a set is in use, the lookup moved along the normal by the material influence', () => {
    const shader = patched({...surface('standard'), normalShadowInfluence: 0.75});
    expect(shader.uniforms.surface_normalShadowInfluence.value).toBe(0.75);
    expect(shader.uniforms.surface_cascadeCount).toBe(cascadeShadowUniforms.surface_cascadeCount);
    expect(shader.vertexShader).toContain('shadowWorldNormal * ( surface_cascadeNormalOffset * surface_normalShadowInfluence )');
    expect(shader.fragmentShader).toContain('if ( surface_cascadeCount > 0 ) return surfaceCascadeShadow( - vViewPosition.z );');
    expect(shader.fragmentShader).not.toContain('#define SURFACE_CARD');
    expect(patched({...surface('vegetation'), billboard: true}).fragmentShader.startsWith('#define SURFACE_CARD\n')).toBe(true);
  });

  it('requires each scenery material to carry its normal shadow influence', () => {
    const {normalShadowInfluence: _, ...without} = surface('standard');
    expect(() => readSurfaceConfig({lmuSurface: without})).toThrow('Missing normal shadow influence: test_standard');
    expect(() => readSurfaceConfig({lmuSurface: {...surface('standard'), normalShadowInfluence: -1}})).toThrow('Missing normal shadow influence');
  });

  it("lets a material on three's light loop take the sun shadow from the cascades while a set is in use, else from the near map", () => {
    const shader = {uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader} as unknown as Parameters<typeof patchCascadeShadow>[0];
    patchCascadeShadow(shader, 0.5);
    expect(shader.fragmentShader).toContain(`( UNROLLED_LOOP_INDEX == 0 && surface_cascadeCount > 0 ? surfaceCascadeShadow( - vViewPosition.z ) : ${SUN_SHADOW_TERM} )`);
    expect(shader.vertexShader).toContain('vCascadePosition = worldPosition.xyz');
    expect(shader.uniforms.surface_normalShadowInfluence.value).toBe(0.5);
    // The atlas comes through the static map's sampler.
    expect(shader.uniforms.surface_staticShadowMap).toBe(staticShadowUniforms.map);
    expect(shader.uniforms.surface_cascadeCount).toBe(cascadeShadowUniforms.surface_cascadeCount);
    const bare = {uniforms: {}, vertexShader: '', fragmentShader: ''} as unknown as Parameters<typeof patchCascadeShadow>[0];
    expect(() => patchCascadeShadow(bare, 0.5)).toThrow(/to take the cascade shadow/);
  });
});
