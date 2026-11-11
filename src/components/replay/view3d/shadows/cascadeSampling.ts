import { Matrix4, ShaderChunk, Vector2, Vector3, Vector4, type IUniform, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { SceneryShadows } from '../../../../../shared/types/scenes/scenery.js';
import { staticShadowUniforms } from '../sunShadows.js';
import { cascadeDepthRangeM, type CascadeShadowState } from './cascadeShadows.js';
import type { ShadowCascadeLayout } from './shadowCascades.js';

/** What the surface shaders are compiled for: a package with more cascades or filter taps throws. */
export const MAX_SHADOW_CASCADES = 8;
const MAX_SHADOW_TAPS = 16;

/**
 * Depth past a camera-facing card's own plane its cascade lookup skips: 1 m, or this many of the cascade's texels when that is more
 * (a card and its shadow lie in one plane, so at a grazing sun a card shadows itself whole).
 */
const CARD_SELF_SHADOW_M = 1;
const CARD_SELF_SHADOW_TEXELS = 14;

/**
 * The cascade shadow inputs every surface program shares; `surface_cascadeCount` 0 leaves the surfaces on the near and static maps.
 * The atlas has no sampler of its own: while a set is in use it takes the static map's (`surface_staticShadowMap`), which is then not
 * read. The road and terrain programs already use all 16 texture units.
 */
export const cascadeShadowUniforms = {
  surface_cascadeCount: { value: 0 },
  surface_cascadeMatrices: { value: Array.from({ length: MAX_SHADOW_CASCADES }, () => new Matrix4()) },
  surface_cascadeTiles: { value: Array.from({ length: MAX_SHADOW_CASCADES }, () => new Vector4()) },
  surface_cascadeCardDepth: { value: Array.from({ length: MAX_SHADOW_CASCADES }, () => 0) },
  surface_cascadeTaps: { value: Array.from({ length: MAX_SHADOW_TAPS }, () => new Vector3()) },
  surface_cascadeTapCount: { value: 0 },
  /** One atlas texel across and up, as a fraction of the stacked texture. */
  surface_cascadeTexel: { value: new Vector2() },
  /** Filter scale, select halfExtent. */
  surface_cascadeFilter: { value: new Vector2() },
  /** View depth where the fade starts, and far. */
  surface_cascadeFade: { value: new Vector2() },
  surface_cascadeNormalOffset: { value: 0 },
} satisfies Record<string, IUniform>;

/** The static map the shared sampler held before a cascade set took it. */
let staticMap: Texture | null | undefined;

/**
 * Points the surfaces at a cascade set: its atlases and matrices (shared, so the per-frame redraws reach the shaders without a
 * copy) and the package's filter, select, fade and normal offset.
 */
export function sampleCascadeShadows(shadows: SceneryShadows, layout: ShadowCascadeLayout, state: CascadeShadowState): void {
  const { cascades } = layout, { taps, texelSize, scale } = shadows.filter;
  if (cascades.length > MAX_SHADOW_CASCADES) throw Error(`The surfaces sample at most ${MAX_SHADOW_CASCADES} shadow cascades, not ${cascades.length}`);
  if (taps.length > MAX_SHADOW_TAPS) throw Error(`The surfaces sample at most ${MAX_SHADOW_TAPS} shadow filter taps, not ${taps.length}`);
  const u = cascadeShadowUniforms;
  if (staticMap === undefined) staticMap = staticShadowUniforms.map.value;
  staticShadowUniforms.map.value = state.atlas;
  cascades.forEach((cascade, i) => {
    u.surface_cascadeMatrices.value[i] = state.matrices[i];
    u.surface_cascadeTiles.value[i] = state.tiles[i];
    const skipM = Math.max(CARD_SELF_SHADOW_M, CARD_SELF_SHADOW_TEXELS * cascade.texelM);
    u.surface_cascadeCardDepth.value[i] = skipM / cascadeDepthRangeM(cascade.sideM);
  });
  taps.forEach(({ offset, weight }, i) => u.surface_cascadeTaps.value[i].set(offset[0], offset[1], weight));
  u.surface_cascadeTapCount.value = taps.length;
  // The atlases are stacked upward (cascadeShadows.ts): a texel up is 1 / count of one across.
  u.surface_cascadeTexel.value.set(texelSize, texelSize / shadows.atlas.count);
  u.surface_cascadeFilter.value.set(scale, shadows.select.halfExtent);
  u.surface_cascadeFade.value.set(layout.fadeStartM, layout.farM);
  u.surface_cascadeNormalOffset.value = shadows.normalOffset.scale;
  u.surface_cascadeCount.value = cascades.length;
}

/** Back to the near and static maps (a camera type without a cascade set): the shared sampler gets the static map back. */
export function stopCascadeShadows(): void {
  cascadeShadowUniforms.surface_cascadeCount.value = 0;
  if (staticMap !== undefined) staticShadowUniforms.map.value = staticMap;
  staticMap = undefined;
}

/**
 * Vertex part: the shadow lookup position, the world position moved along the normal by the package's offset scale times the
 * material's `surface_normalShadowInfluence`. Needs three's `worldPosition` and `shadowWorldNormal` (inside its shadow-map block).
 */
export const CASCADE_SHADOW_VERTEX_PARS = `
  uniform float surface_cascadeNormalOffset;
  uniform float surface_normalShadowInfluence;
  varying vec3 vCascadePosition;
`;
export const CASCADE_SHADOW_VERTEX = `
  vCascadePosition = worldPosition.xyz + shadowWorldNormal * ( surface_cascadeNormalOffset * surface_normalShadowInfluence );
`;

/**
 * Fragment part: `surfaceCascadeShadow(viewDepth)`, the sun's light fraction (1 lit) from the first cascade whose tile holds the
 * point (max(|uv − 0.5|) ≤ halfExtent), filtered by the package's hardware-compare taps (Σ weight · compare · scale), faded out toward
 * far. A point outside every cascade is lit. With `SURFACE_CARD` defined, a camera-facing card skips its own depth. Reads the atlas
 * through `surface_staticShadowMap`, declared before it.
 */
export const CASCADE_SHADOW_FRAGMENT_PARS = `
  uniform int surface_cascadeCount;
  uniform mat4 surface_cascadeMatrices[ ${MAX_SHADOW_CASCADES} ];
  uniform vec4 surface_cascadeTiles[ ${MAX_SHADOW_CASCADES} ];
  uniform float surface_cascadeCardDepth[ ${MAX_SHADOW_CASCADES} ];
  uniform vec3 surface_cascadeTaps[ ${MAX_SHADOW_TAPS} ];
  uniform int surface_cascadeTapCount;
  uniform vec2 surface_cascadeTexel;
  uniform vec2 surface_cascadeFilter;
  uniform vec2 surface_cascadeFade;
  varying vec3 vCascadePosition;
  float surfaceCascadeShadow( float viewDepth ) {
    for ( int i = 0; i < ${MAX_SHADOW_CASCADES}; i ++ ) {
      if ( i >= surface_cascadeCount ) break;
      vec3 coord = ( surface_cascadeMatrices[ i ] * vec4( vCascadePosition, 1.0 ) ).xyz;
      vec2 off = abs( coord.xy - 0.5 );
      if ( max( off.x, off.y ) > surface_cascadeFilter.y ) continue;
      #ifdef SURFACE_CARD
        coord.z -= surface_cascadeCardDepth[ i ];
      #endif
      coord.z = min( coord.z, 1.0 );
      vec4 tile = surface_cascadeTiles[ i ];
      vec2 uv = tile.xy + coord.xy * tile.zw;
      float lit = 0.0;
      for ( int t = 0; t < ${MAX_SHADOW_TAPS}; t ++ ) {
        if ( t >= surface_cascadeTapCount ) break;
        vec3 tap = surface_cascadeTaps[ t ];
        lit += tap.z * texture( surface_staticShadowMap, vec3( uv + tap.xy * surface_cascadeTexel, coord.z ) );
      }
      float fadeOut = clamp( ( viewDepth - surface_cascadeFade.x ) / ( surface_cascadeFade.y - surface_cascadeFade.x ), 0.0, 1.0 );
      return mix( lit * surface_cascadeFilter.x, 1.0, fadeOut );
    }
    return 1.0;
  }
`;

/** Three's directional shadow term in its light loop (`lights_fragment_begin`). */
export const SUN_SHADOW_TERM = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
const SHADOW_GATE = '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0';

/**
 * Lets a material on three's own light loop (the cars' materials outside the scenery program) take the sun's shadow from the cascades
 * while a set is in use, and from three's near map otherwise. `influence` is the material's normal shadow influence. Its light
 * chunk may already be inlined (car paint's); a program without three's shadow term throws.
 */
export function patchCascadeShadow(shader: WebGLProgramParametersWithUniforms, influence: number): void {
  const replace = (source: string, from: string, to: string) => {
    if (!source.includes(from)) throw Error(`The shader has no ${from.slice(0, 40)} to take the cascade shadow`);
    return source.replace(from, to);
  };
  let vertex = replace(shader.vertexShader, '#include <shadowmap_pars_vertex>', `#include <shadowmap_pars_vertex>\n${SHADOW_GATE}\n${CASCADE_SHADOW_VERTEX_PARS}\n#endif`);
  vertex = replace(vertex, '#include <shadowmap_vertex>', `#include <shadowmap_vertex>\n${SHADOW_GATE}\n${CASCADE_SHADOW_VERTEX}\n#endif`);
  let fragment = shader.fragmentShader.replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin);
  fragment = replace(fragment, '#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>
${SHADOW_GATE}
  uniform sampler2DShadow surface_staticShadowMap;
  ${CASCADE_SHADOW_FRAGMENT_PARS}
#endif`);
  fragment = replace(fragment, SUN_SHADOW_TERM,
    `( UNROLLED_LOOP_INDEX == 0 && surface_cascadeCount > 0 ? surfaceCascadeShadow( - vViewPosition.z ) : ${SUN_SHADOW_TERM} )`);
  shader.vertexShader = vertex; shader.fragmentShader = fragment;
  Object.assign(shader.uniforms, cascadeShadowUniforms, {
    surface_staticShadowMap: staticShadowUniforms.map, surface_normalShadowInfluence: { value: influence },
  });
}
