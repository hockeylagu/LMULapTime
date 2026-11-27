import type { DepthTexture, IUniform } from 'three';
import type { SceneryShadows } from '../../../../../shared/types/scenes/scenery.js';
import type { ShaderPart } from '../shaders/composer.js';
import { MAX_SHADOW_CASCADES, MAX_SHADOW_TAPS, SCENE_BLOCK, sceneBlock, setScene } from '../shaders/sceneBlock.js';
import type { CascadeShadowState } from './cascadeShadows.js';
import type { ShadowCascadeLayout } from './shadowCascades.js';

/**
 * The sun shadow atlas every lit program samples (scenery and cars): a texture, so an ordinary uniform; the rest of the cascade set is
 * in the scene block (`surface_cascade*`, sceneBlock.ts), where `surface_cascadeCount` 0 leaves everything lit. The sampler must hold a
 * depth texture from the first draw: with none, three binds its empty colour texture and WebGL drops the draw on the sampler mismatch.
 */
export const cascadeAtlasUniform: IUniform<DepthTexture | null> = { value: null };

/**
 * Points the surfaces at a cascade set: its atlas, and into the scene block its matrices, tiles and card depths as they are now and
 * the package's taps, filter, select, fade and normal offset. The cascades move every frame: call it after each update of the set,
 * before the frame's other renders.
 */
export function sampleCascadeShadows(shadows: SceneryShadows, layout: ShadowCascadeLayout, state: CascadeShadowState): void {
  const { cascades } = layout, { taps, texelSize, scale } = shadows.filter, { offsets } = SCENE_BLOCK;
  if (cascades.length > MAX_SHADOW_CASCADES) throw Error(`The surfaces sample at most ${MAX_SHADOW_CASCADES} shadow cascades, not ${cascades.length}`);
  if (taps.length > MAX_SHADOW_TAPS) throw Error(`The surfaces sample at most ${MAX_SHADOW_TAPS} shadow filter taps, not ${taps.length}`);
  cascadeAtlasUniform.value = state.atlas;
  sceneBlock.set(state.packedMatrices, offsets.surface_cascadeMatrices);
  cascades.forEach((_, i) => {
    state.tiles[i].toArray(sceneBlock, offsets.surface_cascadeTiles + i * 4);
    sceneBlock[offsets.surface_cascadeCardDepth + i * 4] = state.cardDepth[i];
  });
  taps.forEach(({ offset, weight }, i) => sceneBlock.set([offset[0], offset[1], weight], offsets.surface_cascadeTaps + i * 4));
  setScene('surface_cascadeTapCount', taps.length);
  // The atlases are stacked upward (cascadeShadows.ts): a texel up is 1 / count of one across.
  setScene('surface_cascadeTexel', [texelSize, texelSize / shadows.atlas.count]);
  setScene('surface_cascadeFilter', [scale, shadows.select.halfExtent]);
  setScene('surface_cascadeFade', [layout.fadeStartM, layout.farM]);
  setScene('surface_cascadeNormalOffset', shadows.normalOffset.scale);
  setScene('surface_cascadeCount', cascades.length);
}

/** Holds the surfaces lit, on `atlas` (a set's atlas before its first draw, or null once the scene is gone). */
export function holdCascadeShadows(atlas: DepthTexture | null): void {
  setScene('surface_cascadeCount', 0);
  cascadeAtlasUniform.value = atlas;
}

/**
 * Vertex part: the shadow lookup position, the world position moved along the world normal by the package's offset scale times the
 * material's `surface_normalShadowInfluence`. Goes once the position is final (it needs `transformed` and `transformedNormal`).
 */
const CASCADE_SHADOW_VERTEX_PARS = `
  uniform float surface_normalShadowInfluence;
  varying vec3 vCascadePosition;
`;
const CASCADE_SHADOW_VERTEX = `
  {
    vec4 cascadeWorld = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      cascadeWorld = batchingMatrix * cascadeWorld;
    #endif
    #ifdef USE_INSTANCING
      cascadeWorld = instanceMatrix * cascadeWorld;
    #endif
    cascadeWorld = modelMatrix * cascadeWorld;
    vec3 cascadeNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
    vCascadePosition = cascadeWorld.xyz + cascadeNormal * ( surface_cascadeNormalOffset * surface_normalShadowInfluence );
  }
`;

/**
 * Fragment part: `surfaceCascadeShadow(viewDepth)`, the sun's light fraction (1 lit) from the first cascade whose tile holds the
 * point (max(|uv − 0.5|) ≤ halfExtent), filtered by the package's hardware-compare taps (Σ weight · compare · scale), faded out toward
 * far. A point outside every cascade is lit. With `SURFACE_CARD` defined, a camera-facing card skips its own depth. The set is the
 * scene block's (its counts floats).
 */
