import { clearcoatShaderParts } from './clearcoatSurface.js';
import { digitalFlagShaderParts, flagShaderParts } from './flagSurface.js';
import { glassShaderParts } from './glassSurface.js';
import { roadDecalShaderParts } from './roadDecalSurface.js';
import { roadShaderParts } from './roadSurface.js';
import { flatValue, glslNumber, glslVec, HELPERS, list, UNIFORM_DECLARATIONS, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import { standardShaderParts } from './standardSurface.js';
import { TERRAIN_WEIGHTS, terrainLayerCount, type SurfaceConfig } from './surfaceConfig.js';
import { vegetationShaderParts } from './vegetationSurface.js';

/** The GLSL a surface config contributes: declarations plus one chunk per patched `MeshStandardMaterial` include. */
export interface ShaderParts {
  declarations: string;
  albedo: string;
  normals: string;
  /** Replaces `totalEmissiveRadiance`; null keeps the glTF emissive. */
  emissive: string | null;
  physical: string;
  coatNormals: string;
  finish: string;
  absorption: string;
  occlusion: string;
}

const LAYER_KEYS = ['A', 'B', 'C', 'D'];
const SAMPLER_UVS: Record<string, string> = { UV_A: 'vSurfaceUV01.xy', UV_B: 'vSurfaceUV01.zw', UV_C: 'vSurfaceUV23.xy', UV_D: 'vSurfaceUV23.zw', WorldPlanar: 'vSurfaceXZ' };

function terrainParts(config: SurfaceConfig, context: ShaderContext): ExtendedParts {
  const { maps, parameters: p, flags: f } = config;
  const { sample, uv, number, vec, uniforms } = context;
  const adjust = p.Material_Adjust, terrain = p.Terrain;
  const num = (v: number, name: string) => uniforms ? name : number(v);
  const tint = uniforms ? 'diffuse' : vec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));
  const rough = num(value(adjust, 'Roughness', .5), 'roughness');
  const mixBias = num(value(terrain, 'MixMapBias', .5), 'surface_mixBias');
  const bias = f.MIXBIASBLEND === 'VertexAlpha' ? `max(0.01,${mixBias}*vSurfaceColour.a)` : mixBias;
  const lowScale = p.UV_Scale?.MixSpecularB;
  const high = sample('mix', 'vec4(0.5)'), low = sample('mix', 'vec4(0.5)', Array.isArray(lowScale) ? lowScale : undefined);
  const overlayFactor = num(value(terrain, 'SplatterOverlay', 1), 'surface_splatterOverlayFactor');
  const albedo = `
      vec4 splatter = ${sample('splatter')};
      vec4 mixHigh=${high},mixLow=${low};
      vec4 mixData=vec4(mixHigh.r*0.6+mixLow.r*0.4,mixHigh.g*mixLow.g,0.0,1.0);
      vec3 controls = splatter.rgb;
      ${maps.splatterOverlay ? `controls = mix(controls, surfaceOverlay(controls, ${sample('splatterOverlay')}.rgb), ${overlayFactor});` : ''}
      ${f.SPLATTERVC === 'Detail' ? 'controls += vSurfaceColour.rgb*2.0-1.0;' : f.SPLATTERVC === 'Multiply' ? 'controls *= vSurfaceColour.rgb;' : ''}
      vec3 blend = vec3(surfaceBlend(controls.r, mixData.r, ${bias}), surfaceBlend(controls.g, mixData.r, ${bias}), surfaceBlend(controls.b, mixData.r, ${bias}));
      surfaceWeights = ${TERRAIN_WEIGHTS[terrainLayerCount(f) ?? 4]};
      vec4 a = ${sample('layerA')}, b = ${sample('layerB')}, c = ${sample('layerC')}, d = ${sample('layerD')};
      vec4 ground = a*surfaceWeights.x + b*surfaceWeights.y + c*surfaceWeights.z + d*surfaceWeights.w;
      ${maps.pattern ? `vec2 pattern = ${sample('pattern')}.rg;
      float patternValue = mix(pattern.r, pattern.g, ${f.PATTERNBLEND === 'Random' ? 'vSurfaceRandom' : 'vSurfaceColour.a'});
      float patternStrength = ${f.PATTERNALBEDOBLENDS && f.PATTERNALBEDOBLENDS !== '@Undef' ? `dot(surfaceWeights, ${vec(LAYER_KEYS.map(k => value(terrain, `PatternAlbedo${k}`, 0)))})` : '1.0'} * ${num(value(terrain, 'PatternStrength', 1), 'surface_patternStrength')};
      ground.rgb = surfaceOverlay(ground.rgb,vec3(mix(0.5,patternValue,patternStrength)));` : ''}
      diffuseColor.rgb ${uniforms ? '=' : '*='} ${uniforms ? 'ground.rgb * diffuse' : `ground.rgb * ${tint} * ${tint}`};
      surfaceRoughness = surfaceAdjust(ground.a, ${rough});
      surfaceSpecular = mixData.g * ${num(value(adjust, 'SpecularLevel', .5), 'surface_specular')};
      float splatterOcclusion=splatter.a;
      ${maps.splatterOverlay ? `splatterOcclusion*=mix(1.0,${sample('splatterOverlay')}.a,${overlayFactor});` : ''}
      surfaceAO=0.2+0.8*splatterOcclusion;
    `;
  const nb = vec(LAYER_KEYS.map(k => value(p.Normal_Blends, `Albedo${k}`, 1)));
  const ni = vec(LAYER_KEYS.map(k => value(p.Normal_Intensity, `Albedo${k}`, 1)));
  const encoded = maps.normalA && maps.normalB ? `mix(${sample('normalA')}.rg,${sample('normalB')}.rg,clamp(dot(surfaceWeights,${nb}),0.0,1.0))` : maps.normalA ? `${sample('normalA')}.rg` : null;
  const normals = encoded ? `normal=surfaceNormal(normal,${uv('normalA')},${encoded},dot(surfaceWeights,${ni})*${num(value(adjust, 'NormalIntensity', 1), 'surface_normalScale.x')},${num(config.normalYSign, 'surface_normalScale.y')});` : '';
  const physical = `material.specularColor*=0.69444444*mix(vec3(1.0),diffuseColor.rgb,${num(value(adjust, 'SpecularTinting', 0), 'surface_specularTinting')}); material.specularColorBlended=material.specularColor;`;
  return { albedo, normals, emissive: '', physical, occlusion: 'reflectedLight.indirectSpecular*=surfaceAO;' };
}

