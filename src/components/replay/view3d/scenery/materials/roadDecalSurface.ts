import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/** Static dry road decals (painted lines and logos). Dynamic road state, wetness and particles are excluded. */
export function roadDecalShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const adjust = p.adjust;
  const enabled = (key: string) => !!flags[key];
  const n = (group: ParameterGroup | undefined, key: string) => number(value(group, key));
  const tint = vec(list(adjust, 'tint'));
  const flagOf: Record<string, string> = { overlay: 'overlayMap', aoSpec: 'aoSpecMap', metalRough: 'metalRoughMap', normal: 'normalMap', blendWet: 'blendWetMask', roadDetails: 'roadDetailsMap' };
  const has = (key: string) => enabled(flagOf[key]) && !!maps[key];
  // A road decal always samples its albedo atlas.
  if (!maps.albedo) throw Error(`Road decal albedo atlas is required: ${config.name ?? '?'}`);
  const overlay = has('overlay'), aoSpec = has('aoSpec'), mr = has('metalRough'), normal = has('normal');
  // An unbound wet mask reads mid grey (0.5); an unbound road-details mask is black.
  const overlayMaskWet = overlay && enabled('blendWetMask') && enabled('overlayMask');
  const overlayMaskRdt = overlay && enabled('roadDetailsMap') && enabled('overlayRoadDetailsMask') && has('roadDetails');
  const vertexMode = flags.vertexColour;
  const opacityByAge = enabled('opacityByAge');

  let albedo = `
    vec4 roadBase=${sample('albedo')};
    vec3 roadColour=roadBase.rgb;
    float roadAlpha=roadBase.a;
    ${opacityByAge ? `float roadAge=1.0-vSurfaceColour.a;
      float roadRange=max(0.01,min(${n(p.blending, 'range')},vSurfaceColour.a));
      roadColour*=clamp(1.0-sqrt(roadAge)*${n(p.blending, 'darkening')},0.0,1.0);
      roadAlpha=clamp((roadAlpha-roadAge)/roadRange,0.0,1.0);` : ''}
    ${vertexMode === 'albedoMultiply' ? 'roadColour*=vSurfaceColour.rgb;' : ''}
    ${vertexMode === 'albedoOverlay' ? 'vec3 vertexOverlay=sqrt(max(roadColour,vec3(0.0))); vertexOverlay=surfaceOverlay(vertexOverlay,vSurfaceColour.rgb); roadColour=clamp(vertexOverlay*vertexOverlay,vec3(0.0),vec3(1.0));' : ''}
    float roadRoughness=${mr ? `${sample('metalRough')}.g` : '0.5'};
    surfaceMetallic=${mr ? `${sample('metalRough')}.r` : '0.0'};
    surfaceAO=${aoSpec ? `${sample('aoSpec')}.g` : '1.0'};
    float roadSpecOcclusion=${aoSpec ? `${sample('aoSpec')}.r` : '1.0'};
    surfaceSpecular=${n(adjust, 'specular')};
  `;
  if (overlay) {
    const scalar = n(adjust, 'overlayStrength');
    albedo += `float roadOverlayBlend=1.0;
      ${overlayMaskWet ? `roadOverlayBlend*=${has('blendWet') ? `${sample('blendWet')}.r` : '0.5'};` : ''}
      ${overlayMaskRdt ? `roadOverlayBlend*=1.0-${sample('roadDetails')}.b;` : ''}
      roadOverlayBlend=clamp(roadOverlayBlend*${scalar},0.0,1.0);
      vec4 roadOverlay=mix(vec4(0.5),${sample('overlay')},roadOverlayBlend);
      roadColour=clamp(surfaceOverlay(sqrt(max(roadColour,vec3(0.0))),roadOverlay.rgb),vec3(0.0),vec3(1.0));
      roadColour*=roadColour;
      roadRoughness=surfaceOverlay1(roadRoughness,roadOverlay.a);
      ${aoSpec ? 'surfaceAO=mix(1.0,surfaceAO,roadOverlayBlend); roadSpecOcclusion=mix(1.0,roadSpecOcclusion,roadOverlayBlend);' : ''}`;
  }
  albedo += `
    ${uniforms ? "" : `roadColour*=${tint}*${tint};`}
    roadRoughness=surfaceAdjust(roadRoughness,${n(adjust, 'roughness')});
    surfaceRoughness=roadRoughness;
    diffuseColor.rgb*=roadColour;
    diffuseColor.a*=roadAlpha;`;

  const normals = normal
    ? `normal=surfaceNormal(normal,${uv('normal')},${overlay ? `mix(vec2(0.5),${sample('normal')}.rg,roadOverlayBlend)` : `${sample('normal')}.rg`},${n(adjust, 'normalStrength')},${number(config.normalYSign)});`
    : '';
  const f0 = number(((1.4 - 1) / (1.4 + 1)) ** 2);
  return {
    albedo, normals, emissive: 'vec3(0.0)',
    physical: `material.specularColor=vec3(${f0}); material.specularColorBlended=vec3(${f0});`,
    occlusion: 'reflectedLight.indirectSpecular*=roadSpecOcclusion;',
  };
}
