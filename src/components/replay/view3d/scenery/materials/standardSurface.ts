import { glslNumber, list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

type Blend = 'albedo' | 'scalar';

/** Reconstruction of the S397 Standard/StandardBlend source shader (ps30_IBLStandard, ps30_IBLStandardBlend). */
export function standardShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags: f } = config;
  const adjust = p.Material_Adjust, base = p.Base_Material, detail = p.Detail;
  const on = (flag: string) => !!f[flag] && f[flag] !== '@Undef';
  const num = (v: number, name: string) => uniforms ? name : number(v);
  const n = (group: ParameterGroup | undefined, key: string, fallback: number) => number(value(group, key, fallback));
  const colourSquared = (rgb: readonly number[]) => `vec4(${vec(rgb.slice(0, 3).map(x => x * x))},1.0)`;
  const functionBlend = (x: string, y: string, mode: string | undefined, kind: Blend = 'scalar') => {
    if (!mode || mode === '@Undef') return x;
    if (mode === 'Switch') return y;
    if (mode === 'Multiply') return `(${x} * ${y})`;
    if (mode === 'MultiplySquare' && kind === 'albedo') return `(${x} * ${y} * ${y})`;
    if (mode === 'Overlay') return `surfaceOverlay(${x},${y})`;
    if (mode === 'Add') return `(${x}+${y})`;
    if (mode === 'Subtract') return `(${x}-${y})`;
    throw Error(`Unsupported StandardBlend ${kind} function: ${mode}`);
  };
  const scalarBlend = (x: string, y: string, mode: string | undefined) => {
    if (mode === 'Overlay') return `surfaceOverlay1(${x},${y})`;
    if (mode === 'Subtract') return `(${y}-${x})`;
    return functionBlend(x, y, mode, 'scalar');
  };
  const maskName = f.BLENDMASK ?? '@Undef';
  const masks: Record<string, string> = {
    '@Undef': '1.0', VertexAlpha: 'vSurfaceColour.a', VertexColor_R: 'vSurfaceColour.r',
    AlbedoA_A: 'base.a', AlbedoB_A: 'alternate.a', BlendMap_R: `${sample('blend')}.r`,
    DetailAlpha: `detail.a*${n(detail, 'AlbedoDetailBlend', 1)}`,
    // Retained for older decoded records; this value is not an HLSL StandardBlend option.
    EmissiveMap_A: `${sample('emissive')}.a`,
  };
  const rawMask: string | undefined = masks[maskName];
  if (!rawMask) throw Error(`Unsupported source blend mask ${maskName}`);
  const maskedBlend = (control: string) => maskName === 'DetailAlpha' ? `detail.a*${n(detail, control, 1)}` : rawMask;
  const standardBlend = config.kind === 'standardBlend' || config.shader === 'ps30_IBLStandardBlend';
  const baseAlbedoFallback = colourSquared(list(base, 'Albedo', [1, 1, 1, 1]));
  const altAlbedoFallback = colourSquared(list(base, 'AlbedoAlt', [1, 1, 1, 1]));
  let albedo = `
    vec4 base=${sample('albedo', baseAlbedoFallback)};
    vec4 alternate=${sample('alternate', altAlbedoFallback)};
    // Declared before the blend mask: DetailAlpha masks read detail.a.
    vec4 detail=${sample('detail')};
    surfaceStandardBlend=${rawMask};
    ${maskName === 'AlbedoA_A' ? 'base.a=1.0;' : ''}
    ${maskName === 'AlbedoB_A' ? 'alternate.a=1.0;' : ''}
    vec3 surfaceAlbedo=mix(base.rgb,${functionBlend('base.rgb', 'alternate.rgb', f.ALBEDOFUNCTION, 'albedo')},surfaceStandardBlend);
    vec4 mr=${sample('metalRough', `vec4(${n(base, 'Metallic', 0)},${n(base, 'Roughness', .5)},0.0,1.0)`)};
    vec4 mrAlt=${sample('metalRoughAlt', `vec4(${n(base, 'MetallicAlt', 0)},${n(base, 'RoughnessAlt', .5)},0.0,1.0)`)};
    ${!maps.metalRough && maps.albedo && (on('ROUGHNESSALBEDOALPHA') || on('ROUGHNESSALBEDOLPHA')) ? 'mr.g=base.a;' : ''}
    ${!maps.metalRoughAlt && on('ROUGHNESSALBEDOALTALPHA') ? 'mrAlt.g=alternate.a;' : ''}
    float sourceMetallic=mix(mr.r,${scalarBlend('mr.r', 'mrAlt.r', f.METALLICFUNCTION)},${maskedBlend('MetallicDetailBlend')});
    float sourceRoughness=mix(mr.g,${scalarBlend('mr.g', 'mrAlt.g', f.ROUGHNESSFUNCTION)},${maskedBlend('RoughnessDetailBlend')});
    vec4 aoSpec=${sample('aoSpec', 'vec4(1.0)')};
    ${maps.aoSpecAlt ? `aoSpec.rg*=${sample('aoSpecAlt')}.rg;` : ''}
    surfaceSpecular=${num(value(adjust, 'SpecularLevel', .5), 'surface_specular')};
    surfaceAO=aoSpec.g;
  `;
  if (maps.detail && on('DETAILALBEDO')) {
    const strength = n(detail, 'Albedo', 1);
    if (f.DETAILALBEDO === 'AlphaBlend' || on('DETAILALBEDOBLEND'))
      albedo += `surfaceAlbedo=mix(surfaceAlbedo,detail.rgb,${strength}*detail.a);`;
    else if (f.DETAILALBEDO === 'Multiply')
      albedo += `surfaceAlbedo*=mix(vec3(1.0),detail.rgb,${strength}${f.VERTEXALPHA === 'DetailBlend' ? '*vSurfaceColour.a' : ''});`;
    else if (f.DETAILALBEDO === 'AddSub' || f.DETAILALBEDO === '@Null')
      albedo += `surfaceAlbedo+=${strength}${f.VERTEXALPHA === 'DetailBlend' ? '*vSurfaceColour.a' : ''}*2.0*(detail.rgb-vec3(0.5));`;
    else throw Error(`Unsupported Standard detail albedo mode: ${f.DETAILALBEDO}`);
  }
  if (maps.detail && on('DETAILAO'))
    albedo += `surfaceAO=mix(surfaceAO,${n(detail, 'Ao', 1)},detail.a*${n(detail, 'AoBlend', 1)});`;
  if (maps.detail && on('DETAILSPEC'))
    albedo += `surfaceSpecular=mix(surfaceSpecular,${n(detail, 'SpecularLevel', .5)},detail.a*${n(detail, 'SpecularBlend', 1)});`;
  if (maps.detail && on('DETAILROUGHNESS'))
    albedo += `sourceRoughness=mix(sourceRoughness,${n(detail, 'Roughness', 1)},detail.a*${n(detail, 'RoughnessBlend', 1)});`;
  if (maps.detail && on('DETAILMETALLIC'))
    albedo += `sourceMetallic=mix(sourceMetallic,${n(detail, 'Metallic', 0)},detail.a*${n(detail, 'MetallicBlend', 0)});`;
  if (f.VERTEXALPHA === 'AoMultiply') albedo += 'surfaceAO*=vSurfaceColour.a;';
  if (f.VERTEXCOLOR === 'AoMultiply') albedo += 'surfaceAO*=vSurfaceColour.r;';
  const tint = list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3);
  const sourceAlpha = (maps.albedo && !maps.metalRough && (on('ROUGHNESSALBEDOALPHA') || on('ROUGHNESSALBEDOLPHA'))) || maskName === 'AlbedoA_A' ? '1.0' : 'base.a';
  albedo += `surfaceMetallic=surfaceAdjust(sourceMetallic,${num(value(adjust, 'Metallic', .5), 'metalness')});
    surfaceRoughness=surfaceAdjust(sourceRoughness,${num(value(adjust, 'Roughness', .5), 'roughness')});
    diffuseColor.rgb${uniforms ? '=' : '*='}${uniforms ? 'surfaceAlbedo*diffuse' : `surfaceAlbedo*${vec(tint)}*${vec(tint)}`};
    diffuseColor.a*=${sourceAlpha};
    ${f.VERTEXCOLOR === 'AlbedoMultiply' ? 'diffuseColor.rgb*=vSurfaceColour.rgb;' : ''}`;
  const normalUV = maps.normal ? 'normal' : maps.normalAlt ? 'normalAlt' : 'detail';
  const baseEncoded = maps.normal ? `${sample('normal')}.rg` : 'vec2(0.5)';
  const altEncoded = maps.normalAlt ? `${sample('normalAlt')}.rg` : 'vec2(0.5)';
  let baseNormalEncoded = baseEncoded, overlayNormalEncoded = altEncoded;
  let normalBlend = 'surfaceStandardBlend';
  if (standardBlend && f.NORMALFUNCTION && f.NORMALFUNCTION !== '@Undef') {
    if (maskName === 'DetailAlpha') normalBlend = `detail.a*${n(detail, 'NormalDetailBlend', 1)}`;
    if (f.NORMALFUNCTION === 'Switch') baseNormalEncoded = `mix(${baseEncoded},${altEncoded},${normalBlend})`;
    else if (f.NORMALFUNCTION !== 'Overlay') throw Error(`Unsupported normal blend function: ${f.NORMALFUNCTION}`);
  }
  if (maps.detail && on('DETAILNORMAL')) {
    const detailNormal = vec(list(detail, 'Normal', [.5, .5]).slice(0, 2));
    baseNormalEncoded = `mix(${baseNormalEncoded},${detailNormal},${sample('detail')}.a*${n(detail, 'NormalBlend', 1)})`;
    if (standardBlend && f.NORMALFUNCTION === 'Overlay')
      overlayNormalEncoded = `mix(${overlayNormalEncoded},${detailNormal},${sample('detail')}.a*${n(detail, 'NormalAltBlend', 1)})`;
  }
  const intensity = num(value(adjust, 'NormalIntensity', 1), 'surface_normalScale.x'), ySign = num(config.normalYSign, 'surface_normalScale.y');
  const decoded = `surfaceDecodeNormal(${baseNormalEncoded},${intensity},${ySign})`;
  let tangentNormal = decoded;
  if (standardBlend && f.NORMALFUNCTION === 'Overlay') {
    const overlay = `surfaceDecodeNormal(${overlayNormalEncoded},${intensity}*${normalBlend},${ySign})`;
    tangentNormal = `normalize(vec3((${decoded}).xy+(${overlay}).xy,(${decoded}).z*(${overlay}).z))`;
  }
  const normals = (maps.normal || maps.normalAlt || maps.detail && on('DETAILNORMAL'))
    ? `normal=surfaceNormalVector(normal,${uv(normalUV)},${tangentNormal});` : 'vec3 sourceGeometryNormal=normal;';
  const f0 = ((1.4 - 1) / (1.4 + 1)) ** 2;
  // IBLShared treats emission as diffuse illumination, not standalone additive radiance.
  const emissiveMask = ['Mask_RGB', 'Mask_RGBA'].includes(f.EMISSIVEMAP ?? '') ? `${sample('emissive')}.rgb` : f.EMISSIVEMAP === 'Mask_RG' ? `vec3(${sample('emissive')}.g)` : 'vec3(1.0)';
  const emissive = f.EMISSIVEMODE === 'Enabled'
    ? `${vec(list(p.Emissive, 'Colour', [1, 1, 1]).slice(0, 3).map(x => x * x))}*${n(p.Emissive, 'Scalar', 0)}*${emissiveMask}*diffuseColor.rgb*${glslNumber(1 / Math.PI)}*(1.0-surfaceMetallic)*(1.0-surfaceSpecular*${glslNumber(f0)})`
    : 'vec3(0.0)';
  const physical = `material.specularColor=vec3(${glslNumber(f0)}); material.specularColorBlended=vec3(${glslNumber(f0)});`;
  return { albedo, normals, emissive, physical, occlusion: maps.aoSpec ? 'reflectedLight.indirectSpecular*=aoSpec.r;' : '' };
}
