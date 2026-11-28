import { Vector2, Vector3, Vector4, type IUniform, type Texture } from 'three';
import { GAME_LIGHT_UNIT } from '../../atmosphere/sunSamples.js';
import { focusedLookup } from '../textureFocus.js';
import { uvShiftUniform } from './surfaceAnimation.js';
import { tyreReadsAxle, tyreShaderParts } from '../../car/tyreSurface.js';
import { clearcoatShaderParts } from './clearcoatSurface.js';
import { CORE_DECLARATIONS, CORE_MAPS } from './coreSurface.js';
import { digitalFlagShaderParts, flagShaderParts } from './flagSurface.js';
import { glassShaderParts, windscreenInsideShaderParts } from './glassSurface.js';
import { roadDecalShaderParts } from './roadDecalSurface.js';
import { readsRealRoad, roadShaderParts } from './roadSurface.js';
import { REFLECTING_KINDS } from './sceneryReflection.js';
import { glslNumber, glslVec, HELPERS, list, UNIFORM_DECLARATIONS, value, type ExtendedParts, type ShaderContext } from './shaderContext.js';
import { standardShaderParts } from './standardSurface.js';
import { TERRAIN_WEIGHTS, terrainLayerCount, type ParameterGroup, type SurfaceConfig, type SurfaceMap } from './surfaceConfig.js';
import { vegetationShaderParts } from './vegetationSurface.js';
import { isLampKind } from '../lampSize.js';
import { lampShares, type LampShares } from '../../night/cockpitLight.js';
/**
 * The GLSL a surface config contributes: declarations plus one chunk per stage of the light model, placed in the composed program of
 * a scenery surface or a car's (surfaceProgram.ts, car/carMaterials.ts).
 */
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
  /** Its shares of the track lights and headlight beams, and its cockpit light (night/cockpitLight.ts). */
  lamps: LampShares;
  /** The values of `surface_constants`, four to a vec4 (with `uniforms`; empty otherwise): not part of the program's source. */
  constants: number[];
}

const LAYER_KEYS = ['A', 'B', 'C', 'D'];
const SAMPLER_UVS: Record<string, string> = { uv0: 'vSurfaceUV01.xy', uv1: 'vSurfaceUV01.zw', uv2: 'vSurfaceUV23.xy', uv3: 'vSurfaceUV23.zw', worldPlanar: 'vSurfaceXZ' };

