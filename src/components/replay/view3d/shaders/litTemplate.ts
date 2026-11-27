import { Vector2, type IUniform, type Material, type ShaderMaterial, type Texture } from 'three';
import { composedTemplate, type ShaderTemplate } from './composer.js';
import { SCENE_BLOCK_GROUPS, SCENE_BLOCKS_GLSL } from './sceneBlock.js';
import { ENVIRONMENT_DEFINES, environmentMaxLod, sceneEnvironmentMap } from './sceneLight.js';

/**
 * The environment's inputs to three's environment chunk (`envmap_physical_pars_fragment`), under the names it reads, in place of
 * three's `envmap_common_pars_fragment`, whose uniforms the scene block now carries: the scene's turn, share and last level (the
 * share a pass value), or, for a material lit by an environment of its own (`lit_ownEnvironment.x` 1), whole, unturned and at that
 * environment's last level (`.y`), as three lights a built-in material with an environment map of its own. `roughnessToMip` is
 * three's (r187).
 */
const ENVIRONMENT_PARS = `uniform samplerCube envMap;
uniform vec2 lit_ownEnvironment;
#define envMapIntensity ( lit_ownEnvironment.x > 0.5 ? 1.0 : lit_environmentIntensity )
#define envMapRotation ( lit_ownEnvironment.x > 0.5 ? mat3( 1.0 ) : lit_environmentRotation )
#define ENVMAP_MAX_LOD ( lit_ownEnvironment.x > 0.5 ? lit_ownEnvironment.y : lit_environmentMaxLod )
float roughnessToMip( const in float roughness ) {
  float r = clamp( roughness, 0.0, 1.0 );
  return ENVMAP_MAX_LOD * r * ( 2.0 - r );
}`;

/**
 * The lit program: three's physical light model as three ships it, on a light loop of our own. It is three's standard material
 * (white, roughness 1, metalness 0, no maps) lit by one directional light, the sun or the moon (the scene block's `lit_sunDirection`
 * and `lit_sunColour`, sceneLight.ts, turned to view space by the view matrix), and the image-based light of the scene's environment;
 * no point, spot, area, hemisphere or ambient light reaches it (`lights: false`), as none lights the replay's scenes. three's chunks
 * come by `#include` unchanged; the loop calls their functions by name (`RE_Direct_Physical`, `getIBLIrradiance`, `getIBLRadiance`,
 * `RE_IndirectDiffuse_Physical`, `RE_IndirectSpecular_Physical`), with the energy terms three's loop sets up for a standard material
 * under a directional light. No `RE_*` macro is redefined: a part changes the sun's light, its direct term or the environment lookup
 * through the slots.
 *
 * Both stages declare the scene and pass blocks first (sceneBlock.ts). three fills `dfgLUT` (declared in the uniforms) and
 * `receiveShadow` (declared in the source, set per object: a material uniform would overwrite it on upload). The environment is a
 * uniform, the scene's unless the material has its own (`setOwnEnvironment`; `ENVIRONMENT_PARS`). The environment's reflection is
 * three's lookup unless a part reads its own. three's clear coat terms run where a family defines `USE_CLEARCOAT` (and its uniforms),
 * as three's physical program has them; the alpha test's threshold is the material's `alphaTest` (`alphaTest` uniform, declared where
 * three defines `USE_ALPHATEST`). Maps, occlusion and the coat's share of the outgoing light come with the families that need them.
 */
