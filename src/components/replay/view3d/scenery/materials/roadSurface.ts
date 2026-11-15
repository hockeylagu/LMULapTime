import { glslNumber, value, list, type ShaderContext, type SurfaceParts } from './shaderContext.js';
import type { SurfaceConfig } from './surfaceConfig.js';

/** Whether a road or kerb surface reads its own vertices' surface state (rubber or loose material; `scenery/realRoad.ts`). */
export function readsRealRoad(config: SurfaceConfig): boolean {
  return (config.kind === 'road' || config.kind === 'kerb') && (config.flags.groove === 'perVertex' || !!config.flags.marbles);
}

/** Whether it reads the track's median rubber instead of its vertices' (`surface_realRoadMedian`). */
export const readsTrackRubber = (config: SurfaceConfig): boolean =>
  (config.kind === 'road' || config.kind === 'kerb') && config.flags.groove === 'trackAverage';

/**
 * The surface state terms of a road or kerb: the rubber groove, then dust, then marbles, each mixing the finished surface toward its
 * own colour (squared, as the tint is), roughness and specular level and lifting its occlusion. The groove's mask (red and green weights)
 * scales the rubber below and above half; dust clears with a quarter of the groove and gathers with marbles; a mask flag without its map
 * reads 0, as an unbound stage does. Dust and marbles also scale `realRoadKeep`, the share of the blend-wet mask they leave.
 */
function realRoadTerms(config: SurfaceConfig, { sample, number, vec, uniforms }: ShaderContext): string {
  const { maps, parameters: p, flags: f, kind } = config;
  let code = '';
  if (f.groove) {
    const groove = p.groove;
    const mask = f.grooveMap ? (maps.groove ? `${sample('groove')}.rg` : 'vec2(0.0)') : 'vec2(1.0)';
    code += `vec2 grooveMask=${mask};
      float groovePerc=${f.roadDetailsMap ? 'mix(roadDetails.g,1.0,realRoadGroove)' : 'realRoadGroove'};
      float surfaceGroove=max(2.0*max(groovePerc-0.5,0.0)*grooveMask.g,grooveMask.r*min(1.5*groovePerc,1.0));
      vec3 grooveAlbedo=${uniforms ? 'surface_grooveAlbedo' : vec(list(groove, 'albedo'))};
      diffuseColor.rgb=mix(diffuseColor.rgb,grooveAlbedo*grooveAlbedo,${kind === 'kerb' ? 'sqrt(surfaceGroove)' : 'surfaceGroove'});
      surfaceRoughness=mix(surfaceRoughness,${uniforms ? 'surface_grooveRoughness' : number(value(groove, 'roughness'))},surfaceGroove);
      surfaceSpecular=mix(surfaceSpecular,${uniforms ? 'surface_grooveSpecular' : number(value(groove, 'specular'))},surfaceGroove);
      surfaceAO=mix(surfaceAO,1.0,surfaceGroove);
    `;
  }
  const marbleDust = f.marbleDustMap ? (maps.marbleDust ? `${sample('marbleDust')}.rg` : 'vec2(0.0)') : 'vec2(1.0)';
  if (f.dust || f.marbles) code += `vec2 marbleDustMask=${marbleDust};
`;
  const mixToward = (name: string, group: typeof p[string], blend: string) => `
      diffuseColor.rgb=mix(diffuseColor.rgb,${name}Albedo*${name}Albedo,${blend});
      surfaceRoughness=mix(surfaceRoughness,${number(value(group, 'roughness'))},${blend});
      surfaceSpecular=mix(surfaceSpecular,${number(value(group, 'specular'))},${blend});
      surfaceAO=mix(surfaceAO,1.0,${blend});
      realRoadKeep*=1.0-${blend};
    `;
  if (f.dust) {
    const dust = p.dust;
    code += `vec3 dustAlbedo=${vec(list(dust, 'albedo'))};
      float dustBlend=clamp(0.5-4.0*realRoadGroove,0.0,1.0)*${number(value(dust, 'overallScale'))}
        *clamp((max(realRoadMarbles*${number(value(dust, 'marbleScale'))},${f.roadDetailsMap ? 'roadDetails.r' : '0.0'})-marbleDustMask.g)/0.5,0.0,1.0);
      ${mixToward('dust', dust, 'dustBlend')}`;
  }
  if (f.marbles) {
    code += `vec3 marblesAlbedo=${vec(list(p.marbles, 'albedo'))};
      float marblesBlend=realRoadMarbles*marbleDustMask.r;
      ${mixToward('marbles', p.marbles, 'marblesBlend')}`;
  }
  return code;
}

/**
 * Dry road and kerb surfaces with the track surface state of the scene's time: rubber and loose material per vertex (`vSurfaceRealRoad`)
 * or the track's median rubber. Wetness stays disabled.
 */
export function roadShaderParts(config: SurfaceConfig, context: ShaderContext): SurfaceParts {
  const { sample, uv, number, vec, uniforms } = context;
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
  const groove = f.groove === 'trackAverage' ? 'surface_realRoadMedian' : f.groove ? 'vSurfaceRealRoad.x' : '0.0';
  let albedo = `
    float realRoadGroove=${groove}, realRoadMarbles=${f.marbles ? 'vSurfaceRealRoad.y' : '0.0'}, realRoadKeep=1.0;
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
    // The alternate albedo shows where the blend-wet mask is under the road details' default share plus the groove's and marbles'.
    const mixBias = num(value(blendGroup, 'mixBias'), 'surface_kerbMixBias');
    const defaultBlend = num(value(blendGroup, 'default'), 'surface_kerbDefaultBlend');
    const mixBlend = enabled('blendWetMask') ? 'blendWet.r' : '0.5';
    const shares = [
      ...enabled('roadDetailsMap') ? [`roadDetails.b*${defaultBlend}`] : [],
      ...f.groove ? [`realRoadGroove*${number(value(blendGroup, 'groove'))}`] : [],
      ...f.marbles ? [`realRoadMarbles*${number(value(blendGroup, 'marbles'))}`] : [],
    ];
    const defaultControl = shares.length ? `clamp(${shares.join('+')},0.0,1.0)` : '0.0';
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

  albedo += realRoadTerms(config, context);

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
      // Dust and marbles flatten the kerb as they cover the blend-wet mask.
      if (enabled('blendWetMask')) encoded = `mix(vec2(0.5),${encoded},blendWet.r*realRoadKeep*0.5)`;
      normals = `normal=surfaceNormalVector(normal,${uv('normal')},surfaceDecodeNormal(${encoded},${intensity},${ySign}));`;
    }
  }

  const ior = kind === 'road' ? 1.635 : 1.4;
  const f0 = ((ior - 1) / (ior + 1)) ** 2;
  const physical = `material.specularColor=vec3(${glslNumber(f0)}); material.specularColorBlended=vec3(${glslNumber(f0)});`;
  const occlusion = maps.aoSpec ? `reflectedLight.indirectSpecular*=mix(1.0,aoSpec.r,${specOcclusionCoverage});` : '';
  return { albedo, normals, emissive: 'vec3(0.0)', physical, occlusion };
}
