import { MeshDepthMaterial, ShaderChunk, Vector2, Vector3, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { patchCascadeShadow } from '../../shadows/cascadeSampling.js';
import { digitalFlagClock } from './flagSurface.js';
import { patchAmbientLookup } from './ambientLookup.js';
import { CROWN_SUN_UNIFORM, crownNormalGlsl, crownSun } from './foliageCrown.js';
import { glslNumber, list, surfaceAlphaCut, value } from './shaderContext.js';
import { REFLECTING_KINDS, SCENERY_REFLECTION_GLSL, SCENERY_REFLECTION_INPUTS, sceneryReflectionUniforms } from './sceneryReflection.js';
import { shadowEye } from './shadowEye.js';
import { shaderParts } from './shaderParts.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

const hasTranslucency = (config: SurfaceConfig) => !!config.flags.translucency;

/**
 * Turns a camera-facing card about its pivot toward `eye` (a world position in GLSL), and its normal with it: the authored normal
 * belongs to the rest plane and, kept, left whole crowds facing away from the sun. transpose(M) * d is the local normal whose world
 * normal is d. The shadow pass turns cards toward the viewing camera too (`billboardShadowMaterial`), so a card shades what is seen.
 */
export function patchBillboardVertex(shader: WebGLProgramParametersWithUniforms, eye: string, crown = false): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute vec3 _lmu_pivot;
    attribute vec2 _lmu_corner;
    ${crown ? `uniform vec3 ${CROWN_SUN_UNIFORM};` : ''}
  `).replace('#include <begin_vertex>', `
    vec3 pivotWorld = (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz;
    vec3 directionToCamera = ${eye} - pivotWorld;
    directionToCamera.y = 0.0;
    bool facingCamera = length(directionToCamera) > 0.0001;
    vec3 rightWorld = facingCamera ? normalize(cross(vec3(0.0,1.0,0.0), directionToCamera)) : vec3(1.0,0.0,0.0);
    vec3 rightLocal = normalize(rightWorld * mat3(modelMatrix));
    #include <begin_vertex>
    transformed = _lmu_pivot + rightLocal * _lmu_corner.x + vec3(0.0,_lmu_corner.y,0.0);
  `);
  if (shader.vertexShader.includes('#include <beginnormal_vertex>')) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
    #include <beginnormal_vertex>
    { vec3 toEye = ${eye} - (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz; toEye.y = 0.0;
      if (length(toEye) > 0.0001) objectNormal = normalize(normalize(toEye) * mat3(modelMatrix));
      #ifdef USE_TANGENT
        objectTangent = normalize(normalize(cross(vec3(0.0,1.0,0.0), toEye)) * mat3(modelMatrix));
      #endif
    }
    ${crown ? crownNormalGlsl(eye) : ''}
  `);
}

/**
 * How a family takes the sun's shadow: leaves light their diffuse and translucency with min(2 * shadow, 1), so partly shadowed
 * foliage reads lit and only full shade is dark. Terrain also takes its baked shadow (the splatter's alpha, shaderParts.ts) on the
 * sun: the shade under trees and beside walls is painted into the ground, and lights it as shade.
 */
function sunShade(kind: SurfaceConfig['kind']): (shadow: string) => string {
  if (kind === 'vegetation') return shadow => `min(2.0 * ${shadow}, 1.0)`;
  if (kind === 'terrain') return shadow => `min(${shadow}, surfaceBakedShadow)`;
  return shadow => shadow;
}

let shadowMaterial: MeshDepthMaterial | null = null;

/**
 * The sun shadow pass's material for every camera-facing card, shared as three shares its default depth material (the pass copies
 * each card's albedo and alpha test onto it). Cards turn toward the viewing camera, not the light, so a crown's own shadow falls on
 * the card that is drawn. The shadow pass keeps the eye current (`trackShadowEye`).
 */
export function billboardShadowMaterial(): MeshDepthMaterial {
  if (shadowMaterial) return shadowMaterial;
  const material = new MeshDepthMaterial();
  material.onBeforeCompile = shader => { shader.uniforms.surface_shadowEye = shadowEye; shader.vertexShader = `uniform vec3 surface_shadowEye;
${shader.vertexShader}`; patchBillboardVertex(shader, 'surface_shadowEye'); };
  material.customProgramCacheKey = () => 'billboardShadow';
  return shadowMaterial = material;
}

/**
 * Rewrites a `MeshStandardMaterial`/`MeshPhysicalMaterial` program into the native surface: tunables become uniforms (so one program
 * serves every material of the same shape), and the albedo, normal, emissive and occlusion includes are replaced by the family's GLSL.
 * `uniforms` carries the per-material sampler and scale uniforms.
 */
