import { value, list, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/**
 * How much rubber is taken as laid on the racing line, 0 (a green track, the road-details map alone) to 1 (fully rubbered). The
 * real level grows through a session and is in neither the package nor the replay; this is an assumed base level, near what two
 * points of one captured practice frame held (0.18 and 0.24).
 */
export const ASSUMED_RUBBER = 0.2;

/** Dry road and kerb surfaces, the road with an assumed base level of rubber. Wetness and marbles stay disabled. */
export function roadShaderParts(config: SurfaceConfig, { sample, uv, number, vec, uniforms }: ShaderContext): SurfaceParts {
  const { maps, parameters: p, flags: f, kind } = config;
  const adjust = p.adjust, noOverlay = p.bare, decalGroup = p.decal, blendGroup = p.kerbBlend;
  const enabled = (key: string) => !!f[key];
  if (kind !== 'road' && kind !== 'kerb') throw Error(`Unsupported road shader family: ${kind}`);

  const num = (v: number, name: string) => uniforms ? name : number(v);
  const hasOverlay = kind === 'road' && enabled('overlayMap') && !!maps.overlay;
  const usesOverlayMask = hasOverlay && enabled('blendWetMask') &&
    (enabled('overlayMask') || enabled('roadDetailsMap') || enabled('decalMap'));
  const detailCoverage = usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';
  const tint = uniforms ? 'diffuse' : vec(list(adjust, 'tint'));
  const roughAdjust = num(value(adjust, 'roughness'), 'roughness');
  const specAdjust = num(value(adjust, 'specular'), 'surface_specular');
  const roughFromAlpha = enabled('roughnessFromAlbedoAlpha');
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

    // The road-details mask scales the decal contribution before the decal-specific blend.
    if (enabled('decalMap') && maps.decal) {
      const decalStrength = num(value(decalGroup, 'strength'), 'surface_decalStrength');
      albedo += `vec4 decalSample=${sample('decal')};
        float decalStrength=${decalStrength};
        ${enabled('decalRoadDetailsMask') && enabled('roadDetailsMap') ? 'decalStrength*=roadDetails.b;' : ''}
        vec3 decalValue;
      `;
      if (f.decalBlend === 'alpha') {
        albedo += `decalValue=decalSample.rgb;
          decalStrength*=decalSample.a;
          base.rgb=mix(base.rgb,decalValue,decalStrength);
        `;
      } else if (f.decalBlend === 'sdf') {
        const thickness = num(value(decalGroup, 'thickness'), 'surface_decalThickness');
        const softness = num(value(decalGroup, 'softness'), 'surface_decalSoftness');
        albedo += `decalValue=decalSample.rgb;
          decalStrength*=clamp((decalSample.a-${thickness})/max(0.00001,${softness}),0.0,1.0);
          base.rgb=mix(base.rgb,decalValue,decalStrength);
        `;
      } else {
        // Add/subtract decal, including its RGB-derived mask factor.
        albedo += `decalValue=decalStrength*(decalSample.rgb-vec3(0.5));
          decalStrength=clamp(2.0*(abs(decalValue.r)+abs(decalValue.g)+abs(decalValue.r)),0.0,1.0);
          base.rgb=max(vec3(0.0),base.rgb+decalValue);
        `;
      }
    }

    if (usesOverlayMask) {
      albedo += `${enabled('overlayMask') ? 'surfaceDetailCoverage*=blendWet.r;' : ''}
        ${enabled('roadDetailsMap') && enabled('overlayRoadDetailsMask') ? 'surfaceDetailCoverage*=1.0-roadDetails.b;' : ''}
        ${enabled('decalMap') && maps.decal ? `surfaceDetailCoverage*=1.0-${num(value(decalGroup, 'detail'), 'surface_decalDetail')}*decalStrength;` : ''}
        surfaceDetailCoverage=clamp(surfaceDetailCoverage,0.0,1.0);
      `;
    }

    if (hasOverlay) {
      const noOverlayRough = num(value(noOverlay, 'roughness'), 'surface_noOverlayRoughness');
      const noOverlaySpec = num(value(noOverlay, 'specular'), 'surface_noOverlaySpecular');
      albedo += `vec4 overlay=${sample('overlay', 'vec4(0.5)')};
        vec4 sourceOverlay=mix(vec4(0.5,0.5,0.5,${noOverlayRough}),overlay,${detailCoverage});
        vec3 overlayBase=sqrt(max(base.rgb,vec3(0.0)));
        base.rgb=clamp(surfaceOverlay(overlayBase,sourceOverlay.rgb),vec3(0.0),vec3(1.0));
        base.rgb*=base.rgb;
        sourceRoughness=surfaceOverlay1(sourceRoughness,sourceOverlay.a);
        sourceSpecular=mix(${noOverlaySpec},${specAdjust},${detailCoverage});
      `;
    } else if (usesOverlayMask) {
      // The bare-road values only apply to the overlay branch.
      albedo += `sourceSpecular=${specAdjust};`;
    }
  } else {
    // Dry kerb: groove and marbles terms are intentionally omitted.
    const mixBias = num(value(blendGroup, 'mixBias'), 'surface_kerbMixBias');
    const defaultBlend = num(value(blendGroup, 'default'), 'surface_kerbDefaultBlend');
    const mixBlend = enabled('blendWetMask') ? 'blendWet.r' : '0.5';
    const defaultControl = enabled('roadDetailsMap') ? `clamp(roadDetails.b*${defaultBlend},0.0,1.0)` : '0.0';
    albedo += `vec4 blendWet=${blendWet};
      vec4 roadDetails=${roadDetails};
      float sourceBlend=clamp((${mixBlend}-${defaultControl})/max(${mixBias},0.00001),0.0,1.0);
      surfaceAltBlend=1.0-sourceBlend;
    `;
    if (enabled('albedoAltMap') && maps.alternate)
      albedo += `base=mix(base,${sample('alternate')},surfaceAltBlend);
        ${roughFromAlpha ? `sourceRoughness=mix(${sample('alternate')}.a,sourceRoughness,sourceBlend);` : ''}
      `;
  }

  const specOcclusionCoverage = kind === 'road' && f.ambientOcclusion !== 'scene' && usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';
  const aoCoverage = kind === 'road' && f.ambientOcclusion !== 'scene' && usesOverlayMask ? 'surfaceDetailCoverage' : '1.0';

  albedo += `
    diffuseColor.rgb=${uniforms ? 'base.rgb*diffuse' : `base.rgb*${tint}*${tint}`};
    sourceRoughness=surfaceAdjust(sourceRoughness,${roughAdjust});
    surfaceRoughness=sourceRoughness;
    surfaceSpecular=sourceSpecular;
    surfaceAO=mix(1.0,aoSpec.g,${aoCoverage});
  `;

  // The rubber groove: the mask's two weights against the laid level mix the finished road toward the groove's own colour
  // (squared, as the tint is), roughness and specular level, and lift its occlusion.
  if (kind === 'road' && enabled('grooveMap') && maps.groove) {
    const groove = p.groove;
    albedo += `vec2 grooveMask=${sample('groove')}.rg;
      float grooveLaid=mix(roadDetails.g,1.0,${number(ASSUMED_RUBBER)});
      float surfaceGroove=max(2.0*max(grooveLaid-0.5,0.0)*grooveMask.g,grooveMask.r*min(1.5*grooveLaid,1.0));
      vec3 grooveAlbedo=${uniforms ? 'surface_grooveAlbedo' : vec(list(groove, 'albedo'))};
      diffuseColor.rgb=mix(diffuseColor.rgb,grooveAlbedo*grooveAlbedo,surfaceGroove);
      surfaceRoughness=mix(surfaceRoughness,${num(value(groove, 'roughness'), 'surface_grooveRoughness')},surfaceGroove);
      surfaceSpecular=mix(surfaceSpecular,${num(value(groove, 'specular'), 'surface_grooveSpecular')},surfaceGroove);
      surfaceAO=mix(surfaceAO,1.0,surfaceGroove);
    `;
  }

  let normals = '';
  if (maps.normal) {
    const intensity = num(value(adjust, 'normalStrength'), 'surface_normalScale.x');
    const ySign = num(config.normalYSign, 'surface_normalScale.y');
    if (kind === 'road') {
      const baseNormal = `surfaceDecodeNormal(${sample('normal')}.rg,${intensity},${ySign})`;
      let combined = baseNormal;
      if (maps.normalAlt) {
        const altEncoded = enabled('normalAltRoadDetailsMask') && enabled('roadDetailsMap')
          ? `mix(vec2(0.5),${sample('normalAlt')}.rg,${roadDetails}.b)` : `${sample('normalAlt')}.rg`;
        const alt = `surfaceDecodeNormal(${altEncoded},${intensity}*0.4,${ySign})`;
        combined = `normalize(vec3((${baseNormal}).xy+(${alt}).xy,(${baseNormal}).z*(${alt}).z))`;
      }
      normals = `normal=surfaceNormalVector(normal,${uv('normal')},${combined});`;
    } else {
      let encoded = `${sample('normal')}.rg`;
      if (enabled('blendWetMask')) encoded = `mix(vec2(0.5),${encoded},blendWet.r*0.5)`;
      normals = `normal=surfaceNormalVector(normal,${uv('normal')},surfaceDecodeNormal(${encoded},${intensity},${ySign}));`;
    }
  }

  const ior = kind === 'road' ? 1.635 : 1.4;
  const f0 = ((ior - 1) / (ior + 1)) ** 2;
  const physical = `material.specularColor=vec3(${number(f0)}); material.specularColorBlended=vec3(${number(f0)});`;
  const occlusion = maps.aoSpec ? `reflectedLight.indirectSpecular*=mix(1.0,aoSpec.r,${specOcclusionCoverage});` : '';
  return { albedo, normals, emissive: 'vec3(0.0)', physical, occlusion };
}
