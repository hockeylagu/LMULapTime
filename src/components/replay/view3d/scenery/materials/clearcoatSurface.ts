import { list, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/** Base and clear coat controls feed Three's physical BRDF. Map transfer curves remain provisional. */
export function clearcoatShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): ExtendedParts {
  const p = config.parameters;
  // The single coat equals the base coat unless the albedo alpha masks the coat.
  const base = p.baseCoat, coat = p.clearCoat, single = p.singleCoat;
  const num = (v: number, name: string) => uniforms ? name : number(v);

  const mask = config.flags.coatMask ? 'base.a' : '1.0';
  let albedo = `vec4 base=${sample('albedo')};
    float surfaceCoatMask=clamp(${mask},0.0,1.0);
    vec3 paint=base.rgb;
    vec4 coatAO=${sample('aoSpec')};
    surfaceAO=coatAO.g;
    float surfaceBaseRoughness=mix(${num(value(single, 'roughness'), 'surface_singleRoughness')},${num(value(base, 'roughness'), 'surface_baseRoughness')},surfaceCoatMask);
    surfaceRoughness=${config.maps.roughness ? `surfaceAdjust(${sample('roughness')}.g,surfaceBaseRoughness)` : 'surfaceBaseRoughness'};
    float surfaceCoatRoughness=${config.maps.roughness ? `surfaceAdjust(${sample('roughness')}.r,${num(value(coat, 'roughness'), 'surface_coatRoughness')})` : num(value(coat, 'roughness'), 'surface_coatRoughness')};
    float surfaceBaseIOR=mix(${num(value(single, 'ior'), 'surface_singleIOR')},${num(value(base, 'ior'), 'surface_baseIOR')},surfaceCoatMask);
    float surfaceCoatIOR=mix(1.0,${num(value(coat, 'ior'), 'surface_coatIOR')},${num(value(coat, 'strength'), 'surface_coatStrength')}*surfaceCoatMask);
    float surfaceBaseReflectance=pow((surfaceBaseIOR-surfaceCoatIOR)/(surfaceBaseIOR+surfaceCoatIOR),2.0);
    vec3 surfacePhysicalF0=vec3(surfaceBaseReflectance*mix(${num(value(single, 'specular'), 'surface_singleSpecular')},${num(value(base, 'specular'), 'surface_baseSpecular')},surfaceCoatMask));
    float surfaceSpecularOcclusion=coatAO.r;
    surfaceMetallic=0.0;
  `;
  if (config.maps.detail) {
    const detail = sample('detail'), strength = num(value(p.detail, 'albedo'), 'surface_detailStrength');
    const coverage = config.flags.detailMask === 'albedoAlpha' ? 'base.a' : '1.0';
    if (config.flags.detailAlbedo === 'multiply') albedo += `paint=mix(paint,paint*${detail}.rgb,clamp(${coverage}*${strength},0.0,1.0));`;
    else if (config.flags.detailAlbedo === 'alphaBlend') albedo += `paint=mix(paint,${detail}.rgb,clamp(${detail}.a*${coverage}*${strength},0.0,1.0));`;
    else throw Error('Unimplemented clearcoat detail blend');
  }
  // Alpha is a coating mask on these opaque paints, not opacity.
  albedo += 'diffuseColor.rgb*=paint;';
  const ySign = num(config.normalYSign, 'surface_normalScale.y');
  const mapped = (normal: string, strength: string) => `surfaceNormal(${normal},${uv('normal')},${sample('normal')}.rg,${strength},${ySign})`;
  const lacquer = uniforms ? 'surface_coatLacquerColour' : vec(list(coat, 'lacquerColour'));
  return {
    albedo,
    normals: config.maps.normal ? `normal=${mapped('normal', `mix(${num(value(single, 'normalStrength'), 'surface_singleNormalStrength')},${num(value(base, 'normalStrength'), 'surface_baseNormalStrength')},surfaceCoatMask)`)};` : '',
    coatNormals: config.maps.normal ? `clearcoatNormal=${mapped('nonPerturbedNormal', num(value(coat, 'normalStrength'), 'surface_coatNormalStrength'))};` : '',
    physical: `material.specularColor=surfacePhysicalF0;
      material.specularColorBlended=surfacePhysicalF0;
      material.clearcoat*=surfaceCoatMask;
      material.clearcoatF0=vec3(pow((surfaceCoatIOR-1.0)/(surfaceCoatIOR+1.0),2.0));
      material.clearcoatRoughness=min(1.0,max(surfaceCoatRoughness,0.0525)+geometryRoughness);`,
    absorption: `mix(vec3(1.0),pow(clamp(${lacquer},vec3(10.0/255.0),vec3(254.0/255.0)),vec3(${num(Math.max(.001, value(coat, 'lacquerThickness')), 'surface_coatLacquerThickness')}/clamp(dot(geometryViewDir,normal)+0.001,0.001,1.0))),material.clearcoat)`,
    emissive: 'vec3(0.0)',
    occlusion: '',
  };
}
