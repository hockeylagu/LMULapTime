import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/**
 * Dry static vegetation material inputs. The camera-facing billboard vertex stage and the
 * translucency lighting hook are patched in by `patchSurfaceShader`.
 */
export function vegetationShaderParts(config: SurfaceConfig, { sample, uv, number, vec }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const base = p.base, adjust = p.adjust;
  const n = (group: ParameterGroup | undefined, key: string) => number(value(group, key));
  const flagOf: Record<string, string> = { albedo: 'albedoMap', aoSpec: 'aoSpecMap', leafRough: 'leafRoughMap', normal: 'normalMap' };
  const has = (key: string) => !!maps[key] && !!flags[flagOf[key]];
  const albedoMap = has('albedo'), aoMap = has('aoSpec'), leafMap = has('leafRough'), normalMap = has('normal');

  let albedo = `
    vec4 foliageBase=${albedoMap ? sample('albedo') : vec(list(base, 'albedo'))};
    vec4 foliageLeaf=${leafMap ? sample('leafRough') : `vec4(${n(base, 'leafMask')},${n(base, 'roughness')},0.0,1.0)`};
    vec2 foliageAoSpec=${aoMap ? `${sample('aoSpec')}.rg` : 'vec2(1.0)'};
    vec3 foliageAlbedo=${albedoMap ? 'foliageBase.rgb' : 'foliageBase.rgb*foliageBase.rgb'};
    float foliageAlpha=${albedoMap ? 'foliageBase.a' : '1.0'};
    surfaceLeafMask=foliageLeaf.r;
    surfaceRoughness=surfaceAdjust(foliageLeaf.g,${n(adjust, 'roughness')});
    surfaceMetallic=0.0;
    surfaceSpecular=${n(adjust, 'specular')}*0.5;
    surfaceAO=foliageAoSpec.g;
    float foliageSpecularOcclusion=foliageAoSpec.r;
  `;

  const vertexColour = flags.vertexColour;
  if (vertexColour === 'albedoMultiply' || vertexColour === 'albedoMultiplyMasked')
    albedo += 'foliageAlbedo*=vSurfaceColour.rgb;';
  else if (vertexColour === 'albedoOverlay' || vertexColour === 'albedoOverlayMasked')
    albedo += 'vec3 foliageOverlay=sqrt(max(foliageAlbedo,vec3(0.0))); foliageOverlay=surfaceOverlay(foliageOverlay,vSurfaceColour.rgb); foliageAlbedo=clamp(foliageOverlay*foliageOverlay,vec3(0.0),vec3(1.0));';
  if (flags.vertexAlpha === 'aoMultiply') albedo += 'surfaceAO*=vSurfaceColour.a;';
  if (vertexColour === 'aoMultiply') albedo += 'surfaceAO*=vSurfaceColour.r;';
  const albedoTint = vec(list(adjust, 'tint'));
  albedo += `
    diffuseColor.rgb = foliageAlbedo * ${albedoTint} * ${albedoTint};
    diffuseColor.a*=foliageAlpha;`;

  const normals = normalMap
    ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${n(adjust, 'normalStrength')},${number(config.normalYSign)});` : '';

  const tint = vec(list(adjust, 'specularTint'));
  const physical = `material.specularColor*=0.69444444*mix(vec3(1.0),${tint}*${tint},surfaceLeafMask); material.specularColorBlended*=0.69444444*mix(vec3(1.0),${tint}*${tint},surfaceLeafMask);`;
  return { albedo, normals, emissive: 'vec3(0.0)', physical, occlusion: 'reflectedLight.indirectSpecular*=foliageSpecularOcclusion;' };
}