function waterParts(config: SurfaceConfig, { sample, uv, number, uniforms }: ShaderContext, tint: string): ExtendedParts {
  const albedo = `
      vec4 waterAlbedo = ${sample('albedo')};
      diffuseColor.rgb = waterAlbedo.rgb * ${tint};
      diffuseColor.a = waterAlbedo.a;
      surfaceRoughness = 0.05;
      surfaceSpecular = 1.0;
    `;
  const ySign = uniforms ? 'surface_normalScale.y' : number(config.normalYSign);
  const normals = config.maps.normalA ? `normal = surfaceNormal(normal, ${uv('normalA')}, ${sample('normalA')}.rg, 1.0, ${ySign});` : '';
  return { albedo, normals, emissive: '', physical: 'material.specularColor = vec3(0.04);', occlusion: '' };
}

/** Luminous kinds: the albedo texture is emission only. */
function luminousParts(config: SurfaceConfig, { sample }: ShaderContext): ExtendedParts {
  const kind = config.kind;
  const mult = kind === 'highLumSun' ? '500.0' : kind === 'highLumTrackside' ? '100.0' : '20.0';
  return {
    albedo: `vec4 lum=${sample('albedo')}; diffuseColor.rgb=vec3(0.0); diffuseColor.a*=lum.a; surfaceSpecular=0.0;`,
    normals: '', physical: '', occlusion: '',
    emissive: `lum.rgb*${mult}*${kind === 'lowLumEmissive' ? 'clamp(vSurfaceColour.rgb,0.0,1.0)*' : ''}lum.a`,
  };
}