function terrainParts(config: SurfaceConfig, context: ShaderContext): ExtendedParts {
  const { maps, parameters: p, flags: f } = config;
  const { sample, uv, number, vec, uniforms } = context;
  const adjust = p.adjust, terrain = p.terrain;
  const num = (v: number, name: string) => uniforms ? name : number(v);
  const tint = uniforms ? 'diffuse' : vec(list(adjust, 'tint'));
  const rough = num(value(adjust, 'roughness'), 'roughness');
  const mixBias = num(value(terrain, 'mixBias'), 'surface_mixBias');
  const bias = f.mixBias === 'vertexAlpha' ? `max(0.01,${mixBias}*vSurfaceColour.a)` : mixBias;
  const high = sample('mix', 'vec4(0.5)'), low = maps.mix ? sample('mix', 'vec4(0.5)', list(p.uvScale, 'mixLow')) : 'vec4(0.5)';
  const overlayFactor = num(value(terrain, 'splatterOverlay'), 'surface_splatterOverlayFactor');
  // A decal (the grass tyre marks) multiplies the albedo after the layers, and its alpha is the surface's: a MASK material cuts by
  // it (layer A's alpha is roughness).
  if (f.decal !== undefined && (f.decal !== 'albedoMultiply' || !maps.decal)) throw Error(`Unsupported terrain decal: ${config.name ?? '?'}`);
  const decal = f.decal ? `vec4 terrainDecal=${sample('decal')}; diffuseColor.rgb*=terrainDecal.rgb; diffuseColor.a=terrainDecal.a;` : '';
  const albedo = `
      vec4 splatter = ${sample('splatter')};
      vec4 mixHigh=${high},mixLow=${low};
      vec4 mixData=vec4(mixHigh.r*0.6+mixLow.r*0.4,mixHigh.g*mixLow.g,0.0,1.0);
      vec3 controls = splatter.rgb;
      ${maps.splatterOverlay ? `controls = mix(controls, surfaceOverlay(controls, ${sample('splatterOverlay')}.rgb), ${overlayFactor});` : ''}
      ${f.splatterVertexColour === 'detail' ? 'controls += vSurfaceColour.rgb*2.0-1.0;' : f.splatterVertexColour === 'multiply' ? 'controls *= vSurfaceColour.rgb;' : ''}
      vec3 blend = vec3(surfaceBlend(controls.r, mixData.r, ${bias}), surfaceBlend(controls.g, mixData.r, ${bias}), surfaceBlend(controls.b, mixData.r, ${bias}));
      surfaceWeights = ${TERRAIN_WEIGHTS[terrainLayerCount(f)]};
      vec4 a = ${sample('layerA')}, b = ${sample('layerB')}, c = ${sample('layerC')}, d = ${sample('layerD')};
      vec4 ground = a*surfaceWeights.x + b*surfaceWeights.y + c*surfaceWeights.z + d*surfaceWeights.w;
      ${maps.pattern ? `vec2 pattern = ${sample('pattern')}.rg;
      float patternValue = mix(pattern.r, pattern.g, ${f.pattern === 'random' ? 'vSurfaceRandom' : 'vSurfaceColour.a'});
      float patternStrength = ${f.patternLayers ? `dot(surfaceWeights, ${vec(LAYER_KEYS.map(k => value(terrain, `pattern${k}`)))})` : '1.0'} * ${num(value(terrain, 'patternStrength'), 'surface_patternStrength')};
      ground.rgb = surfaceOverlay(ground.rgb,vec3(mix(0.5,patternValue,patternStrength)));` : ''}
      diffuseColor.rgb ${uniforms ? '=' : '*='} ${uniforms ? 'ground.rgb * diffuse' : `ground.rgb * ${tint} * ${tint}`};
      ${decal}
      surfaceRoughness = surfaceAdjust(ground.a, ${rough});
      surfaceSpecular = mixData.g * ${num(value(adjust, 'specular'), 'surface_specular')};
      float splatterOcclusion=splatter.a;
      ${maps.splatterOverlay ? `splatterOcclusion*=mix(1.0,${sample('splatterOverlay')}.a,${overlayFactor});` : ''}
      surfaceAO=0.2+0.8*splatterOcclusion;
      surfaceBakedShadow=splatter.a;
    `;
  const nb = vec(LAYER_KEYS.map(k => value(p.layerNormalBlend, k)));
  const ni = vec(LAYER_KEYS.map(k => value(p.layerNormalStrength, k)));
  const encoded = maps.normalA && maps.normalB ? `mix(${sample('normalA')}.rg,${sample('normalB')}.rg,clamp(dot(surfaceWeights,${nb}),0.0,1.0))` : maps.normalA ? `${sample('normalA')}.rg` : null;
  const normals = encoded ? `normal=surfaceNormal(normal,${uv('normalA')},${encoded},dot(surfaceWeights,${ni})*${num(value(adjust, 'normalStrength'), 'surface_normalScale.x')},${num(config.normalYSign, 'surface_normalScale.y')});` : '';
  const physical = `material.specularColor*=0.69444444*mix(vec3(1.0),diffuseColor.rgb,${num(value(adjust, 'specularTinting'), 'surface_specularTinting')}); material.specularColorBlended=material.specularColor;`;
  return { albedo, normals, emissive: '', physical, occlusion: 'reflectedLight.indirectSpecular*=surfaceAO;' };
}