export function patchSurfaceShader(shader: WebGLProgramParametersWithUniforms, config: SurfaceConfig, uniforms: Record<string, IUniform>): void {
  const code = shaderParts(config, { uniforms: true });
  const p = config.parameters;
  // Each family reads its own groups: a tunable becomes a uniform only where the surface carries its value.
  const tunables: Record<string, IUniform> = {};
  const tunable = (name: string, group: ParameterGroup | undefined, key: string) => { if (group?.[key] !== undefined) tunables[name] = { value: value(group, key) }; };
  tunable('surface_specular', p.adjust, 'specular');
  tunable('surface_specularTinting', p.adjust, 'specularTinting');
  tunable('surface_mixBias', p.terrain, 'mixBias');
  tunable('surface_splatterOverlayFactor', p.terrain, 'splatterOverlay');
  tunable('surface_patternStrength', p.terrain, 'patternStrength');
  tunable('surface_decalStrength', p.decal, 'strength');
  tunable('surface_decalThickness', p.decal, 'thickness');
  tunable('surface_decalSoftness', p.decal, 'softness');
  tunable('surface_decalDetail', p.decal, 'detail');
  tunable('surface_detailStrength', p.detail, 'albedo');
  tunable('surface_kerbMixBias', p.kerbBlend, 'mixBias');
  tunable('surface_kerbDefaultBlend', p.kerbBlend, 'default');
  tunable('surface_noOverlayRoughness', p.bare, 'roughness');
  tunable('surface_noOverlaySpecular', p.bare, 'specular');
  tunable('surface_grooveRoughness', p.groove, 'roughness');
  tunable('surface_grooveSpecular', p.groove, 'specular');
  if (p.groove) tunables.surface_grooveAlbedo = { value: new Vector3(...list(p.groove, 'albedo') as [number, number, number]) };
  for (const [prefix, group] of [['single', p.singleCoat], ['base', p.baseCoat], ['coat', p.clearCoat]] as const) {
    tunable(`surface_${prefix}Roughness`, group, 'roughness');
    tunable(`surface_${prefix}IOR`, group, 'ior');
    tunable(`surface_${prefix}Specular`, group, 'specular');
    tunable(`surface_${prefix}NormalStrength`, group, 'normalStrength');
  }
  tunable('surface_coatStrength', p.clearCoat, 'strength');
  if (p.clearCoat) {
    tunables.surface_coatLacquerColour = { value: new Vector3(...list(p.clearCoat, 'lacquerColour') as [number, number, number]) };
    tunables.surface_coatLacquerThickness = { value: Math.max(0.001, value(p.clearCoat, 'lacquerThickness')) };
  }
  const mapScaleUniforms: Record<string, IUniform> = {};
  for (const [key, map] of Object.entries(config.maps)) mapScaleUniforms[`surface_scale_${key}`] = { value: new Vector2(...map!.scale) };

  Object.assign(shader.uniforms, tunables, {
    surface_alphaCut: surfaceAlphaCut,
    surface_normalScale: { value: new Vector2(value(p.adjust, 'normalStrength'), config.normalYSign) },
  }, mapScaleUniforms, config.kind === 'digitalFlag' ? { surface_flag_elapsed: digitalFlagClock } : {}, uniforms);

  const neededUvs = new Set<string>();
  for (const map of Object.values(config.maps)) if (map?.uv) neededUvs.add(map.uv);
  const hasUv1 = neededUvs.has('uv1'), hasUv2 = neededUvs.has('uv2'), hasUv3 = neededUvs.has('uv3');
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    ${hasUv1 ? '#ifndef USE_UV1\n    attribute vec2 uv1;\n    #endif' : 'vec2 uv1 = vec2(0.0);'}
    ${hasUv2 ? '#ifndef USE_UV2\n    attribute vec2 uv2;\n    #endif' : 'vec2 uv2 = vec2(0.0);'}
    ${hasUv3 ? '#ifndef USE_UV3\n    attribute vec2 uv3;\n    #endif' : 'vec2 uv3 = vec2(0.0);'}
    attribute vec4 _lmu_colour;
    varying vec2 vSurfaceXZ;
    varying float vSurfaceRandom;
    varying vec4 vSurfaceUV01, vSurfaceUV23, vSurfaceColour;
  `).replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceXZ = position.xz; vSurfaceRandom=fract(abs(position.x+position.z)); vSurfaceUV01 = vec4(uv,uv1); vSurfaceUV23 = vec4(uv2,uv3); vSurfaceColour = _lmu_colour;');
  if (config.billboard) {
    const crown = config.kind === 'vegetation';
    if (crown) shader.uniforms[CROWN_SUN_UNIFORM] = crownSun;
    patchBillboardVertex(shader, 'cameraPosition', crown);
    // A card and its own shadow lie in one plane: its cascade lookup skips its own depth (shadows/cascadeSampling.ts).
    shader.fragmentShader = `#define SURFACE_CARD
${shader.fragmentShader}`;
  }
  const occlusion = config.kind === 'clearcoat'
    ? 'reflectedLight.directSpecular*=surfaceSpecularOcclusion;reflectedLight.indirectSpecular*=surfaceSpecularOcclusion;clearcoatSpecularDirect*=surfaceSpecularOcclusion;clearcoatSpecularIndirect*=surfaceSpecularOcclusion;'
    : code.occlusion;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${code.declarations}`)
    .replace('#include <map_fragment>', code.albedo)
    // A cut-out's own alpha is its coverage in the multisampled scene pass, so wire thinner than a pixel still dims what is behind
    // it; passes without multisampling cut at the threshold.
    .replace('#include <alphatest_fragment>', '#ifdef USE_ALPHATEST\n if (diffuseColor.a < alphaTest * surface_alphaCut || diffuseColor.a == 0.0) discard;\n#endif')
    .replace('#include <alphatest_pars_fragment>', '#include <alphatest_pars_fragment>\nuniform float surface_alphaCut;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(surfaceRoughness,0.045,1.0);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = clamp(surfaceMetallic,0.0,1.0);')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n { ${code.normals} }`)
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n { material.specularColor=mix(material.specularColor*surfaceSpecular,diffuseColor.rgb,metalnessFactor); material.specularColorBlended=mix(material.specularColorBlended*surfaceSpecular,diffuseColor.rgb,metalnessFactor); material.specularF90=mix(surfaceSpecular,1.0,metalnessFactor); }')
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=surfaceAO;${occlusion}`);

  if (code.physical) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${code.physical}`);
  if (code.coatNormals) shader.fragmentShader = shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n${code.coatNormals}`);
  if (code.finish) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${code.finish}\n#include <opaque_fragment>`);
  if (code.absorption) shader.fragmentShader = shader.fragmentShader.replace('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )', `outgoingLight = outgoingLight * (${code.absorption}) * ( 1.0 - material.clearcoat * Fcc )`);
  if (code.emissive) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance=${code.emissive};`);
  // The light loop takes the place of the include, so the reflection inputs go in with it.
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
    `${REFLECTING_KINDS.has(config.kind) ? `${SCENERY_REFLECTION_INPUTS}\n` : ''}${ShaderChunk.lights_fragment_begin}`);
  patchCascadeShadow(shader, config.normalShadowInfluence, sunShade(config.kind));
  patchAmbientLookup(shader);
  if (REFLECTING_KINDS.has(config.kind)) {
    Object.assign(shader.uniforms, sceneryReflectionUniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${SCENERY_REFLECTION_GLSL}`);
  }
  if (config.kind === 'vegetation') {
    if (hasTranslucency(config)) {
      // Leaf translucency from the material's power and scale: pow(saturate(dot(eye-to-point, normalize(N + L))), Power) * leaf mask
      // * Scale, times the shadowed sun and albedo over pi. Leaves seen against the sun glow; the card keeps its own normal, so fronds
      // facing away from the sun stay shaded.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        void surfaceLeafDirect(const in IncidentLight light, const in vec3 position, const in vec3 normal,
          const in vec3 viewDir, const in vec3 coatNormal, const in PhysicalMaterial material, inout ReflectedLight reflected) {
          RE_Direct_Physical(light,position,normal,viewDir,coatNormal,material,reflected);
           {
            float scatter = pow(clamp(dot(-viewDir,normalize(normal+light.direction)),0.0,1.0),${glslNumber(value(p.translucency, 'power'))});
            reflected.directDiffuse += light.color * material.diffuseColor * (surfaceLeafMask * scatter * ${glslNumber(value(p.translucency, 'scale'))}) * RECIPROCAL_PI;
          }
        }
        #undef RE_Direct
        #define RE_Direct surfaceLeafDirect
      `);
    }
  }
}

/** Materials whose configs generate the same GLSL share one compiled program. */
export function computeCustomProgramCacheKey(config: SurfaceConfig): string {
  const parts = shaderParts(config, { uniforms: true });
  const hooks = {
    billboard: !!config.billboard,
    translucency: hasTranslucency(config) ? config.parameters.translucency : null,
  };
  const code = JSON.stringify({ parts, hooks });
  let hash = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${config.kind}_${(hash >>> 0).toString(36)}`;
}
