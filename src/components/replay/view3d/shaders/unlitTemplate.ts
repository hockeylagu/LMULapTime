import type { IUniform, ShaderMaterial } from 'three';
import type { ShaderTemplate } from './composer.js';
import { SCENE_BLOCK_GROUPS, SCENE_BLOCKS_GLSL } from './sceneBlock.js';

/**
 * The unlit program (contact shadow, racing line): white times the vertex colour, at the material's opacity, drawn as it is; a
 * family part sets its own colour in `fragmentColour`. Both stages declare the scene and pass blocks first (sceneBlock.ts). It is three's white basic material without its maps and light map: three's
 * chunks come by `#include` only where used unchanged (the project path with batching and instancing, vertex colour, the opaque
 * write, tone mapping and the output encode). With no light map the basic material's outgoing light is 1 × its colour, so this
 * draws the same pixels.
 */
export const unlitTemplate: ShaderTemplate = {
  name: 'unlit',
  uniformsGroups: SCENE_BLOCK_GROUPS,
  vertex: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
#include <common>
#include <batching_pars_vertex>
#include <color_pars_vertex>
${slot('vertexPars')}
void main() {
  #include <color_vertex>
  #include <batching_vertex>
  #include <begin_vertex>
  #include <project_vertex>
${slot('vertexView')}
${slot('vertexOutputs')}
}
`,
  fragment: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
uniform float opacity;
#include <common>
#include <color_pars_fragment>
${slot('fragmentPars')}
void main() {
  vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );
  #include <color_fragment>
${slot('fragmentColour')}
  vec3 outgoingLight = diffuseColor.rgb;
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${slot('fragmentOutput')}
}
`,
  // The opacity is the material's own, read at upload: a fade sets `material.opacity` as on a built-in material.
  uniforms: (material: ShaderMaterial): Record<string, IUniform> => ({
    opacity: {get value() { return material.opacity; }},
  }),
};