function waterParts(config: SurfaceConfig, { sample, uv, number, uniforms }: ShaderContext, tint: string): ExtendedParts {
  // The albedo's alpha is the water's depth (shore to deep, which grades its look), not its opacity: the water draws opaque, as the
  // reference's mostly does, until the package carries its opacity.
  const albedo = `
      vec4 waterAlbedo = ${sample('albedo')};
      diffuseColor.rgb = waterAlbedo.rgb * ${tint};
      diffuseColor.a = 1.0;
      surfaceRoughness = 0.05;
      surfaceSpecular = 1.0;
    `;
  const ySign = uniforms ? 'surface_normalScale.y' : number(config.normalYSign);
  // Three's specular anti-aliasing reads only the geometric normal, so a 0.05-roughness mirror over the fine wave normals
  // glitters as the mips average them. Widen the roughness by the screen-space spread of the perturbed normal (Kaplanyan).
  const normals = config.maps.normalA ? `normal = surfaceNormal(normal, ${uv('normalA')}, ${sample('normalA')}.rg, 1.0, ${ySign});
    vec3 waveDx = dFdx(normal), waveDy = dFdy(normal);
    roughnessFactor = sqrt(min(1.0, roughnessFactor * roughnessFactor + 0.5 * (dot(waveDx, waveDx) + dot(waveDy, waveDy))));` : '';
  return { albedo, normals, emissive: '', physical: 'material.specularColor = vec3(0.04);', occlusion: '' };
}

/**
 * The power of a bright luminous panel's facing term (a sun-bright panel narrowly, a trackside one broadly); null for other kinds.
 * Its cosine, N.V, is taken per vertex and blended across the panel (`vSurfaceFacing`), as the game's program does: taken per
 * pixel, a flat panel's middle faces the eye squarely and its glow peaks far higher than the game's.
 */
export function luminousFacingPower(config: SurfaceConfig): string | null {
  return config.kind === 'highLumSun' ? '64.0' : config.kind === 'highLumTrackside' ? '8.0' : null;
}

/**
 * Luminous kinds: the albedo texture is emission only. The bright panels glow most toward the eye, up to three times head-on, by
 * 1 + 2 (N.V)^n (`luminousFacingPower`). The texture times its strength is written straight to the image as a game light value,
 * converted to the scene by GAME_LIGHT_UNIT as the car lamps are.
 */
function luminousParts(config: SurfaceConfig, { sample }: ShaderContext): ExtendedParts {
  const kind = config.kind;
  const mult = glslNumber((kind === 'highLumSun' ? 500 : kind === 'highLumTrackside' ? 100 : 20) * GAME_LIGHT_UNIT);
  const facing = luminousFacingPower(config);
  const view = facing ? `*(1.0+2.0*pow(clamp(vSurfaceFacing,0.0,1.0),${facing}))` : '';
  return {
    albedo: `vec4 lum=${sample('albedo')}; diffuseColor.rgb=vec3(0.0); diffuseColor.a*=lum.a; surfaceSpecular=0.0;`,
    normals: '', physical: '', occlusion: '',
    emissive: `lum.rgb*${mult}${view}*vSurfaceLampShare*${kind === 'lowLumEmissive' ? 'clamp(vSurfaceColour.rgb,0.0,1.0)*' : ''}lum.a`,
  };
}

/**
 * Screens: a dashboard (the screen texture times the vertex colour, a decal laid over it by its alpha, with its own roughness) or
 * an external monitor (screen times decal). The screen lights itself as a constant light inside the diffuse sum, so it shows
 * albedo times its strength over pi, a game light value converted to the scene by GAME_LIGHT_UNIT as the sun is, with the usual
 * environment lighting on top at half the specular level.
 * Its strength runs from its night strength to its day strength with the scene's day share (the scene block's `lit_dayLight`).
 */
function screenParts(config: SurfaceConfig, { sample, number }: ShaderContext): ExtendedParts {
  const screen = config.parameters.dashboard, monitor = config.kind === 'externalMonitor';
  const decal = config.maps.decal && (monitor || config.flags.decal === 'alphaBlend');
  const f0 = ((1.4 - 1) / (1.4 + 1)) ** 2;
  const albedo = monitor
    ? `diffuseColor*=${sample('albedo')}*${sample('decal')}; surfaceRoughness=${number(value(screen, 'roughness'))};`
    : `vec4 dash=${sample('albedo')}; diffuseColor*=dash*vSurfaceColour; surfaceRoughness=${number(value(screen, 'roughness'))};
      ${decal ? `vec4 dashDecal=${sample('decal')}; diffuseColor.rgb=mix(diffuseColor.rgb,dashDecal.rgb,dashDecal.a); surfaceRoughness=mix(surfaceRoughness,${number(value(screen, 'decalRoughness'))},dashDecal.a);` : ''}`;
  return {
    albedo: `${albedo} surfaceMetallic=0.0; surfaceSpecular=0.5;`,
    normals: '', occlusion: '',
    physical: `material.specularColor=vec3(${glslNumber(f0)}); material.specularColorBlended=vec3(${glslNumber(f0)});`,
    emissive: `diffuseColor.rgb*mix(${number(value(screen, 'emissiveNight'))},${number(value(screen, 'emissiveStrength'))},lit_dayLight)*${number((1 - 0.5 * f0) / Math.PI * GAME_LIGHT_UNIT)}`,
  };
}

