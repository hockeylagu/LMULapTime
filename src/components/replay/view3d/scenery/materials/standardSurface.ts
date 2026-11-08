import { glslNumber, list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

type Blend = 'albedo' | 'scalar';

/** Standard and StandardBlend materials, from the package's material flags, maps and parameters. */
export function standardShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags: f } = config;
  const adjust = p.adjust, base = p.base, detail = p.detail;
  const on = (flag: string) => !!f[flag];
  const num = (v: number, name: string) => uniforms ? name : number(v);
  const n = (group: ParameterGroup | undefined, key: string) => number(value(group, key));
  const colourSquared = (rgb: readonly number[]) => `vec4(${vec(rgb.slice(0, 3).map(x => x * x))},1.0)`;
  const functionBlend = (x: string, y: string, mode: string | undefined, kind: Blend = 'scalar') => {
    if (!mode) return x;
    if (mode === 'switch') return y;
    if (mode === 'multiply') return `(${x} * ${y})`;
    if (mode === 'multiplySquare' && kind === 'albedo') return `(${x} * ${y} * ${y})`;
    if (mode === 'overlay') return `surfaceOverlay(${x},${y})`;
    if (mode === 'add') return `(${x}+${y})`;
    if (mode === 'subtract') return `(${x}-${y})`;
    throw Error(`Unsupported StandardBlend ${kind} function: ${mode}`);
  };
  const scalarBlend = (x: string, y: string, mode: string | undefined) => {
    if (mode === 'overlay') return `surfaceOverlay1(${x},${y})`;
    if (mode === 'subtract') return `(${y}-${x})`;
    return functionBlend(x, y, mode, 'scalar');
  };
  const maskName = f.blendMask ?? 'none';
  const masks: Record<string, string> = {
    none: '1.0', vertexAlpha: 'vSurfaceColour.a', vertexRed: 'vSurfaceColour.r',
    albedoAlpha: 'base.a', albedoAltAlpha: 'alternate.a', blendMapRed: `${sample('blend')}.r`,
    detailAlpha: `detail.a*${n(detail, 'maskAlbedo')}`,
    // Retained for older decoded records; this value is not a StandardBlend option.
    emissiveAlpha: `${sample('emissive')}.a`,
  };
  const rawMask: string | undefined = masks[maskName];
  if (!rawMask) throw Error(`Unsupported source blend mask ${maskName}`);
  const maskedBlend = (control: string) => maskName === 'detailAlpha' ? `detail.a*${n(detail, control)}` : rawMask;
  const baseAlbedoFallback = colourSquared(list(base, 'albedo'));
  const altAlbedoFallback = colourSquared(list(base, 'albedoAlt'));
  let albedo = `
    vec4 base=${sample('albedo', baseAlbedoFallback)};
    vec4 alternate=${sample('alternate', altAlbedoFallback)};
    // Declared before the blend mask: detail-alpha masks read detail.a.
    vec4 detail=${sample('detail')};
    surfaceStandardBlend=${rawMask};
    ${maskName === 'albedoAlpha' ? 'base.a=1.0;' : ''}
    ${maskName === 'albedoAltAlpha' ? 'alternate.a=1.0;' : ''}
    vec3 surfaceAlbedo=mix(base.rgb,${functionBlend('base.rgb', 'alternate.rgb', f.albedoBlend, 'albedo')},surfaceStandardBlend);
    vec4 mr=${sample('metalRough', `vec4(${n(base, 'metalness')},${n(base, 'roughness')},0.0,1.0)`)};
    vec4 mrAlt=${sample('metalRoughAlt', `vec4(${n(base, 'metalnessAlt')},${n(base, 'roughnessAlt')},0.0,1.0)`)};
    ${!maps.metalRough && maps.albedo && on('roughnessFromAlbedoAlpha') ? 'mr.g=base.a;' : ''}
    ${!maps.metalRoughAlt && on('roughnessFromAlbedoAltAlpha') ? 'mrAlt.g=alternate.a;' : ''}
    float sourceMetallic=mix(mr.r,${scalarBlend('mr.r', 'mrAlt.r', f.metalnessBlend)},${maskedBlend('maskMetalness')});
    float sourceRoughness=mix(mr.g,${scalarBlend('mr.g', 'mrAlt.g', f.roughnessBlend)},${maskedBlend('maskRoughness')});
    vec4 aoSpec=${sample('aoSpec', 'vec4(1.0)')};
    ${maps.aoSpecAlt ? `aoSpec.rg*=${sample('aoSpecAlt')}.rg;` : ''}
    surfaceSpecular=${num(value(adjust, 'specular'), 'surface_specular')};
    surfaceAO=aoSpec.g;
  `;
  if (maps.detail && f.detailAlbedo) {
    const strength = n(detail, 'albedo');
    if (f.detailAlbedo === 'alphaBlend')
      albedo += `surfaceAlbedo=mix(surfaceAlbedo,detail.rgb,${strength}*detail.a);`;
    else if (f.detailAlbedo === 'multiply')
      albedo += `surfaceAlbedo*=mix(vec3(1.0),detail.rgb,${strength}${f.vertexAlpha === 'detailBlend' ? '*vSurfaceColour.a' : ''});`;
    else if (f.detailAlbedo === 'addSub')
      albedo += `surfaceAlbedo+=${strength}${f.vertexAlpha === 'detailBlend' ? '*vSurfaceColour.a' : ''}*2.0*(detail.rgb-vec3(0.5));`;
    else throw Error(`Unsupported Standard detail albedo mode: ${f.detailAlbedo}`);
  }
  if (maps.detail && on('detailAo'))
    albedo += `surfaceAO=mix(surfaceAO,${n(detail, 'ao')},detail.a*${n(detail, 'aoBlend')});`;
  if (maps.detail && on('detailSpecular'))
    albedo += `surfaceSpecular=mix(surfaceSpecular,${n(detail, 'specular')},detail.a*${n(detail, 'specularBlend')});`;
  if (maps.detail && on('detailRoughness'))
    albedo += `sourceRoughness=mix(sourceRoughness,${n(detail, 'roughness')},detail.a*${n(detail, 'roughnessBlend')});`;
  if (maps.detail && on('detailMetalness'))
    albedo += `sourceMetallic=mix(sourceMetallic,${n(detail, 'metalness')},detail.a*${n(detail, 'metalnessBlend')});`;
  if (f.vertexAlpha === 'aoMultiply') albedo += 'surfaceAO*=vSurfaceColour.a;';
  if (f.vertexColour === 'aoMultiply') albedo += 'surfaceAO*=vSurfaceColour.r;';
  const tint = list(adjust, 'tint');
  const sourceAlpha = (maps.albedo && !maps.metalRough && on('roughnessFromAlbedoAlpha')) || maskName === 'albedoAlpha' ? '1.0' : 'base.a';
  albedo += `surfaceMetallic=surfaceAdjust(sourceMetallic,${num(value(adjust, 'metalness'), 'metalness')});
    surfaceRoughness=surfaceAdjust(sourceRoughness,${num(value(adjust, 'roughness'), 'roughness')});
    diffuseColor.rgb${uniforms ? '=' : '*='}${uniforms ? 'surfaceAlbedo*diffuse' : `surfaceAlbedo*${vec(tint)}*${vec(tint)}`};
    diffuseColor.a*=${sourceAlpha};
    ${f.vertexColour === 'albedoMultiply' ? 'diffuseColor.rgb*=vSurfaceColour.rgb;' : ''}`;
  const normalUV = maps.normal ? 'normal' : maps.normalAlt ? 'normalAlt' : 'detail';
  const baseEncoded = maps.normal ? `${sample('normal')}.rg` : 'vec2(0.5)';
  const altEncoded = maps.normalAlt ? `${sample('normalAlt')}.rg` : 'vec2(0.5)';
  let baseNormalEncoded = baseEncoded, overlayNormalEncoded = altEncoded;
  let normalBlend = 'surfaceStandardBlend';
  // Only StandardBlend materials carry a normal blend.
  if (f.normalBlend) {
    if (maskName === 'detailAlpha') normalBlend = `detail.a*${n(detail, 'maskNormal')}`;
    if (f.normalBlend === 'switch') baseNormalEncoded = `mix(${baseEncoded},${altEncoded},${normalBlend})`;
    else if (f.normalBlend !== 'overlay') throw Error(`Unsupported normal blend function: ${f.normalBlend}`);
  }
  if (maps.detail && on('detailNormal')) {
    const detailNormal = vec(list(detail, 'normal'));
    baseNormalEncoded = `mix(${baseNormalEncoded},${detailNormal},${sample('detail')}.a*${n(detail, 'normalBlend')})`;
    if (f.normalBlend === 'overlay')
      overlayNormalEncoded = `mix(${overlayNormalEncoded},${detailNormal},${sample('detail')}.a*${n(detail, 'normalAltBlend')})`;
  }
  const intensity = num(value(adjust, 'normalStrength'), 'surface_normalScale.x'), ySign = num(config.normalYSign, 'surface_normalScale.y');
  const decoded = `surfaceDecodeNormal(${baseNormalEncoded},${intensity},${ySign})`;
  let tangentNormal = decoded;
  if (f.normalBlend === 'overlay') {
    const overlay = `surfaceDecodeNormal(${overlayNormalEncoded},${intensity}*${normalBlend},${ySign})`;
    tangentNormal = `normalize(vec3((${decoded}).xy+(${overlay}).xy,(${decoded}).z*(${overlay}).z))`;
  }
  const normals = (maps.normal || maps.normalAlt || maps.detail && on('detailNormal'))
    ? `normal=surfaceNormalVector(normal,${uv(normalUV)},${tangentNormal});` : 'vec3 sourceGeometryNormal=normal;';
  const f0 = ((1.4 - 1) / (1.4 + 1)) ** 2;
  // Emission is diffuse illumination, not standalone additive radiance.
  const emissiveMask = ['rgb', 'rgba'].includes(f.emissiveMask ?? '') ? `${sample('emissive')}.rgb` : f.emissiveMask === 'rg' ? `vec3(${sample('emissive')}.g)` : 'vec3(1.0)';
  const emissive = f.emissive === 'always'
    ? `${vec(list(p.emissive, 'colour').map(x => x * x))}*${n(p.emissive, 'strength')}*${emissiveMask}*diffuseColor.rgb*${glslNumber(1 / Math.PI)}*(1.0-surfaceMetallic)*(1.0-surfaceSpecular*${glslNumber(f0)})`
    : 'vec3(0.0)';
  const physical = `material.specularColor=vec3(${glslNumber(f0)}); material.specularColorBlended=vec3(${glslNumber(f0)});`;
  return { albedo, normals, emissive, physical, occlusion: maps.aoSpec ? 'reflectedLight.indirectSpecular*=aoSpec.r;' : '' };
}
