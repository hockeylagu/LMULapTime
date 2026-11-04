import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/**
 * Dry static reconstruction of ps30_IBLVegetation's material inputs. The camera-facing Pointy billboard vertex stage and the
 * translucency lighting hook are patched in by `patchSurfaceShader`.
 */
export function vegetationShaderParts(config: SurfaceConfig, { sample, uv, number, vec }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const base = p.Base_Material, adjust = p.Material_Adjust, detailControls = p.Detail;
  const enabled = (key: string) => !!flags[key] && flags[key] !== '@Undef';
  const n = (group: ParameterGroup | undefined, key: string, fallback: number) => number(value(group, key, fallback));
  const flagOf: Record<string, string> = { albedo: 'ALBEDOMAP', aoSpec: 'AOSPECMAP', leafRough: 'LEAFMASKROUGHNESSMAP', normal: 'NORMALMAP', detail: 'DETAILMAP' };
  const has = (key: string) => !!maps[key] && enabled(flagOf[key]);
  const albedoMap = has('albedo'), aoMap = has('aoSpec'), leafMap = has('leafRough');
  const normalMap = has('normal'), detailMap = has('detail');

  let albedo = `
    vec4 foliageBase=${albedoMap ? sample('albedo') : vec(list(base, 'Albedo', [1, 1, 1, 1]))};
    vec4 foliageLeaf=${leafMap ? sample('leafRough') : `vec4(${n(base, 'LeafMask', 1)},${n(base, 'Roughness', .5)},0.0,1.0)`};
    vec2 foliageAoSpec=${aoMap ? `${sample('aoSpec')}.rg` : 'vec2(1.0)'};
    vec3 foliageAlbedo=${albedoMap ? 'foliageBase.rgb' : 'foliageBase.rgb*foliageBase.rgb'};
    float foliageAlpha=${albedoMap ? 'foliageBase.a' : '1.0'};
    ${detailMap && enabled('DETAILALBEDO') ? `vec4 foliageDetail=${sample('detail')};` : ''}
    surfaceLeafMask=foliageLeaf.r;
    surfaceRoughness=surfaceAdjust(foliageLeaf.g,${n(adjust, 'Roughness', .5)});
    surfaceMetallic=0.0;
    surfaceSpecular=${n(adjust, 'SpecularLevel', .25)}*0.5;
    surfaceAO=foliageAoSpec.g;
    float foliageSpecularOcclusion=foliageAoSpec.r;
  `;

  if (detailMap && enabled('DETAILALBEDO')) {
    const strength = n(detailControls, 'Albedo', 1);
    const blend = flags.DETAILALBEDOBLEND;
    const mask = 'foliageDetail.a';
    if (blend === 'AlphaBlend') albedo += `foliageAlbedo=mix(foliageAlbedo,foliageDetail.rgb,${strength}*${mask});`;
    else if (blend === 'Multiply') albedo += `foliageAlbedo*=mix(vec3(1.0),foliageDetail.rgb,${strength}*${mask});`;
    else if (blend === 'Overlay') albedo += `foliageAlbedo*=mix(foliageAlbedo,surfaceOverlay(foliageAlbedo,foliageDetail.rgb),${strength}*${mask});`;
    else {
      const alphaMask = flags.VERTEXALPHA === 'DetailBlend' ? '*vSurfaceColour.a' : '';
      albedo += `foliageAlbedo+=${strength}*2.0*(foliageDetail.rgb-vec3(0.5))*${mask}${alphaMask};`;
    }
  }
  if (flags.VERTEXCOLOR === 'AlbedoMultiply' || flags.VERTEXCOLOR === 'AlbedoMultiply_MaskAlbA')
    albedo += 'foliageAlbedo*=vSurfaceColour.rgb;';
  else if (flags.VERTEXCOLOR === 'AlbedoOverlay' || flags.VERTEXCOLOR === 'AlbedoOverlay_MaskAlbA')
    albedo += 'vec3 foliageOverlay=sqrt(max(foliageAlbedo,vec3(0.0))); foliageOverlay=surfaceOverlay(foliageOverlay,vSurfaceColour.rgb); foliageAlbedo=clamp(foliageOverlay*foliageOverlay,vec3(0.0),vec3(1.0));';
  if (detailMap && enabled('DETAILSPEC'))
    albedo += `surfaceSpecular=mix(surfaceSpecular,${n(detailControls, 'Specular', 1)},foliageDetail.a*${n(detailControls, 'SpecularBlend', 1)});`;
  if (detailMap && enabled('DETAILAO'))
    albedo += `surfaceAO=mix(surfaceAO,${n(detailControls, 'Ao', 1)},foliageDetail.a*${n(detailControls, 'AoBlend', 1)});`;
  if (detailMap && enabled('DETAILROUGHNESS'))
    albedo += `surfaceRoughness=mix(surfaceRoughness,${n(detailControls, 'Roughness', 1)},foliageDetail.a*${n(detailControls, 'RoughnessBlend', 1)});`;
  if (flags.VERTEXALPHA === 'AoMultiply') albedo += 'surfaceAO*=vSurfaceColour.a;';
  if (flags.VERTEXCOLOR === 'AoMultiply') albedo += 'surfaceAO*=vSurfaceColour.r;';
  const albedoTint = vec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));
  albedo += `
    diffuseColor.rgb = foliageAlbedo * ${albedoTint} * ${albedoTint};
    diffuseColor.a*=foliageAlpha;`;

  let normals = '';
  if (normalMap) {
    let encoded = `${sample('normal')}.rg`;
    if (detailMap && enabled('DETAILNORMAL'))
      encoded = `mix(${encoded},${vec(list(detailControls, 'Normal', [0.5, 0.5]).slice(0, 2))},${sample('detail')}.a*${n(detailControls, 'NormalBlend', 1)})`;
    normals = `normal=surfaceNormal(normal,${uv('normal')},${encoded},${n(adjust, 'NormalIntensity', 1)},${number(config.normalYSign)});`;
  }

  const tint = vec(list(adjust, 'SpecularTint', [0.97, 0.99, 0.9]).slice(0, 3));
  const physical = `material.specularColor*=0.69444444*mix(vec3(1.0),${tint}*${tint},surfaceLeafMask); material.specularColorBlended*=0.69444444*mix(vec3(1.0),${tint}*${tint},surfaceLeafMask);`;
  return { albedo, normals, emissive: 'vec3(0.0)', physical, occlusion: 'reflectedLight.indirectSpecular*=foliageSpecularOcclusion;' };
}