function familyParts(config: SurfaceConfig, context: ShaderContext, tint: string): ExtendedParts {
  const { sample } = context;
  switch (config.kind) {
    case 'lowLumEmissive': case 'highLumTrackside': case 'highLumSun':
      return luminousParts(config, context);
    case 'dashboard': case 'externalMonitor':
      return screenParts(config, context);
    case 'diffuse':
      return {
        albedo: `vec4 sourceDiffuse=${sample('albedo')}; diffuseColor*=sourceDiffuse${config.vertexColour === false ? '' : '*vSurfaceColour'}; surfaceRoughness=1.0; surfaceSpecular=0.0;`,
        normals: '', physical: '', occlusion: '', emissive: 'vec3(0.0)',
      };
    case 'glass': case 'windscreen': return glassShaderParts(config, context);
    case 'windscreenInside': return windscreenInsideShaderParts(context);
    case 'clearcoat': return clearcoatShaderParts(config, context);
    case 'flag': return flagShaderParts(config, context);
    case 'digitalFlag': return digitalFlagShaderParts(config, context);
    case 'roadDecal': return roadDecalShaderParts(config, context);
    case 'standard': case 'standardBlend': return standardShaderParts(config, context);
    case 'terrain': return terrainParts(config, context);
    case 'vegetation': return vegetationShaderParts(config, context);
    case 'road': case 'kerb': return roadShaderParts(config, context);
    case 'water': return waterParts(config, context, tint);
    case 'tyre': return tyreShaderParts(config, context);
  }
}

/** The maps a surface program declares as samplers, in declaration order. */
function surfaceMapKeys(config: SurfaceConfig): string[] { return Object.keys(config.maps).sort(); }

export const REFLECTION_SAMPLERS = 2, CASCADE_SAMPLERS = 1, LIT_SAMPLERS = 2;
/** `batchingTexture` and `batchingIdTexture` of a BatchedMesh's vertex shader (no per-instance colour). */
export const BATCH_VERTEX_TEXTURES = 2;

/**
 * Texture units a surface's program samples: its maps (`mapDeclarations`), the reflection cube and integration table of the
 * reflecting kinds (sceneryReflection.ts), the cascade atlas (cascadeShadowPart, every surface), and the lit template's two:
 * `envMap` (the scene's environment, or a car's probe; the template declares it) and three's `dfgLUT` (the physical model). The road surface state
 * and the track lights' sums are vertex attributes (`realRoad.ts`, trackLightProgram.ts), no texture. A batch adds
 * `BATCH_VERTEX_TEXTURES` in the vertex stage; three counts both stages against `capabilities.maxTextures`.
 */
export function surfaceTextureUnits(config: SurfaceConfig): number {
  return surfaceMapKeys(config).length + (REFLECTING_KINDS.has(config.kind) ? REFLECTION_SAMPLERS : 0) + CASCADE_SAMPLERS + LIT_SAMPLERS;
}

/**
 * GLSL for a surface config. `uniforms: false` bakes every tunable into the source (used to compare programs). With `uniforms`, a
 * family's values (`number`, `vec`) read from a uniform array instead of literals: the source then depends only on the surface's
 * shape (family, maps, modes), so the materials of one shape share a program, each with its own `constants`. With `core` (a core
 * surface with every core map, `coreSurface`), each core map's lookup and the normal mapping read the map only where its
 * `surface_hasMap` switch is on, else the lookup's fallback and the geometry's normal.
 */
