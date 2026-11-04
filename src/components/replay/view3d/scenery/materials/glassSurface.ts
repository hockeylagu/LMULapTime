import { list, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/** Source: ps30_IBLGlass.psh + IBLShared.h. These are alpha-composited glass reflections. */
export function glassShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): ExtendedParts {
  const a = config.parameters.Material_Adjust;
  const tint = list(a, 'AlbedoTint', [1, 1, 1, 1]).slice(0, 3).map(v => v * v);
  return {
    albedo: `vec4 glassBase=${sample('albedo')};
      diffuseColor.rgb*=glassBase.rgb${uniforms ? "" : `*${vec(tint)}`};
      diffuseColor.a*=glassBase.a;
      ${config.flags.VERTEXALPHA === 'OpacityMultiply' ? 'diffuseColor.a*=vSurfaceColour.a;' : ''}
      surfaceRoughness=0.0; surfaceMetallic=0.0;`,
    normals: config.maps.normal ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${number(value(a, 'NormalIntensity', 1))},${number(config.normalYSign)});` : '',
    physical: 'material.specularColor=vec3(0.04); material.specularColorBlended=vec3(0.04);',
    finish: 'outgoingLight=totalDiffuse+totalSpecular/clamp(diffuseColor.a+0.001,0.001,1.0)+totalEmissiveRadiance;',
    emissive: 'vec3(0.0)',
    occlusion: '',
  };
}
