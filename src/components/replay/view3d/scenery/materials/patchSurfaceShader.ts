import { Vector2, Vector3, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { digitalFlagClock } from './flagSurface.js';
import { glslNumber, list, value } from './shaderContext.js';
import { shaderParts } from './shaderParts.js';
import type { SurfaceConfig } from './surfaceConfig.js';

const hasTranslucency = (config: SurfaceConfig) => !!config.flags.TRANSLUCENCY && config.flags.TRANSLUCENCY !== '@Undef';

/**
 * Rewrites a `MeshStandardMaterial`/`MeshPhysicalMaterial` program into the native surface: tunables become uniforms (so one program
 * serves every material of the same shape), and the albedo, normal, emissive and occlusion includes are replaced by the family's GLSL.
 * `uniforms` carries the per-material sampler and scale uniforms.
 */
export function patchSurfaceShader(shader: WebGLProgramParametersWithUniforms, config: SurfaceConfig, uniforms: Record<string, IUniform>): void {
  const code = shaderParts(config, { uniforms: true });
  const p = config.parameters;
  const adjust = p.Material_Adjust, decal = p.Decal, noOverlay = p.No_Overlay_Base, blend = p.Albedo_Blend, terrain = p.Terrain;
  const single = p.SingleCoat, baseCoat = p.BaseCoat, clearCoat = p.ClearCoat, detail = p.Detail;

  const mapScaleUniforms: Record<string, IUniform> = {};
  for (const [key, map] of Object.entries(config.maps)) mapScaleUniforms[`surface_scale_${key}`] = { value: new Vector2(...(map?.scale ?? [1, 1])) };

  Object.assign(shader.uniforms, {
    surface_specular: { value: value(adjust, 'SpecularLevel', 0.5) },
    surface_specularTinting: { value: value(adjust, 'SpecularTinting', 0) },
    surface_mixBias: { value: value(terrain, 'MixMapBias', 0.5) },
    surface_splatterOverlayFactor: { value: value(terrain, 'SplatterOverlay', 1.0) },
    surface_patternStrength: { value: value(terrain, 'PatternStrength', 1.0) },
    surface_decalStrength: { value: value(decal, 'Strength', 1.0) },
    surface_decalThickness: { value: value(decal, 'Thickness', 0.5) },
    surface_decalSoftness: { value: value(decal, 'Softness', 0.1) },
    surface_decalDetail: { value: value(decal, 'Detail', 0.0) },
    surface_detailStrength: { value: value(detail, 'Albedo', 1.0) },
    surface_normalScale: { value: new Vector2(value(adjust, 'NormalIntensity', 1.0), config.normalYSign) },
    surface_kerbMixBias: { value: value(blend, 'MixBias', 0.5) },
    surface_kerbDefaultBlend: { value: value(blend, 'Default', 1.0) },
    surface_noOverlayRoughness: { value: value(noOverlay, 'Roughness', 0.7) },
    surface_noOverlaySpecular: { value: value(noOverlay, 'SpecularLevel', 0.5) },
    surface_singleRoughness: { value: value(single, 'Roughness', 0.3) },
    surface_baseRoughness: { value: value(baseCoat, 'Roughness', 0.35) },
    surface_coatRoughness: { value: value(clearCoat, 'Roughness', 0.3) },
    surface_coatStrength: { value: value(clearCoat, 'Strength', 1.0) },
    surface_singleIOR: { value: value(single, 'RefractiveIndex', 1.3) },
    surface_baseIOR: { value: value(baseCoat, 'RefractiveIndex', 1.65) },
    surface_coatIOR: { value: value(clearCoat, 'RefractiveIndex', 1.3) },
    surface_singleSpecular: { value: value(single, 'Specular', 1.0) },
    surface_baseSpecular: { value: value(baseCoat, 'Specular', 0.5) },
    surface_singleNormalStrength: { value: value(single, 'NormalStrength', 1.0) },
    surface_baseNormalStrength: { value: value(baseCoat, 'NormalStrength', 1.0) },
    surface_coatNormalStrength: { value: value(clearCoat, 'NormalStrength', 1.0) },
    surface_coatLacquerColour: { value: new Vector3(...list(clearCoat, 'LacquerColour', [1, 1, 1]).slice(0, 3) as [number, number, number]) },
    surface_coatLacquerThickness: { value: Math.max(0.001, value(clearCoat, 'LacquerThickness', 0.03)) },
  }, mapScaleUniforms, config.kind === 'digitalFlag' ? { surface_flag_elapsed: digitalFlagClock } : {}, uniforms);

  const neededUvs = new Set<string>();
  for (const map of Object.values(config.maps)) if (map?.uv) neededUvs.add(map.uv);
  const hasUv1 = neededUvs.has('UV_B'), hasUv2 = neededUvs.has('UV_C'), hasUv3 = neededUvs.has('UV_D');
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
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 _lmu_pivot;
      attribute vec2 _lmu_corner;
    `).replace('#include <beginnormal_vertex>', `
      // The card turns about its pivot to face the camera, and so does its normal: the authored normal belongs to the rest plane
      // and, kept, left whole crowds facing away from the sun. transpose(M) * d is the local normal whose world normal is d.
      vec3 pivotWorld = (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz;
      vec3 directionToCamera = cameraPosition - pivotWorld;
      directionToCamera.y = 0.0;
      bool facingCamera = length(directionToCamera) > 0.0001;
      vec3 rightWorld = facingCamera ? normalize(cross(vec3(0.0,1.0,0.0), directionToCamera)) : vec3(1.0,0.0,0.0);
      vec3 rightLocal = normalize(rightWorld * mat3(modelMatrix));
      vec3 objectNormal = facingCamera ? normalize(normalize(directionToCamera) * mat3(modelMatrix)) : normal;
      #ifdef USE_TANGENT
        vec3 objectTangent = rightLocal;
      #endif
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed = _lmu_pivot + rightLocal * _lmu_corner.x + vec3(0.0,_lmu_corner.y,0.0);
    `);
  }
  const occlusion = config.kind === 'clearcoat'
    ? 'reflectedLight.directSpecular*=surfaceSpecularOcclusion;reflectedLight.indirectSpecular*=surfaceSpecularOcclusion;clearcoatSpecularDirect*=surfaceSpecularOcclusion;clearcoatSpecularIndirect*=surfaceSpecularOcclusion;'
    : code.occlusion;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${code.declarations}`)
    .replace('#include <map_fragment>', code.albedo)
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
  if (config.kind === 'vegetation') {
    if (config.flags.BILLBOARD === 'Pointy') shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize(mat3(viewMatrix) * vec3(0.0,1.0,0.0));');
    if (hasTranslucency(config)) {
      // Source leaf mask/power/scale; view/light backscatter curve is an approximation.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        void surfaceLeafDirect(const in IncidentLight light, const in vec3 position, const in vec3 normal,
          const in vec3 viewDir, const in vec3 coatNormal, const in PhysicalMaterial material, inout ReflectedLight reflected) {
          RE_Direct_Physical(light,position,normal,viewDir,coatNormal,material,reflected);
           {
            float scatter = pow(max(dot(-light.direction,viewDir)*0.6+0.4,0.0),${glslNumber(value(p.Translucency, 'Power', 2))});
            reflected.directDiffuse += light.color * material.diffuseColor * (surfaceLeafMask * scatter * ${glslNumber(value(p.Translucency, 'Scale', 1))}) * RECIPROCAL_PI;
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
    billboard: !!config.billboard, pointy: config.flags.BILLBOARD === 'Pointy',
    translucency: hasTranslucency(config) ? config.parameters.Translucency : null,
  };
  const code = JSON.stringify({ parts, hooks });
  let hash = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${config.kind}_${(hash >>> 0).toString(36)}`;
}
