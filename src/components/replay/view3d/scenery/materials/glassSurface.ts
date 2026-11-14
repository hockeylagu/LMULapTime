import { list, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/**
 * The sun's glint on smooth glass (roughness under 0.1): a flat disc of 1 / (1 − 0.99985) wherever the half vector lies within
 * about 1° of the normal, times the sun, its shadow and Schlick's Fresnel at L·H (F0 0.04), summed with the sun's GGX highlight and
 * the sum halved. The sun is the first directional light; its GGX share is three's direct specular.
 */
const SUN_GLINT = `
  #if NUM_DIR_LIGHTS > 0
  if (surfaceRoughness < 0.1) {
    vec3 glintL = directionalLights[0].direction, glintH = normalize(glintL + geometryViewDir);
    float glintF = 0.04 + 0.96 * pow(1.0 - saturate(dot(glintL, glintH)), 5.0);
    float glintDisc = dot(normal, glintH) > 0.99985 && dot(normal, glintL) > 0.0 ? 1.0 / (1.0 - 0.99985) : 0.0;
    totalSpecular += 0.5 * (directionalLights[0].color * surfaceSunShadow * glintF * glintDisc - reflectedLight.directSpecular);
  }
  #endif`;

/**
 * Glass and the outside of windscreens, from the package's glass parameters: alpha-composited reflections. The glass is a mirror
 * (roughness 0) unless its occlusion/roughness map is on, whose green is then the roughness, remapped by the material's. Its
 * reflections are divided by its opacity before the blend, so they keep their whole strength through clear glass.
 */
export function glassShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): ExtendedParts {
  const a = config.parameters.adjust, f = config.flags;
  const tint = list(a, 'tint').map(v => v * v);
  const rough = f.occlusionRoughness === 'on' && config.maps.occlusionRoughness
    ? `surfaceAdjust(${sample('occlusionRoughness')}.g,${uniforms ? 'roughness' : number(value(a, 'roughness'))})` : '0.0';
  return {
    albedo: `vec4 glassBase=${sample('albedo')};
      diffuseColor.rgb*=glassBase.rgb${uniforms ? '' : `*${vec(tint)}`};
      diffuseColor.a*=glassBase.a;
      ${f.vertexColour === 'albedoMultiply' ? 'diffuseColor.rgb*=vSurfaceColour.rgb;' : ''}
      ${f.vertexAlpha === 'opacityMultiply' ? 'diffuseColor.a*=vSurfaceColour.a;' : ''}
      surfaceRoughness=${rough}; surfaceMetallic=0.0;`,
    normals: config.maps.normal ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${number(value(a, 'normalStrength'))},${number(config.normalYSign)});` : '',
    physical: 'material.specularColor=vec3(0.04); material.specularColorBlended=vec3(0.04);',
    finish: `${SUN_GLINT}
      outgoingLight=totalDiffuse+totalSpecular/clamp(diffuseColor.a+0.001,0.001,1.0)+totalEmissiveRadiance;`,
    emissive: 'vec3(0.0)',
    occlusion: '',
  };
}

/**
 * The inside of a windscreen, seen from the cockpit: diffuse only (its reflections are the outside layer's), lit at its own
 * normal, plus the light reaching its back face (the sun by its shadow's diffuse curve and the ambient light, at the flipped
 * normal with the world height halved) times the albedo and 0.96. That transmitted light weighs by the clear share of the map,
 * one minus its alpha, and is added before the blend, so it shows most through part-clear glass.
 */
export function windscreenInsideShaderParts({ sample }: ShaderContext): ExtendedParts {
  return {
    albedo: `vec4 glassBase=${sample('albedo')};
      diffuseColor*=glassBase;
      float glassClear=1.0-glassBase.a;
      surfaceRoughness=1.0; surfaceMetallic=0.0; surfaceSpecular=0.0;`,
    normals: '',
    physical: '',
    finish: `{ vec3 backNormal=-normal;
      vec3 backLight=getIBLIrradiance(transformDirection(inverseTransformDirection(backNormal,viewMatrix)*vec3(1.0,0.5,1.0),viewMatrix));
      #if NUM_DIR_LIGHTS > 0
      backLight+=directionalLights[0].color*clamp(dot(backNormal,directionalLights[0].direction),0.0,1.0)*min(2.0*surfaceSunShadow,1.0);
      #endif
      outgoingLight=totalDiffuse+totalEmissiveRadiance+backLight*RECIPROCAL_PI*diffuseColor.rgb*0.96*glassClear; }`,
    emissive: 'vec3(0.0)',
    occlusion: '',
  };
}