const CASCADE_SHADOW_FRAGMENT_PARS = `
  uniform sampler2DShadow surface_cascadeAtlas;
  varying vec3 vCascadePosition;
  float surfaceCascadeShadow( float viewDepth ) {
    for ( int i = 0; i < ${MAX_SHADOW_CASCADES}; i ++ ) {
      if ( float( i ) >= surface_cascadeCount ) break;
      vec3 coord = ( surface_cascadeMatrices[ i ] * vec4( vCascadePosition, 1.0 ) ).xyz;
      vec2 off = abs( coord.xy - 0.5 );
      if ( max( off.x, off.y ) > surface_cascadeFilter.y ) continue;
      #ifdef SURFACE_CARD
        coord.z -= surface_cascadeCardDepth[ i ].x;
      #endif
      coord.z = min( coord.z, 1.0 );
      vec4 tile = surface_cascadeTiles[ i ];
      vec2 uv = tile.xy + coord.xy * tile.zw;
      float lit = 0.0;
      for ( int t = 0; t < ${MAX_SHADOW_TAPS}; t ++ ) {
        if ( float( t ) >= surface_cascadeTapCount ) break;
        vec3 tap = surface_cascadeTaps[ t ].xyz;
        lit += tap.z * texture( surface_cascadeAtlas, vec3( uv + tap.xy * surface_cascadeTexel, coord.z ) );
      }
      float fadeOut = clamp( ( viewDepth - surface_cascadeFade.x ) / ( surface_cascadeFade.y - surface_cascadeFade.x ), 0.0, 1.0 );
      return mix( lit * surface_cascadeFilter.x, 1.0, fadeOut );
    }
    return 1.0;
  }
`;

/**
 * Gives an unlit composed program (instanced or not) the sun's light fraction at each fragment: `surfaceCascadeShadow(vCascadeViewDepth)`,
 * looked up at the fragment's world position (no normal offset), 1 outside the cascades. Its varyings are written once the drawn
 * position is final (after a part that moves it), first in their slot. The atlas is the shared one, the rest the scene block's.
 */
export const cascadeLookupPart: ShaderPart = {
  name: 'cascadeLookup',
  slots: {
    vertexPars: {at: 0, glsl: `
  varying vec3 vCascadePosition;
  varying float vCascadeViewDepth;`},
    vertexOutputs: {at: 0, glsl: `
  {
    vec4 cascadeWorld = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      cascadeWorld = batchingMatrix * cascadeWorld;
    #endif
    #ifdef USE_INSTANCING
      cascadeWorld = instanceMatrix * cascadeWorld;
    #endif
    vCascadePosition = ( modelMatrix * cascadeWorld ).xyz;
    vCascadeViewDepth = - mvPosition.z;
  }`},
    fragmentPars: {at: 0, glsl: `
  varying float vCascadeViewDepth;
${CASCADE_SHADOW_FRAGMENT_PARS}`},
  },
  uniforms: () => ({surface_cascadeAtlas: cascadeAtlasUniform}),
};

/**
 * The sun's shadow s on its light: `surfaceSunDiffuse` scales the diffuse it adds (min(2s, 1) / s), so the sun's diffuse takes
 * min(2s, 1) and its specular s. A half-shadowed texel is fully lit in diffuse; only the specular follows the shadow as it is.
 * `surfaceSunShadow` keeps s for a surface's own light after the loop (the inside of a windscreen lights its back face by it).
 */
const SUN_SHADOW_STATE = 'float surfaceSunDiffuse = 1.0, surfaceSunShadow = 1.0;';
/** Shades the sun's light `directLight` by its cascade shadow where the object receives shadows; `shade` is the family's take on it. */
const sunShadow = (shade: (shadow: string) => string) => `{ float sunShadow = receiveShadow ? ${shade('surfaceCascadeShadow( - vViewPosition.z )')} : 1.0;
        directLight.color *= sunShadow;
        surfaceSunDiffuse = sunShadow > 0.0 ? min( 2.0 * sunShadow, 1.0 ) / sunShadow : 1.0; surfaceSunShadow = sunShadow; }`;
/** Scales the diffuse the sun's direct term added to `reflected` since `before` by `surfaceSunDiffuse`. */
const sunDiffuse = (reflected: string, before: string) => `${reflected}.directDiffuse = ${before} + ( ${reflected}.directDiffuse - ${before} ) * surfaceSunDiffuse;`;

/**
 * The sun's shadow from the cascades in a lit composed program (litTemplate.ts), as every lit surface of the reference takes it: the
 * lookup position moved along the normal by the package's offset times `influence` (the material's normal shadow influence), the
 * sun's light shaded by `shade` of the cascade term where the object receives shadows, its diffuse split from its specular. The
 * atlas is the shared one, the set the scene block's, the influence the material's. First in its slots, but last on the sun's direct term: the
 * split takes the diffuse every part added to it there (leaf translucency).
 */
export function cascadeShadowPart(influence: number, shade = (shadow: string) => shadow): ShaderPart {
  return {
    name: 'cascadeShadow',
    slots: {
      vertexPars: {at: 0, glsl: CASCADE_SHADOW_VERTEX_PARS},
      vertexOutputs: {at: 0, glsl: CASCADE_SHADOW_VERTEX},
      fragmentPars: {at: 0, glsl: `${CASCADE_SHADOW_FRAGMENT_PARS}${SUN_SHADOW_STATE}\n`},
      fragmentSunLight: {at: 0, glsl: `  vec3 surfaceSunBefore = reflectedLight.directDiffuse;\n  ${sunShadow(shade)}`},
      fragmentSunDirect: {at: 100, glsl: `  ${sunDiffuse('reflectedLight', 'surfaceSunBefore')}`},
    },
    uniforms: () => ({surface_cascadeAtlas: cascadeAtlasUniform, surface_normalShadowInfluence: {value: influence}}),
  };
}
