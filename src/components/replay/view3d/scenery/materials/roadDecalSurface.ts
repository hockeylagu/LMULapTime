import { list, value, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { ParameterGroup, SurfaceConfig } from './surfaceConfig.js';

/** Static dry reconstruction of ps30_IBLRoadDecal (ROADLINES, DECAL_ADTERRAINLOGOS). Dynamic RealRoad, wetness and particles are excluded. */
export function roadDecalShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags } = config;
  const adjust = p.Material_Adjust;
  const enabled = (key: string) => !!flags[key] && flags[key] !== '@Undef';
  const n = (group: ParameterGroup | undefined, key: string, fallback: number) => number(value(group, key, fallback));
  const tint = vec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));
  const flagOf: Record<string, string> = { albedo: 'ALBEDOMAP', overlay: 'OVERLAYMAP', aoSpec: 'AOSPECMAP', metalRough: 'METALLICROUGHNESSMAP', normal: 'NORMALMAP', blendWet: 'BLENDWETMASK', roadDetails: 'ROADDETAILSMAP' };
  const has = (key: string) => enabled(flagOf[key]) && !!maps[key];
  // ps30_IBLRoadDecal samples stage 0 unconditionally; it has no ALBEDOMAP switch.
  if (!maps.albedo) throw Error(`Road decal albedo atlas is required: ${config.name}`);
  const overlay = has('overlay'), aoSpec = has('aoSpec'), mr = has('metalRough'), normal = has('normal');
  // An unbound wet mask samples the shader default _DefTex_LinGrey_BC7 (0.5); an unbound road-details mask is black.
  const overlayMaskWet = overlay && enabled('BLENDWETMASK') && enabled('USEOVERLAYMASK');
  const overlayMaskRdt = overlay && enabled('ROADDETAILSMAP') && enabled('OVERLAYRDTMASK') && has('roadDetails');
  const vertexMode = flags.VERTEXCOLOR;
  const opacityByAge = flags.OPACITYMODE === 'Height';

  let albedo = `
    vec4 roadBase=${sample('albedo')};
    vec3 roadColour=roadBase.rgb;
    float roadAlpha=roadBase.a;
    ${opacityByAge ? `float roadAge=1.0-vSurfaceColour.a;
      float roadRange=max(0.01,min(${n(p.Blending, 'BlendRange', .15)},vSurfaceColour.a));
      roadColour*=clamp(1.0-sqrt(roadAge)*${n(p.Blending, 'AlbedoDarkening', .6)},0.0,1.0);
      roadAlpha=clamp((roadAlpha-roadAge)/roadRange,0.0,1.0);` : ''}
    ${vertexMode === 'AlbedoMultiply' ? 'roadColour*=vSurfaceColour.rgb;' : ''}
    ${vertexMode === 'AlbedoOverlay' ? 'vec3 vertexOverlay=sqrt(max(roadColour,vec3(0.0))); vertexOverlay=surfaceOverlay(vertexOverlay,vSurfaceColour.rgb); roadColour=clamp(vertexOverlay*vertexOverlay,vec3(0.0),vec3(1.0));' : ''}
    float roadRoughness=${mr ? `${sample('metalRough')}.g` : '0.5'};
    surfaceMetallic=${mr ? `${sample('metalRough')}.r` : '0.0'};
    surfaceAO=${aoSpec ? `${sample('aoSpec')}.g` : '1.0'};
    float roadSpecOcclusion=${aoSpec ? `${sample('aoSpec')}.r` : '1.0'};
    surfaceSpecular=${n(adjust, 'SpecularLevel', .5)};
  `;
  if (overlay) {
    const scalar = n(adjust, 'OverlayScalar', 1);
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
    roadRoughness=surfaceAdjust(roadRoughness,${n(adjust, 'Roughness', .5)});
    surfaceRoughness=roadRoughness;
    diffuseColor.rgb*=roadColour;
    diffuseColor.a*=roadAlpha;`;

  const normals = normal
    ? `normal=surfaceNormal(normal,${uv('normal')},${overlay ? `mix(vec2(0.5),${sample('normal')}.rg,roadOverlayBlend)` : `${sample('normal')}.rg`},${n(adjust, 'NormalIntensity', 1)},${number(config.normalYSign)});`
    : '';
  const f0 = number(((1.4 - 1) / (1.4 + 1)) ** 2);
  return {
    albedo, normals, emissive: 'vec3(0.0)',
    physical: `material.specularColor=vec3(${f0}); material.specularColorBlended=vec3(${f0});`,
    occlusion: 'reflectedLight.indirectSpecular*=roadSpecOcclusion;',
  };
}