export function shaderParts(config: SurfaceConfig, options: { uniforms: boolean; core?: boolean } = { uniforms: true }): ShaderParts {
  const { maps } = config;
  const useUniforms = options.uniforms, core = options.core === true;
  if (core && !useUniforms) throw Error('A core surface reads its values from uniforms');
  const constants: number[] = [];
  const constant = (n: number) => {
    glslNumber(n); // Rejects a non-finite value, as a literal would.
    const index = constants.push(n) - 1;
    return `surface_constants[${index >> 2}].${'xyzw'[index & 3]}`;
  };
  const number = useUniforms ? constant : glslNumber;
  const vec = useUniforms ? (a: readonly number[]) => `vec${a.length}(${a.map(constant).join(',')})` : glslVec;
  // With uniforms, a map reads its UV set by its weights (`surfaceUv`): maps on other sets share the program.
  const uv = (key: string, alternateScale?: readonly number[]) => {
    const map = maps[key];
    if (!map) throw Error(`Unsupported shader UV: ${config.name ?? '?'}/${key}`);
    const source = useUniforms ? `surfaceUv(surface_uv_${key})` : SAMPLER_UVS[map.uv], shift = map.uvAnimation ? ` + surface_shift_${key}` : '';
    if (useUniforms && !alternateScale) return `(${source} * surface_scale_${key}${shift})`;
    return `(${source} * ${vec(alternateScale ?? map.scale)}${shift})`;
  };
  // With uniforms, every lookup fades in as its texture sharpens (textureFocus.ts).
  const lookup = (key: string, fallback = 'vec4(1.0)', scale?: readonly number[]) => !maps[key] ? fallback
    : useUniforms ? focusedLookup(`surface_${key}`, uv(key, scale)) : `texture2D(surface_${key}, ${uv(key, scale)})`;
  const switched = (key: string) => core ? (CORE_MAPS as readonly string[]).indexOf(key) : -1;
  const sample = (key: string, fallback = 'vec4(1.0)', scale?: readonly number[]) => switched(key) < 0 ? lookup(key, fallback, scale)
    : `(surface_hasMap[${switched(key)}] > 0.5 ? ${lookup(key, fallback, scale)} : ${fallback})`;
  const context: ShaderContext = { sample, uv, number, vec, uniforms: useUniforms, core };
  const tint = useUniforms ? 'diffuse' : glslVec(list(config.parameters.adjust, 'tint'));
  const parts = familyParts(config, context, tint), lamps = lampShares(config, context, core);
  if (core) parts.normals = `if (surface_hasMap[${switched('normal')}] > 0.5) { ${parts.normals} }`;
  const mapDeclarations = surfaceMapKeys(config).map(key => `uniform sampler2D surface_${key};${useUniforms ? `\nuniform vec2 surface_scale_${key};\nuniform vec4 surface_uv_${key};` : ''}`
    + (maps[key]!.uvAnimation ? `\nuniform vec2 surface_shift_${key};` : '')).join('\n');
  return {
    declarations: HELPERS + (useUniforms ? UNIFORM_DECLARATIONS : '') + (tyreReadsAxle(config) ? '\nvarying float vSurfaceAxle;' : '')
      + (readsRealRoad(config) ? '\nvarying vec2 vSurfaceRealRoad;' : '') + (luminousFacingPower(config) ? '\nvarying float vSurfaceFacing;' : '') + (isLampKind(config.kind) ? '\nvarying float vSurfaceLampShare;' : '')
      + (constants.length ? `\nuniform vec4 surface_constants[${Math.ceil(constants.length / 4)}];` : '')
      + (core ? `\n${CORE_DECLARATIONS}` : '') + mapDeclarations,
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
    lamps,
    constants,
  };
}

/** The weights of a map's UV set for `surfaceUv`: uv0..uv3, none for the world XZ. */
const UV_WEIGHTS: Record<SurfaceMap['uv'], readonly [number, number, number, number]> = {
  uv0: [1, 0, 0, 0], uv1: [0, 1, 0, 0], uv2: [0, 0, 1, 0], uv3: [0, 0, 0, 1], worldPlanar: [0, 0, 0, 0],
};

/**
 * The vertex stage's surface inputs: every extra UV set (a map reads its own by weight), the package's vertex colour (white
 * without `vertexColour`), and the varyings the family reads.
 */
