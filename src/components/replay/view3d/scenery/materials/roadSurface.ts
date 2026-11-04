import { value, list, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/** Dry road/kerb shader reconstruction. Wetness and RealRoad evolution stay disabled. */
export function roadShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags: f, kind } = config;
  const adjust = p.Material_Adjust, noOverlay = p.No_Overlay_Base, decalGroup = p.Decal, blendGroup = p.Albedo_Blend;
  const enabled = (key: string) => !!f[key] && f[key] !== '@Undef';
  if (kind !== 'road' && kind !== 'kerb') throw Error(`Unsupported road shader family: ${kind}`);

  const num = (v: number, name: string) => uniforms ? name : number(v);
  const hasOverlay = kind === 'road' && enabled('OVERLAYMAP') && !!maps.overlay;
  const usesOverlayMask = hasOverlay && enabled('BLENDWETMASK') &&
    (enabled('USEOVERLAYMASK') || enabled('ROADDETAILSMAP') || enabled('DECALMAP'));
  const detailCoverage = usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';
  const tint = uniforms ? 'diffuse' : vec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));
  const roughAdjust = num(value(adjust, 'Roughness', .5), 'roughness');
  const specAdjust = num(value(adjust, 'SpecularLevel', .5), 'surface_specular');
  const roughFromAlpha = enabled('ROUGHNESSALBEDOALPHA');
  const blendWet = sample('blendWet', 'vec4(0.5)');
  const roadDetails = sample('roadDetails', 'vec4(0.0)');
  let albedo = `
    vec4 base=${sample('albedo', 'vec4(1.0)')};
    vec4 aoSpec=${sample('aoSpec', 'vec4(1.0)')};
    float sourceRoughness=${roughFromAlpha ? 'base.a' : '0.5'};
    float sourceSpecular=${specAdjust};
    surfaceDetailCoverage=1.0;
  `;

  if (kind === 'road') {
    albedo += `vec4 blendWet=${blendWet};
      vec4 roadDetails=${roadDetails};`;

    // Source DECALRDTMASK scales decal contribution before the decal-specific blend.
    if (enabled('DECALMAP') && maps.decal) {
      const decalStrength = num(value(decalGroup, 'Strength', 1), 'surface_decalStrength');
      albedo += `vec4 decalSample=${sample('decal')};
        float decalStrength=${decalStrength};
        ${enabled('DECALRDTMASK') && enabled('ROADDETAILSMAP') ? 'decalStrength*=roadDetails.b;' : ''}
        vec3 decalValue;
      `;
      if (f.DECALBLEND === 'AlphaBlend') {
        albedo += `decalValue=decalSample.rgb;
          decalStrength*=decalSample.a;
          base.rgb=mix(base.rgb,decalValue,decalStrength);
        `;
      } else if (f.DECALBLEND === 'SdfBlend') {
        const thickness = num(value(decalGroup, 'Thickness', .5), 'surface_decalThickness');
        const softness = num(value(decalGroup, 'Softness', .1), 'surface_decalSoftness');
        albedo += `decalValue=decalSample.rgb;
          decalStrength*=clamp((decalSample.a-${thickness})/max(0.00001,${softness}),0.0,1.0);
          base.rgb=mix(base.rgb,decalValue,decalStrength);
        `;
      } else {
        // This follows the source AddSub branch, including its RGB-derived mask factor.
        albedo += `decalValue=decalStrength*(decalSample.rgb-vec3(0.5));
          decalStrength=clamp(2.0*(abs(decalValue.r)+abs(decalValue.g)+abs(decalValue.r)),0.0,1.0);
          base.rgb=max(vec3(0.0),base.rgb+decalValue);
        `;
      }
    }

    if (usesOverlayMask) {
      albedo += `${enabled('USEOVERLAYMASK') ? 'surfaceDetailCoverage*=blendWet.r;' : ''}
        ${enabled('ROADDETAILSMAP') && enabled('OVERLAYRDTMASK') ? 'surfaceDetailCoverage*=1.0-roadDetails.b;' : ''}
        ${enabled('DECALMAP') && maps.decal ? `surfaceDetailCoverage*=1.0-${num(value(decalGroup, 'Detail', 0), 'surface_decalDetail')}*decalStrength;` : ''}
        surfaceDetailCoverage=clamp(surfaceDetailCoverage,0.0,1.0);
      `;
    }

    if (hasOverlay) {
      const noOverlayRough = num(value(noOverlay, 'Roughness', .7), 'surface_noOverlayRoughness');
      const noOverlaySpec = num(value(noOverlay, 'SpecularLevel', .5), 'surface_noOverlaySpecular');
      albedo += `vec4 overlay=${sample('overlay', 'vec4(0.5)')};
        vec4 sourceOverlay=mix(vec4(0.5,0.5,0.5,${noOverlayRough}),overlay,${detailCoverage});
        vec3 overlayBase=sqrt(max(base.rgb,vec3(0.0)));
        base.rgb=clamp(surfaceOverlay(overlayBase,mix(vec3(0.5),sourceOverlay.rgb,0.5)),vec3(0.0),vec3(1.0));
        base.rgb*=base.rgb;
        sourceRoughness=surfaceOverlay1(sourceRoughness,sourceOverlay.a);
        sourceSpecular=mix(${noOverlaySpec},${specAdjust},${detailCoverage});
      `;
    } else if (usesOverlayMask) {
      // Source only consumes No_Overlay_Base for the overlay shader branch.
      albedo += `sourceSpecular=${specAdjust};`;
    }
  } else {
    // For the dry kerb path, source groove/marbles terms are intentionally omitted.
    const mixBias = num(value(blendGroup, 'MixBias', .5), 'surface_kerbMixBias');
    const defaultBlend = num(value(blendGroup, 'Default', 1), 'surface_kerbDefaultBlend');
    const mixBlend = enabled('BLENDWETMASK') ? 'blendWet.r' : '0.5';
    const defaultControl = enabled('ROADDETAILSMAP') ? `clamp(roadDetails.b*${defaultBlend},0.0,1.0)` : '0.0';
    albedo += `vec4 blendWet=${blendWet};
      vec4 roadDetails=${roadDetails};
      float sourceBlend=clamp((${mixBlend}-${defaultControl})/max(${mixBias},0.00001),0.0,1.0);
      surfaceAltBlend=1.0-sourceBlend;
    `;
    if (enabled('ALBEDOALTMAP') && maps.alternate)
      albedo += `base=mix(base,${sample('alternate')},surfaceAltBlend);
        ${roughFromAlpha ? `sourceRoughness=mix(${sample('alternate')}.a,sourceRoughness,sourceBlend);` : ''}
      `;
  }

  const specOcclusionCoverage = kind === 'road' && f.AOSMODE !== 'SceneDetails' && usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';
  const aoCoverage = kind === 'road' && f.AOSMODE !== 'SceneDetails' && usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';

  albedo += `
    diffuseColor.rgb=${uniforms ? 'base.rgb*diffuse' : `base.rgb*${tint}*${tint}`};
    sourceRoughness=surfaceAdjust(sourceRoughness,${roughAdjust});
    surfaceRoughness=sourceRoughness;
    surfaceSpecular=sourceSpecular;
    surfaceAO=mix(1.0,aoSpec.g,${aoCoverage});
  `;

  let normals = '';
  if (maps.normal) {
    const intensity = num(value(adjust, 'NormalIntensity', 1), 'surface_normalScale.x');
    const ySign = num(config.normalYSign, 'surface_normalScale.y');
    if (kind === 'road') {
      const baseNormal = `surfaceDecodeNormal(${sample('normal')}.rg,${intensity},${ySign})`;
      let combined = baseNormal;
      if (maps.normalAlt) {
        const altEncoded = enabled('NORMALALTRDTMASK') && enabled('ROADDETAILSMAP')
          ? `mix(vec2(0.5),${sample('normalAlt')}.rg,${roadDetails}.b)` : `${sample('normalAlt')}.rg`;
        const alt = `surfaceDecodeNormal(${altEncoded},${intensity}*0.4,${ySign})`;
        combined = `normalize(vec3((${baseNormal}).xy+(${alt}).xy,(${baseNormal}).z*(${alt}).z))`;
      }
      normals = `normal=surfaceNormalVector(normal,${uv('normal')},${combined});`;
    } else {
      let encoded = `${sample('normal')}.rg`;
      if (enabled('BLENDWETMASK')) encoded = `mix(vec2(0.5),${encoded},blendWet.r*0.5)`;
      normals = `normal=surfaceNormalVector(normal,${uv('normal')},surfaceDecodeNormal(${encoded},${intensity},${ySign}));`;
    }
  }

  const ior = kind === 'road' ? 1.635 : 1.4;
  const f0 = ((ior - 1) / (ior + 1)) ** 2;
  const physical = `material.specularColor=vec3(${number(f0)}); material.specularColorBlended=vec3(${number(f0)});`;
  const occlusion = maps.aoSpec ? `reflectedLight.indirectSpecular*=mix(1.0,aoSpec.r,${specOcclusionCoverage});` : '';
  return { albedo, normals, emissive: 'vec3(0.0)', physical, occlusion };
}
