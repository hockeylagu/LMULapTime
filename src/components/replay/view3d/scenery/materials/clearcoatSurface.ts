import { list, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/** Named source controls feed Three's physical BRDF. Map transfer curves remain provisional. */
export function clearcoatShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): ExtendedParts {
  const p = config.parameters;
  const need = (key: string): ParameterGroup => {
    const group = p[key];
    if (!group) throw Error(`Missing clearcoat controls: ${config.name}/${key}`);
    return group;
  };
  const base = need('BaseCoat'), coat = need('ClearCoat');
  // ps30_IBLClearCoat declares SingleCoat only with ALBEDOALPHA ClearCoatMask; without it the mask is 1 and mix() yields BaseCoat.
  const single = p.SingleCoat ?? base;
  const num = (v: number, name: string) => uniforms ? name : number(v);
  // The exporter guarantees these controls; a missing one is a malformed surface, never a default.
  const control = (group: ParameterGroup, key: string): number => {
    const v = group[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`Missing clearcoat control: ${config.name}/${key}`);
    return v;
  };

  const mask = config.flags.ALBEDOALPHA === 'ClearCoatMask' ? 'base.a' : '1.0';
  let albedo = `vec4 base=${sample('albedo')};
    float surfaceCoatMask=clamp(${mask},0.0,1.0);
    vec3 paint=base.rgb;
    vec4 coatAO=${sample('aoSpec')};
    surfaceAO=coatAO.g;
    float surfaceBaseRoughness=mix(${num(control(single, 'Roughness'), 'surface_singleRoughness')},${num(control(base, 'Roughness'), 'surface_baseRoughness')},surfaceCoatMask);
    surfaceRoughness=${config.maps.roughness ? `surfaceAdjust(${sample('roughness')}.g,surfaceBaseRoughness)` : 'surfaceBaseRoughness'};
    float surfaceCoatRoughness=${config.maps.roughness ? `surfaceAdjust(${sample('roughness')}.r,${num(control(coat, 'Roughness'), 'surface_coatRoughness')})` : num(control(coat, 'Roughness'), 'surface_coatRoughness')};
    float surfaceBaseIOR=mix(${num(control(single, 'RefractiveIndex'), 'surface_singleIOR')},${num(control(base, 'RefractiveIndex'), 'surface_baseIOR')},surfaceCoatMask);
    float surfaceCoatIOR=mix(1.0,${num(control(coat, 'RefractiveIndex'), 'surface_coatIOR')},${num(control(coat, 'Strength'), 'surface_coatStrength')}*surfaceCoatMask);
    float surfaceBaseReflectance=pow((surfaceBaseIOR-surfaceCoatIOR)/(surfaceBaseIOR+surfaceCoatIOR),2.0);
    vec3 surfacePhysicalF0=vec3(surfaceBaseReflectance*mix(${num(control(single, 'Specular'), 'surface_singleSpecular')},${num(control(base, 'Specular'), 'surface_baseSpecular')},surfaceCoatMask));
    float surfaceSpecularOcclusion=coatAO.r;
    surfaceMetallic=0.0;
  `;
  if (config.maps.detail) {
    const detail = sample('detail'), strength = num(value(p.Detail, 'Albedo', 1), 'surface_detailStrength');
    const coverage = config.flags.DETAILMASKING === 'AlbedoAlpha' ? 'base.a' : '1.0';
    if (config.flags.DETAILALBEDO === 'Multiply') albedo += `paint=mix(paint,paint*${detail}.rgb,clamp(${coverage}*${strength},0.0,1.0));`;
    else if (config.flags.DETAILALBEDO === 'AlphaBlend') albedo += `paint=mix(paint,${detail}.rgb,clamp(${detail}.a*${coverage}*${strength},0.0,1.0));`;
    else throw Error('Unimplemented clearcoat detail blend');
  }
  // Alpha is a coating mask on these opaque paints, not opacity.
  albedo += 'diffuseColor.rgb*=paint;';
  const ySign = num(config.normalYSign, 'surface_normalScale.y');
  const mapped = (normal: string, strength: string) => `surfaceNormal(${normal},${uv('normal')},${sample('normal')}.rg,${strength},${ySign})`;
  const lacquer = uniforms ? 'surface_coatLacquerColour' : vec(list(coat, 'LacquerColour', []).slice(0, 3));
  return {
    albedo,
    normals: config.maps.normal ? `normal=${mapped('normal', `mix(${num(control(single, 'NormalStrength'), 'surface_singleNormalStrength')},${num(control(base, 'NormalStrength'), 'surface_baseNormalStrength')},surfaceCoatMask)`)};` : '',
    coatNormals: config.maps.normal ? `clearcoatNormal=${mapped('nonPerturbedNormal', num(control(coat, 'NormalStrength'), 'surface_coatNormalStrength'))};` : '',
    physical: `material.specularColor=surfacePhysicalF0;
      material.specularColorBlended=surfacePhysicalF0;
      material.clearcoat*=surfaceCoatMask;
      material.clearcoatF0=vec3(pow((surfaceCoatIOR-1.0)/(surfaceCoatIOR+1.0),2.0));
      material.clearcoatRoughness=min(1.0,max(surfaceCoatRoughness,0.0525)+geometryRoughness);`,
    absorption: `mix(vec3(1.0),pow(clamp(${lacquer},vec3(10.0/255.0),vec3(254.0/255.0)),vec3(${num(Math.max(.001, value(coat, 'LacquerThickness', NaN)), 'surface_coatLacquerThickness')}/clamp(dot(geometryViewDir,normal)+0.001,0.001,1.0))),material.clearcoat)`,
    emissive: 'vec3(0.0)',
    occlusion: '',
  };
}