export function surfaceVertexDeclarations(config: SurfaceConfig, vertexColour: boolean): string {
  const uvs = [1, 2, 3].map(set => `#ifndef USE_UV${set}\n    attribute vec2 uv${set};\n    #endif`).join('\n    ');
  return `
    ${uvs}
    ${vertexColour ? 'attribute vec4 _lmu_colour;' : 'const vec4 _lmu_colour = vec4(1.0);'}
    varying vec2 vSurfaceXZ;
    varying float vSurfaceRandom;
    varying vec4 vSurfaceUV01, vSurfaceUV23, vSurfaceColour;${tyreReadsAxle(config) ? '\n    varying float vSurfaceAxle;' : ''}${luminousFacingPower(config) ? '\n    varying float vSurfaceFacing;' : ''}`;
}

/** After `begin_vertex`: the varyings, from the vertex's own position, UV sets, colour and normal. */
export function surfaceVertexMain(config: SurfaceConfig): string {
  return `vSurfaceXZ = position.xz; vSurfaceRandom=fract(abs(position.x+position.z)); vSurfaceUV01 = vec4(uv,uv1); vSurfaceUV23 = vec4(uv2,uv3); vSurfaceColour = _lmu_colour;${tyreReadsAxle(config) ? ' vSurfaceAxle = objectNormal.x;' : ''}`;
}

/** After `project_vertex`, before a lamp grows: a bright luminous panel's facing cosine (`luminousFacingPower`), never turned to a back face. */
export const SURFACE_FACING = 'vSurfaceFacing = max(0.0, dot(normalize(transformedNormal), normalize(-mvPosition.xyz)));';

/**
 * A cut-out's alpha test: its own alpha is its coverage in the multisampled scene pass, so wire thinner than a pixel still dims what is
 * behind it; passes without multisampling cut at the threshold (the pass block's `surface_alphaCut`).
 */
export const SURFACE_ALPHA_TEST = '#ifdef USE_ALPHATEST\n if (diffuseColor.a < alphaTest * surface_alphaCut || diffuseColor.a == 0.0) discard;\n#endif';

/** The light model's roughness and metalness from the family's. */
export const SURFACE_ROUGHNESS = ' roughnessFactor = clamp(surfaceRoughness,0.045,1.0);';
export const SURFACE_METALNESS = ' metalnessFactor = clamp(surfaceMetallic,0.0,1.0);';

/** On the light model's material once set up: the family's specular level, a metal's reflectance its albedo. */
export const SURFACE_SPECULAR = '{ material.specularColor=mix(material.specularColor*surfaceSpecular,diffuseColor.rgb,metalnessFactor); material.specularColorBlended=mix(material.specularColorBlended*surfaceSpecular,diffuseColor.rgb,metalnessFactor); material.specularF90=mix(surfaceSpecular,1.0,metalnessFactor); }';

/** On the light once it is all in: the family's ambient occlusion, then its specular occlusion (clear coat's, its coat's too). */
export function surfaceOcclusion(config: SurfaceConfig, code: ShaderParts): string {
  const occlusion = config.kind === 'clearcoat'
    ? 'reflectedLight.directSpecular*=surfaceSpecularOcclusion;reflectedLight.indirectSpecular*=surfaceSpecularOcclusion;clearcoatSpecularDirect*=surfaceSpecularOcclusion;clearcoatSpecularIndirect*=surfaceSpecularOcclusion;'
    : code.occlusion;
  return `reflectedLight.indirectDiffuse*=surfaceAO;${occlusion}`;
}

/** The family's emission in place of the material's own, if it has one; off while the venue is captured (the pass block's `surface_emission`). */
export function surfaceEmission(code: ShaderParts): string {
  return `${code.emissive ? `totalEmissiveRadiance=${code.emissive};` : ''}totalEmissiveRadiance*=surface_emission;`;
}