function familyParts(config: SurfaceConfig, context: ShaderContext, tint: string): ExtendedParts {
  const { sample, number } = context;
  switch (config.kind) {
    case 'lowLumEmissive': case 'highLumTrackside': case 'highLumSun':
      return luminousParts(config, context);
    case 'dashboard':
      // Authored values, else the ps30_dashboard.psh defaults (BaseRoughness 0.2, EmissiveDayIntensity 15).
      return {
        albedo: `vec4 dash=${sample('albedo')}; diffuseColor*=dash*vSurfaceColour; surfaceRoughness=${number(flatValue(config, 'BaseRoughness', .2))}; surfaceSpecular=0.0;`,
        normals: '', physical: '', occlusion: '',
        emissive: `diffuseColor.rgb*${number(flatValue(config, 'EmissiveDayIntensity', 15))}`,
      };
    case 'diffuse':
      return {
        albedo: `vec4 sourceDiffuse=${sample('albedo')}; diffuseColor*=sourceDiffuse${config.vertexColour === false ? '' : '*vSurfaceColour'}; surfaceRoughness=1.0; surfaceSpecular=0.0;`,
        normals: '', physical: '', occlusion: '', emissive: 'vec3(0.0)',
      };
    case 'glass': return glassShaderParts(config, context);
    case 'clearcoat': return clearcoatShaderParts(config, context);
    case 'flag': return flagShaderParts(config, context);
    case 'digitalFlag': return digitalFlagShaderParts(config, context);
    case 'roadDecal': return roadDecalShaderParts(config, context);
    case 'standard': case 'standardBlend': return standardShaderParts(config, context);
    case 'terrain': return terrainParts(config, context);
    case 'vegetation': return vegetationShaderParts(config, context);
    case 'road': case 'kerb': return roadShaderParts(config, context);
    case 'water': return waterParts(config, context, tint);
  }
}

/** GLSL for a surface config. `uniforms: false` bakes every tunable into the source (used to compare programs). */
export function shaderParts(config: SurfaceConfig, options: { uniforms: boolean } = { uniforms: true }): ShaderParts {
  const { maps } = config;
  const useUniforms = options.uniforms;
  const uv = (key: string, alternateScale?: readonly number[]) => {
    const map = maps[key];
    if (!map) throw Error(`Unsupported shader UV: ${config.name}/${key}`);
    const source = SAMPLER_UVS[map.uv];
    if (useUniforms && !alternateScale) return `(${source} * surface_scale_${key})`;
    return `(${source} * ${glslVec(alternateScale ?? map.scale ?? [1, 1])})`;
  };
  const sample = (key: string, fallback = 'vec4(1.0)', scale?: readonly number[]) => maps[key] ? `texture2D(surface_${key}, ${uv(key, scale)})` : fallback;
  const context: ShaderContext = { sample, uv, number: glslNumber, vec: glslVec, uniforms: useUniforms };
  const adjust = config.parameters.Material_Adjust;
  const tint = useUniforms ? 'diffuse' : glslVec(list(adjust, 'AlbedoTint', [1, 1, 1]).slice(0, 3));
  const parts = familyParts(config, context, tint);
  const mapDeclarations = Object.keys(maps).sort().map(key => `uniform sampler2D surface_${key};${useUniforms ? `\nuniform vec2 surface_scale_${key};` : ''}`).join('\n');
  return {
    declarations: HELPERS + (useUniforms ? UNIFORM_DECLARATIONS : '') + (config.kind === 'digitalFlag' ? '\nuniform float surface_flag_elapsed;' : '') + mapDeclarations,
    albedo: `float surfaceRoughness = roughness, surfaceMetallic = metalness, surfaceStandardBlend = 1.0, surfaceAO = 1.0, surfaceSpecular = 1.0, surfaceDetailCoverage = 1.0, surfaceAltBlend = 0.0;
      vec4 surfaceWeights = vec4(1.0,0.0,0.0,0.0);
      ${parts.albedo}`,
    normals: parts.normals,
    emissive: parts.emissive || null,
    physical: parts.physical,
    coatNormals: parts.coatNormals ?? '',
    finish: parts.finish ?? '',
    absorption: parts.absorption ?? '',
    occlusion: parts.occlusion,
  };
}
