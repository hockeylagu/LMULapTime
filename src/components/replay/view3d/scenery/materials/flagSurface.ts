import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/** Seconds since the viewer started; shared by every digital flag uniform and advanced by `configureSurfaceMaterial`'s render hook. */
export const digitalFlagClock = { value: 0 };

/** Digital flag: the blink period switches two images. */
export function digitalFlagShaderParts(config: SurfaceConfig, { sample, number }: ShaderContext): SurfaceParts {
  const period = value(config.parameters.blink, 'period');
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

/** Dry, static flag material from the package's flag parameters. UV animation and retroreflection are not represented. */
export function flagShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const base = p.base, adjust = p.adjust;
  const enabled = (key: string) => !!flags[key];
  const n = (group: ParameterGroup | undefined, key: string) => number(value(group, key));

  const hasAlbedo = enabled('albedoMap') && !!maps.albedo;
  const hasDecal = enabled('decalMap') && !!maps.decal;
  const hasMr = enabled('metalRoughMap') && !!maps.metalRough;
  const hasAo = enabled('aoSpecMap') && !!maps.aoSpec;
  const hasNormal = enabled('normalMap') && !!maps.normal;
  const tint = vec(list(adjust, 'tint'));

  const albedo = `
    vec4 flagBase=${hasAlbedo ? sample('albedo') : vec(list(base, 'albedo'))};
    vec3 flagAlbedo=${hasAlbedo ? 'flagBase.rgb' : 'flagBase.rgb*flagBase.rgb'};
    float flagAlpha=${hasAlbedo ? 'flagBase.a' : '1.0'};
    ${hasDecal ? `flagAlbedo*=mix(vec3(1.0),${sample('decal')}.rgb,flagAlpha);` : ''}
    vec2 flagMr=${hasMr ? `${sample('metalRough')}.rg` : `vec2(${n(base, 'metalness')},${n(base, 'roughness')})`};
    vec2 flagAoSpec=${hasAo ? `${sample('aoSpec')}.rg` : `vec2(${n(base, 'specular')},1.0)`};
    surfaceMetallic=surfaceAdjust(flagMr.r,${n(adjust, 'metalness')});
    surfaceRoughness=surfaceAdjust(flagMr.g,${n(adjust, 'roughness')});
    surfaceSpecular=${n(adjust, 'specular')};
    surfaceAO=flagAoSpec.g;
    diffuseColor.rgb*=flagAlbedo${uniforms ? "" : `*${tint}*${tint}`};`;

  const normals = hasNormal
    ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${n(adjust, 'normalStrength')},${number(config.normalYSign)});` : '';

  let emissive = 'vec3(0.0)';
  if (flags.emissive === 'always' && enabled('emissiveMask') && maps.emissive) {
    const mask = flags.emissiveMask === 'rgba' ? `${sample('emissive')}.rgb` : `vec3(${sample('emissive')}.g)`;
    const colour = vec(list(p.emissive, 'colour'));
    emissive = `${colour}*${colour}*${n(p.emissive, 'strength')}*${mask}`;
  }

  return {
    albedo, normals, emissive,
    physical: `material.specularColor=vec3(${number(1 / 36)}); material.specularColorBlended=vec3(${number(1 / 36)});`,
    occlusion: hasAo ? 'reflectedLight.indirectSpecular*=flagAoSpec.r;' : '',
  };
}