/** The family values that are uniforms where the surface carries them (names as `UNIFORM_DECLARATIONS`): name, group, key. */
const TUNABLES: readonly (readonly [string, string, string])[] = [
  ['surface_specular', 'adjust', 'specular'], ['surface_specularTinting', 'adjust', 'specularTinting'],
  ['surface_mixBias', 'terrain', 'mixBias'], ['surface_splatterOverlayFactor', 'terrain', 'splatterOverlay'], ['surface_patternStrength', 'terrain', 'patternStrength'],
  ['surface_decalStrength', 'decal', 'strength'], ['surface_decalThickness', 'decal', 'thickness'], ['surface_decalSoftness', 'decal', 'softness'], ['surface_decalDetail', 'decal', 'detail'],
  ['surface_detailStrength', 'detail', 'albedo'], ['surface_kerbMixBias', 'kerbBlend', 'mixBias'], ['surface_kerbDefaultBlend', 'kerbBlend', 'default'],
  ['surface_noOverlayRoughness', 'bare', 'roughness'], ['surface_noOverlaySpecular', 'bare', 'specular'],
  ['surface_grooveRoughness', 'groove', 'roughness'], ['surface_grooveSpecular', 'groove', 'specular'],
  ...([['single', 'singleCoat'], ['base', 'baseCoat'], ['coat', 'clearCoat']] as const).flatMap(([prefix, group]) => [
    [`surface_${prefix}Roughness`, group, 'roughness'], [`surface_${prefix}IOR`, group, 'ior'],
    [`surface_${prefix}Specular`, group, 'specular'], [`surface_${prefix}NormalStrength`, group, 'normalStrength'],
  ] as const),
  ['surface_coatStrength', 'clearCoat', 'strength'],
];

/**
 * A three-component value of a group as a vector, or zero where the surface has no such group (its uniform is then not read): a
 * group the surface carries must carry the value (`list`).
 */
const vector3 = (group: ParameterGroup | undefined, key: string) => !group ? new Vector3() : new Vector3(...list(group, key) as [number, number, number]);

/**
 * A surface material's own uniforms (its program's values, `shaderParts` with uniforms): the family's tunables (each one the
 * surface carries; the names are the same for every surface, so they never split a program), its packed constants, normal scale,
 * every map's sampler (`textures`, by map key), scale, UV set weights and UV shift. The clock, day share, track rubber, alpha cut and
 * emission switch it reads are the scene and pass blocks' (shaders/sceneBlock.ts). `core` as `shaderParts`'.
 */
export function surfaceUniforms(config: SurfaceConfig, textures: Readonly<Record<string, Texture>>, core = false): Record<string, IUniform> {
  const code = shaderParts(config, { uniforms: true, core }), p = config.parameters;
  const uniforms: Record<string, IUniform> = {};
  // A value the surface carries is checked (`value`: a finite number); 0 for one it does not, whose uniform its program never reads.
  for (const [name, group, key] of TUNABLES) uniforms[name] = { value: p[group]?.[key] === undefined ? 0 : value(p[group], key) };
  uniforms.surface_grooveAlbedo = { value: vector3(p.groove, 'albedo') };
  uniforms.surface_coatLacquerColour = { value: vector3(p.clearCoat, 'lacquerColour') };
  uniforms.surface_coatLacquerThickness = { value: p.clearCoat ? Math.max(0.001, value(p.clearCoat, 'lacquerThickness')) : 0 };
  uniforms.surface_normalScale = { value: new Vector2(value(p.adjust, 'normalStrength'), config.normalYSign) };
  // The family's values, four to a vec4 (the last one padded).
  if (code.constants.length) uniforms.surface_constants = { value: Float32Array.from({ length: Math.ceil(code.constants.length / 4) * 4 }, (_, i) => code.constants[i] ?? 0) };
  for (const [key, map] of Object.entries(config.maps)) {
    const texture = textures[key];
    if (!texture) throw Error(`Surface ${config.name ?? '?'} has no texture for its map ${key}`);
    uniforms[`surface_${key}`] = { value: texture };
    uniforms[`surface_scale_${key}`] = { value: new Vector2(...map!.scale) };
    uniforms[`surface_uv_${key}`] = { value: new Vector4(...UV_WEIGHTS[map!.uv]) };
    if (map!.uvAnimation) uniforms[`surface_shift_${key}`] = uvShiftUniform(map!.uvAnimation);
  }
  return uniforms;
}

/** The sampler uniforms of a surface's maps (`surfaceUniforms`), by uniform name: the textures its lookups fade in. */
export function surfaceSamplers(config: SurfaceConfig, uniforms: Readonly<Record<string, IUniform>>): Record<string, IUniform> {
  return Object.fromEntries(surfaceMapKeys(config).map(key => [`surface_${key}`, uniforms[`surface_${key}`]]));
}
