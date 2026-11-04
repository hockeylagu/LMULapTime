import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/** Seconds since the viewer started; shared by every digital flag uniform and advanced by `configureSurfaceMaterial`'s render hook. */
export const digitalFlagClock = { value: 0 };

/** Dry static reconstruction of the digital flag emissive shader: the authored blink period switches two decoded images. */
export function digitalFlagShaderParts(config: SurfaceConfig, { sample, number }: ShaderContext): SurfaceParts {
  const intensity = config.parameters.cbIntensity;
  const seconds = value(intensity, 'PeriodSeconds', 0);
  const period = seconds > 0 ? seconds : 0.25;
  return {
    albedo: `
      vec4 flagOn=${sample('on')};
      vec3 flagOff=${sample('off')}.rgb;
      float flagBlink=float(cos(surface_flag_elapsed*3.141592653589793/${number(period)})>0.0);
      diffuseColor.rgb=mix(flagOff,flagOn.rgb,flagBlink);
      diffuseColor.a=1.0;
      surfaceRoughness=0.75;
      surfaceMetallic=0.0;
      surfaceSpecular=0.5;`,
    normals: '', emissive: 'vec3(0.0)', physical: '', occlusion: '',
  };
}

/** Dry, static reconstruction of ps30_IBLFlag. UV animation and retroreflection are not represented. */
export function flagShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const base = p.Base_Material, adjust = p.Material_Adjust;
  const enabled = (key: string) => !!flags[key] && flags[key] !== '@Undef';
  const n = (group: ParameterGroup | undefined, key: string, fallback: number) => number(value(group, key, fallback));

  const hasAlbedo = enabled('ALBEDOMAP') && !!maps.albedo;
  const hasDecal = enabled('DECALMAP') && !!maps.decal;
  const hasMr = enabled('METALLICROUGHNESSMAP') && !!maps.metalRough;
  const hasAo = enabled('AOSPECMAP') && !!maps.aoSpec;
  const hasNormal = enabled('NORMALMAP') && !!maps.normal;
  const tint = vec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));

  const albedo = `
    vec4 flagBase=${hasAlbedo ? sample('albedo') : vec(list(base, 'Albedo', [1, 1, 1, 1]))};
    vec3 flagAlbedo=${hasAlbedo ? 'flagBase.rgb' : 'flagBase.rgb*flagBase.rgb'};
    float flagAlpha=${hasAlbedo ? 'flagBase.a' : '1.0'};
    ${hasDecal ? `flagAlbedo*=mix(vec3(1.0),${sample('decal')}.rgb,flagAlpha);` : ''}
    vec2 flagMr=${hasMr ? `${sample('metalRough')}.rg` : `vec2(${n(base, 'Metallic', 0)},${n(base, 'Roughness', .5)})`};
    vec2 flagAoSpec=${hasAo ? `${sample('aoSpec')}.rg` : `vec2(${n(base, 'Specular', 1)},1.0)`};
    surfaceMetallic=surfaceAdjust(flagMr.r,${n(adjust, 'Metallic', .5)});
    surfaceRoughness=surfaceAdjust(flagMr.g,${n(adjust, 'Roughness', .5)});
    surfaceSpecular=${n(adjust, 'SpecularLevel', .5)};
    surfaceAO=flagAoSpec.g;
    diffuseColor.rgb*=flagAlbedo${uniforms ? "" : `*${tint}*${tint}`};`;

  const normals = hasNormal
    ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${n(adjust, 'NormalIntensity', 1)},${number(config.normalYSign)});` : '';

  let emissive = 'vec3(0.0)';
  if (flags.EMISSIVEMODE === 'Enabled' && enabled('EMISSIVEMAP') && maps.emissive) {
    const mask = flags.EMISSIVEMAP === 'Mask_RGBA' ? `${sample('emissive')}.rgb` : `vec3(${sample('emissive')}.g)`;
    const colour = vec(list(p.Emissive, 'Colour', [1, 1, 1]).slice(0, 3));
    emissive = `${colour}*${colour}*${n(p.Emissive, 'Scalar', 25)}*${mask}`;
  }

  return {
    albedo, normals, emissive,
    physical: `material.specularColor=vec3(${number(1 / 36)}); material.specularColorBlended=vec3(${number(1 / 36)});`,
    occlusion: hasAo ? 'reflectedLight.indirectSpecular*=flagAoSpec.r;' : '',
  };
}
