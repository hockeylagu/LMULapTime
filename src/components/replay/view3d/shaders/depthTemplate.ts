import type { IUniform, ShaderMaterial } from 'three';
import { SURFACE_UV } from '../scenery/materials/shaderContext.js';
import type { CutOut, ShaderPart, ShaderTemplate } from './composer.js';
import { SCENE_BLOCK_GROUPS, SCENE_BLOCKS_GLSL } from './sceneBlock.js';

/**
 * The depth program (the sun shadow pass's casters with a part of their own: camera-facing cards): three's depth material with its
 * basic packing (1 − depth in rgb, the opacity in alpha), the depth taken as three takes it (`vHighPrecisionZW`, the reversed depth
 * buffer's range where three defines it). three's chunks come by `#include` where used unchanged (the project path with batching).
 * Both stages declare the scene and pass blocks first (sceneBlock.ts).
 * Without a part it draws what three's depth material draws without maps; a composed surface's cut-out takes `depthCutOutPart`.
 */
export const depthTemplate: ShaderTemplate = {
  name: 'depth',
  uniformsGroups: SCENE_BLOCK_GROUPS,
  vertex: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
#include <common>
#include <batching_pars_vertex>
varying vec2 vHighPrecisionZW;
${slot('vertexPars')}
void main() {
  #include <batching_vertex>
  #include <begin_vertex>
${slot('vertexPosition')}
  #include <project_vertex>
${slot('vertexOutputs')}
  vHighPrecisionZW = gl_Position.zw;
}
`,
  fragment: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
uniform float opacity;
#include <common>
#include <alphatest_pars_fragment>
varying vec2 vHighPrecisionZW;
${slot('fragmentPars')}
void main() {
  vec4 diffuseColor = vec4( 1.0 );
  diffuseColor.a = opacity;
${slot('fragmentColour')}
  #ifdef USE_REVERSED_DEPTH_BUFFER
    float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
  #else
    float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
  #endif
  gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
}
`,
  // The opacity and alpha test are the material's own, read at upload, as three reads them for its depth material.
  uniforms: (material: ShaderMaterial): Record<string, IUniform> => ({
    opacity: {get value() { return material.opacity; }},
    alphaTest: {get value() { return material.alphaTest; }},
  }),
};

const UV_SETS = [1, 2, 3].map(set => `#ifndef USE_UV${set}\nattribute vec2 uv${set};\n#endif`).join('\n');
const UV_VARYINGS = 'varying vec2 vSurfaceXZ;\nvarying vec4 vSurfaceUV01, vSurfaceUV23;';

/**
 * A depth caster cut out by a composed surface's cut-out (`composedCutOut`), read where the surface reads it: the UV sets passed as
 * the surface passes them and summed by its `surfaceUv`, turned, scaled and shifted by the cut-out's own uniforms (the surface
 * material's objects, so every caster shares one program), times the opacity, against the material's `alphaTest`.
 */
export function depthCutOutPart(cut: CutOut): ShaderPart {
  const uniforms = {cutOut_map: cut.map, cutOut_uvSets: cut.uvSets, cutOut_transform: cut.transform, cutOut_scale: cut.scale, cutOut_shift: cut.shift};
  return {
    name: 'depthCutOut',
    slots: {
      vertexPars: {at: 0, glsl: `${UV_SETS}\n${UV_VARYINGS}`},
      vertexOutputs: {at: 0, glsl: '  vSurfaceXZ = position.xz; vSurfaceUV01 = vec4( uv, uv1 ); vSurfaceUV23 = vec4( uv2, uv3 );'},
      fragmentPars: {at: 0, glsl: `uniform sampler2D cutOut_map;\nuniform vec4 cutOut_uvSets;\nuniform mat3 cutOut_transform;\nuniform vec2 cutOut_scale, cutOut_shift;\n${UV_VARYINGS}\n${SURFACE_UV}`},
      fragmentColour: {at: 0, glsl: `  diffuseColor *= texture2D( cutOut_map, ( cutOut_transform * vec3( surfaceUv( cutOut_uvSets ), 1.0 ) ).xy * cutOut_scale + cutOut_shift );
  #ifdef USE_ALPHATEST
    if ( diffuseColor.a < alphaTest ) discard;
  #endif`},
    },
    uniforms: () => uniforms,
    ownTextures: ['cutOut_map'],
  };
}
