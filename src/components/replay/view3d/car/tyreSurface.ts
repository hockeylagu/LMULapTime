import { list, value, type ShaderContext, type SurfaceParts } from '../scenery/materials/shaderContext.js';
import type { SurfaceConfig } from '../scenery/materials/surfaceConfig.js';

/**
 * Tyres, from the package's tyre maps and parameters: the albedo's alpha is the rubber's roughness, the aoSpec map its ambient (G)
 * and specular (R) occlusion, and a two-channel normal map its tread and lettering. Worn rubber (the vertex colour's green running
 * from 0, worn, to 1, new) darkens and roughens. Two dampings take reflection off where a tyre cannot see the sky: the faces turned
 * to the ground (the world height of the mesh normal), and the tread rather than the sidewalls (the normal's share along the
 * axle, the mesh's own x). Both scale the reflected environment only, never the sun's highlight.
 */
export function tyreShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { parameters: p, flags: f } = config;
  const adjust = p.adjust, wear = p.wear;
  const num = (v: number, name: string) => uniforms ? name : number(v);
  const tint = vec(list(adjust, 'tint').slice(0, 3));
  const worn = f.wearDarkening === 'on';
  const albedo = `
    vec4 base=${sample('albedo')};
    vec4 aoSpec=${sample('aoSpec', 'vec4(1.0)')};
    vec3 surfaceAlbedo=base.rgb;
    surfaceRoughness=surfaceAdjust(base.a,${num(value(adjust, 'roughness'), 'roughness')});
    ${worn ? `float tyreNew=clamp(vSurfaceColour.g,0.0,1.0);
    surfaceAlbedo*=mix(${number(value(wear, 'albedoMultiply'))},1.0,tyreNew);
    surfaceRoughness=min(1.0,surfaceRoughness+mix(${number(value(wear, 'roughnessAdjust'))},0.0,tyreNew));` : ''}
    surfaceMetallic=0.0;
    surfaceSpecular=${num(value(adjust, 'specular'), 'surface_specular')};
    surfaceAO=aoSpec.g;
    diffuseColor.rgb${uniforms ? '=surfaceAlbedo*diffuse' : `*=surfaceAlbedo*${tint}*${tint}`};`;
  const intensity = num(value(adjust, 'normalStrength'), 'surface_normalScale.x'), ySign = num(config.normalYSign, 'surface_normalScale.y');
  const normals = config.maps.normal
    ? `normal=surfaceNormal(normal,${uv('normal')},${sample('normal')}.rg,${intensity},${ySign});` : '';
  const damping = [
    f.groundDamping === 'on' ? 'clamp(0.85+inverseTransformDirection(geometryNormal,viewMatrix).y,0.0,1.0)' : null,
    f.treadDamping === 'on' ? 'clamp((abs(vSurfaceAxle)-0.075)/0.925,0.0,1.0)' : null,
  ].filter(term => term !== null);
  const occlusion = `reflectedLight.indirectSpecular*=aoSpec.r${damping.length ? `*${damping.length === 2 ? `min(${damping.join(',')})` : damping[0]}` : ''};`;
  const f0 = ((1.4 - 1) / (1.4 + 1)) ** 2;
  return { albedo, normals, emissive: 'vec3(0.0)', physical: `material.specularColor=vec3(${number(f0)}); material.specularColorBlended=vec3(${number(f0)});`, occlusion };
}

/** Whether a tyre's program reads the mesh normal's share along the axle (`vSurfaceAxle`), which its vertex stage then passes. */
export const tyreReadsAxle = (config: SurfaceConfig): boolean => config.kind === 'tyre' && config.flags.treadDamping === 'on';