export const litTemplate: ShaderTemplate = {
  name: 'lit',
  defines: ENVIRONMENT_DEFINES,
  uniformsGroups: SCENE_BLOCK_GROUPS,
  vertex: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <color_pars_vertex>
#include <normal_pars_vertex>
${slot('vertexPars')}
void main() {
  #include <color_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
${slot('vertexNormal')}
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>
${slot('vertexPosition')}
  #include <project_vertex>
${slot('vertexProjected')}
${slot('vertexView')}
  vViewPosition = - mvPosition.xyz;
${slot('vertexOutputs')}
}
`,
  fragment: slot => /* glsl */ `${SCENE_BLOCKS_GLSL}
#define STANDARD
uniform float opacity;
uniform bool receiveShadow;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <alphatest_pars_fragment>
${ENVIRONMENT_PARS}
#include <envmap_physical_pars_fragment>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
${slot('fragmentPars')}
void main() {
  vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );
  ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
  vec3 totalEmissiveRadiance = vec3( 0.0 );
  float roughnessFactor = 1.0;
  float metalnessFactor = 0.0;
${slot('fragmentAlbedo')}
  #include <color_fragment>
${slot('fragmentColour')}
  #include <normal_fragment_begin>
  #include <clearcoat_normal_fragment_begin>
${slot('fragmentNormal')}
${slot('fragmentEmission')}
  #include <lights_physical_fragment>
${slot('fragmentMaterial')}
  vec3 geometryPosition = - vViewPosition;
  vec3 geometryNormal = normal;
  vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
  vec3 geometryClearcoatNormal = vec3( 0.0 );
  #ifdef USE_CLEARCOAT
    geometryClearcoatNormal = clearcoatNormal;
  #endif
  float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
  material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
  float EssMs = material.dfg.x + material.dfg.y;
  material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
  IncidentLight directLight;
  directLight.direction = normalize( ( viewMatrix * vec4( lit_sunDirection, 0.0 ) ).xyz );
  directLight.color = lit_sunColour;
  directLight.visible = true;
${slot('fragmentSunLight')}
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
${slot('fragmentSunDirect')}
  vec3 irradiance = vec3( 0.0 );
  vec3 iblIrradiance = vec3( 0.0 );
${slot('fragmentIrradiance', '  iblIrradiance += getIBLIrradiance( geometryNormal );')}
  vec3 radiance = vec3( 0.0 );
  vec3 clearcoatRadiance = vec3( 0.0 );
${slot('fragmentRadiance', `  radiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
  #ifdef USE_CLEARCOAT
    clearcoatRadiance = getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
  #endif`)}
${slot('fragmentReflection')}
  RE_IndirectDiffuse_Physical( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
${slot('fragmentIndirectSpecular', '  RE_IndirectSpecular_Physical( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );')}
${slot('fragmentOcclusion')}
  vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
${slot('fragmentLight')}
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${slot('fragmentOutput')}
  #include <premultiplied_alpha_fragment>
  #include <dithering_fragment>
}
`,
  // The opacity and alpha test are the material's own, read at upload; `dfgLUT` is each material's for three to fill; the
  // environment is the scene's until the material has its own.
  uniforms: (material: ShaderMaterial): Record<string, IUniform> => ({
    opacity: {get value() { return material.opacity; }},
    alphaTest: {get value() { return material.alphaTest; }},
    dfgLUT: {value: null},
    envMap: sceneEnvironmentMap,
    lit_ownEnvironment: {value: new Vector2()},
  }),
};

/** The environment each lit material reads in place of the scene's (`setOwnEnvironment`). */
const ownEnvironments = new WeakMap<Material, Texture>();

/** The environment a lit composed material reads in place of the scene's, or null while it reads the scene's. */
export function ownEnvironment(material: Material): Texture | null {
  return ownEnvironments.get(material) ?? null;
}

/**
 * Lights a lit composed material by `environment` (a PMREM) in place of the scene's, at whole intensity and unturned, as three lights
 * a built-in material with an environment map of its own; null: by the scene's again. Its uniforms change, never its program (the
 * environment's last level is a uniform, `ENVIRONMENT_PARS`). Throws for a material not on the lit template.
 */
export function setOwnEnvironment(material: Material, environment: Texture | null): void {
  if (composedTemplate(material) !== litTemplate) throw Error(`Material ${material.name || material.type} is not on the lit template`);
  const u = (material as ShaderMaterial).uniforms, own = u.lit_ownEnvironment.value as Vector2;
  if (environment) {
    u.envMap = {value: environment}; own.set(1, environmentMaxLod(environment));
    ownEnvironments.set(material, environment);
  } else {
    u.envMap = sceneEnvironmentMap; own.set(0, 0);
    ownEnvironments.delete(material);
  }
  // Uploaded again at its next draw, whichever material drew before it.
  (material as ShaderMaterial).uniformsNeedUpdate = true;
}
