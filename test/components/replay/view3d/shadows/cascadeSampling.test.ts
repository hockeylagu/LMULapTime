import { DepthTexture, Matrix4, MeshStandardMaterial, Vector4 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { surfaceMaterial } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceProgram.js';
import { readSurfaceConfig, type SurfaceConfig } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { cascadeAtlasUniform, cascadeLookupPart, cascadeShadowPart, holdCascadeShadows, sampleCascadeShadows } from '../../../../../src/components/replay/view3d/shadows/cascadeSampling.js';
import { SCENE_BLOCK, sceneBlock, sceneValue } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { composeShader } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { shadowCascadeLayout } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';
import { surface } from '../scenery/surfaceFixture.js';

const {shadows} = testShading();
const layout = shadowCascadeLayout(shadows, shadows.cameras.chase);
const state = () => ({
  // Two 64 px atlases stacked.
  atlas: new DepthTexture(64, 128),
  matrices: layout.cascades.map(() => new Matrix4()),
  packedMatrices: new Float32Array(layout.cascades.length * 16),
  cardDepth: new Float32Array(layout.cascades.length),
  tiles: layout.cascades.map((_, i) => new Vector4(i, 0, 0, 0.5)),
});

/** `count` floats of the scene block from a member's offset. */
const block = (name: keyof typeof SCENE_BLOCK.offsets, count: number) => [...sceneBlock.subarray(SCENE_BLOCK.offsets[name], SCENE_BLOCK.offsets[name] + count)];

/** A scenery surface's composed material (surfaceProgram.ts). */
const composed = (config: SurfaceConfig) => surfaceMaterial(new MeshStandardMaterial(), config, {});

afterEach(() => holdCascadeShadows(null));

describe('cascade shadow sampling', () => {
  it('writes the cascade set for every surface: its atlas, its matrices as they are now, and the package filter, select, fade and offset', () => {
    const set = state();
    set.packedMatrices.set(new Matrix4().makeTranslation(1, 2, 3).toArray(), 16); set.cardDepth.set([0.1, 0.2, 0.3]);
    sampleCascadeShadows(shadows, layout, set);
    expect(sceneValue('surface_cascadeCount')).toBe(3);
    expect(cascadeAtlasUniform.value).toBe(set.atlas);
    // A copy of the packed matrices the atlas pass rewrites each frame (sampled again after each update); the tiles packed in order;
    // each card depth in its own vec4's x, as std140 strides a float array.
    expect(block('surface_cascadeMatrices', 48)).toEqual(Array.from(set.packedMatrices));
    expect(block('surface_cascadeCardDepth', 12)).toEqual([0.1, 0, 0, 0, 0.2, 0, 0, 0, 0.3, 0, 0, 0].map(Math.fround));
    expect(block('surface_cascadeTiles', 12)).toEqual(set.tiles.flatMap(tile => tile.toArray()));
    expect(sceneValue('surface_cascadeTapCount')).toBe(2);
    // Each tap a vec4: offset, weight, padding.
    expect(block('surface_cascadeTaps', 8)).toEqual([-0.5, 0.5, 2, 0, 0.5, -0.5, 2, 0]);
    // A tap offset of one atlas texel is 1/64 across and 1/128 up the stacked texture.
    expect(block('surface_cascadeTexel', 2)).toEqual([1 / 64, 1 / 128]);
    expect(block('surface_cascadeFilter', 2)).toEqual([0.25, Math.fround(shadows.select.halfExtent)]);
    expect(block('surface_cascadeFade', 2)).toEqual([layout.fadeStartM, layout.farM].map(Math.fround));
    expect(sceneValue('surface_cascadeNormalOffset')).toBe(Math.fround(0.05));
  });

  it('throws for more cascades than the surfaces sample, and holds the surfaces lit on a given atlas', () => {
    const many = {...layout, cascades: Array.from({length: 9}, () => layout.cascades[0])};
    expect(() => sampleCascadeShadows(shadows, many, state())).toThrow(/at most 8 shadow cascades/);
    sampleCascadeShadows(shadows, layout, state());
    const next = new DepthTexture(1, 1);
    holdCascadeShadows(next);
    expect(sceneValue('surface_cascadeCount')).toBe(0);
    expect(cascadeAtlasUniform.value).toBe(next);
  });

  it('samples the cascades in the scenery shader, the lookup moved along the normal by the material influence', () => {
    const shader = composed({...surface('standard'), normalShadowInfluence: 0.75});
    expect(shader.uniforms.surface_normalShadowInfluence.value).toBe(0.75);
    expect(shader.uniforms.surface_cascadeAtlas).toBe(cascadeAtlasUniform); expect(shader.uniforms).not.toHaveProperty('surface_cascadeCount');
    // The counts are the block's floats.
    expect(shader.fragmentShader).toContain('if ( float( i ) >= surface_cascadeCount ) break;'); expect(shader.fragmentShader).toContain('vec3 tap = surface_cascadeTaps[ t ].xyz;');
    expect(shader.vertexShader).toContain('cascadeNormal * ( surface_cascadeNormalOffset * surface_normalShadowInfluence )');
    expect(shader.fragmentShader).toContain('float sunShadow = receiveShadow ? surfaceCascadeShadow( - vViewPosition.z ) : 1.0;');
    expect(shader.fragmentShader).not.toContain('#define SURFACE_CARD');
    const card = composed({...surface('vegetation'), billboard: true}).fragmentShader;
    expect(card.indexOf('#define SURFACE_CARD')).toBeLessThan(card.indexOf('#ifdef SURFACE_CARD')); expect(card).toContain('#define SURFACE_CARD');
  });

  it('requires each scenery material to carry its normal shadow influence', () => {
    const {normalShadowInfluence: _, ...without} = surface('standard');
    expect(() => readSurfaceConfig({lmuSurface: without})).toThrow('Missing normal shadow influence: test_standard');
    expect(() => readSurfaceConfig({lmuSurface: {...surface('standard'), normalShadowInfluence: -1}})).toThrow('Missing normal shadow influence');
  });

  it("gives an unlit composed program the sun's light fraction at the fragment's world position, instanced or not, from the shared cascade set", () => {
    const {slots} = cascadeLookupPart;
    expect(slots.vertexOutputs?.glsl).toContain('cascadeWorld = instanceMatrix * cascadeWorld;');
    expect(slots.vertexOutputs?.glsl).toContain('vCascadePosition = ( modelMatrix * cascadeWorld ).xyz;');
    expect(slots.vertexOutputs?.glsl).toContain('vCascadeViewDepth = - mvPosition.z;');
    expect(slots.vertexPars?.glsl).toContain('varying float vCascadeViewDepth;');
    expect(slots.fragmentPars?.glsl).toContain('float surfaceCascadeShadow( float viewDepth )');
    expect(slots.fragmentPars?.glsl).toContain('varying float vCascadeViewDepth;');
    // First in its slots: a part's varyings after it can rely on the lookup's.
    expect([slots.vertexPars?.at, slots.vertexOutputs?.at, slots.fragmentPars?.at]).toEqual([0, 0, 0]);
    expect(cascadeLookupPart.uniforms?.()).toEqual({surface_cascadeAtlas: cascadeAtlasUniform});
    expect(cascadeLookupPart.ownTextures).toBeUndefined(); // The atlas is the scene's, not a material's.
  });

  it("gives a lit composed program the sun's shadow from the cascades, on the template's sun, where it receives shadows, its diffuse split", () => {
    const part = cascadeShadowPart(0.5, shadow => `min(${shadow}, baked)`), {slots} = part;
    expect(slots.fragmentPars?.glsl).toContain('uniform sampler2DShadow surface_cascadeAtlas;');
    expect(slots.vertexOutputs?.glsl).toContain('vCascadePosition = cascadeWorld.xyz');
    // The sun's diffuse takes min(2 * shadow, 1), its specular the shadow.
    expect(slots.fragmentSunLight?.glsl).toContain('{ float sunShadow = receiveShadow ? min(surfaceCascadeShadow( - vViewPosition.z ), baked) : 1.0;');
    expect(slots.fragmentSunLight?.glsl).toContain('surfaceSunDiffuse = sunShadow > 0.0 ? min( 2.0 * sunShadow, 1.0 ) / sunShadow : 1.0; surfaceSunShadow = sunShadow; }');
    expect(slots.fragmentSunDirect?.glsl.trim()).toBe('reflectedLight.directDiffuse = surfaceSunBefore + ( reflectedLight.directDiffuse - surfaceSunBefore ) * surfaceSunDiffuse;');    // On the template's sun: shaded before its direct term, its diffuse scaled right after it.
    const {fragmentShader} = composeShader(litTemplate, [part]), at = (text: string) => fragmentShader.indexOf(text);
    expect(at('directLight.color = lit_sunColour;')).toBeLessThan(at('vec3 surfaceSunBefore = reflectedLight.directDiffuse;'));
    expect(at('directLight.color *= sunShadow;')).toBeLessThan(at('RE_Direct_Physical('));
    expect(at('RE_Direct_Physical(')).toBeLessThan(at('* surfaceSunDiffuse;'));
    expect(fragmentShader).not.toMatch(/#define RE_Direct/);
    // The shared cascade set and the material's own influence.
    const uniforms = part.uniforms?.() ?? {};
    expect(uniforms.surface_cascadeAtlas).toBe(cascadeAtlasUniform); expect(uniforms.surface_normalShadowInfluence.value).toBe(0.5);
    expect(cascadeShadowPart(0.25).uniforms?.().surface_normalShadowInfluence).not.toBe(uniforms.surface_normalShadowInfluence);
    expect(composeShader(litTemplate, [cascadeShadowPart(0.25)]).key).toBe(composeShader(litTemplate, [cascadeShadowPart(0.75)]).key);
  });
});