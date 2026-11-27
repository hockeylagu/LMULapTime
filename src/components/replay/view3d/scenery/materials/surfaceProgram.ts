import { Color, Material, type IUniform, type MeshStandardMaterial, type ShaderMaterial, type Texture } from 'three';
import { hazePart } from '../../atmosphere/haze.js';
import { trackLightPart } from '../../night/trackLightProgram.js';
import { cascadeShadowPart } from '../../shadows/cascadeSampling.js';
import { ambientLookupPart } from '../../shaders/ambientLookup.js';
import { composedMaterial, cutOutOf, type ShaderDefines, type ShaderPart } from '../../shaders/composer.js';
import { litTemplate } from '../../shaders/litTemplate.js';
import { isLampKind, lampSizePart } from '../lampSize.js';
import { realRoadPart } from '../realRoad.js';
import { textureFocusPart } from '../textureFocus.js';
import { billboardPart } from './billboardCard.js';
import { readsRealRoad } from './roadSurface.js';
import { REFLECTING_KINDS, sceneryReflectionPart } from './sceneryReflection.js';
import { list, value } from './shaderContext.js';
import {
  luminousFacingPower, shaderParts, SURFACE_ALPHA_TEST, SURFACE_FACING, SURFACE_METALNESS, SURFACE_ROUGHNESS, SURFACE_SPECULAR, surfaceEmission,
  surfaceOcclusion, surfaceSamplers, surfaceUniforms, surfaceVertexDeclarations, surfaceVertexMain, type ShaderParts,
} from './shaderParts.js';
import type { SurfaceConfig } from './surfaceConfig.js';
import { leafTranslucencyPart, readsLeafTranslucency } from './vegetationSurface.js';

/** The maps a surface is cut out by, in order: the first it has is its albedo's alpha (the sun shadow pass cuts by it too). */
const CUT_OUT_MAPS = ['layerA', 'albedo', 'on'] as const;

/**
 * Clear coat's share of the outgoing light, as three's physical program mixes it, with the coat's lacquer absorption on the light
 * under it (`absorption`).
 */
const clearcoatLight = (absorption: string) => `#ifdef USE_CLEARCOAT
  { float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
    vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
    outgoingLight = outgoingLight * (${absorption || '1.0'}) * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat; }
#endif`;

/** The kinds on three's physical model: its index of refraction and specular level, and clear coat's coat (`surfaceDefines`). */
const physical = (config: SurfaceConfig) => config.kind === 'clearcoat' || config.kind === 'glass';

/**
 * The defines of a surface's program, as three's physical program defines them for the physical kinds: `IOR` and `USE_SPECULAR`, and
 * `USE_CLEARCOAT` for clear coat (always: a coat of strength 0 adds nothing to the light, as three's program without it).
 */
export function surfaceDefines(config: SurfaceConfig): ShaderDefines {
  if (!physical(config)) return {};
  return {IOR: '', USE_SPECULAR: '', ...(config.kind === 'clearcoat' ? {USE_CLEARCOAT: ''} : {})};
}

/**
 * The material's own values the family's GLSL reads under three's names: its colour (the `adjust` tint squared), its emission
 * (`emissive`: the glTF material's colour times intensity, none on a car), roughness and metalness (`adjust`), and on the physical
 * model its index of refraction, specular level and colour (white), and clear coat's strength and roughness.
 */
export function surfaceValues(config: SurfaceConfig, emissive: Color): Record<string, IUniform> {
  const adjust = config.parameters.adjust, [r, g, b] = list(adjust, 'tint');
  const values: Record<string, IUniform> = {
    diffuse: {value: new Color().setRGB(r * r, g * g, b * b)},
    emissive: {value: emissive},
    roughness: {value: value(adjust, 'roughness')},
    metalness: {value: value(adjust, 'metalness')},
  };
  if (physical(config)) Object.assign(values, {ior: {value: config.kind === 'clearcoat' ? value(config.parameters.baseCoat, 'ior') : 1.5}, specularIntensity: {value: 1}, specularColor: {value: new Color(1, 1, 1)}});
  if (config.kind === 'clearcoat') {
    const coat = config.parameters.clearCoat;
    Object.assign(values, {clearcoat: {value: value(coat, 'strength')}, clearcoatRoughness: {value: value(coat, 'roughness')}});
  }
  return values;
}

/**
 * The family's own part: its vertex inputs and varyings, its albedo, alpha cut, normals, emission, material, occlusion and finish, in
 * the template's slots, on `uniforms` (the material's own). Without `vertexColour` the geometry has none and reads white. A ghost
 * starts from roughness 0.7 and no metal (`composedGhost`), where the family reads the material's.
 */
export function surfaceFamilyPart(config: SurfaceConfig, code: ShaderParts, uniforms: Record<string, IUniform>, vertexColour = true): ShaderPart {
  const declarations = [
    'uniform vec3 diffuse, emissive;', 'uniform float roughness, metalness;',
    ...(physical(config) ? ['uniform float ior, specularIntensity;', 'uniform vec3 specularColor;'] : []),
    ...(config.kind === 'clearcoat' ? ['uniform float clearcoat, clearcoatRoughness;'] : []),
  ];
  const light = [...(config.kind === 'clearcoat' ? [clearcoatLight(code.absorption)] : []), ...(code.finish ? [code.finish] : [])];
  const cutOut = CUT_OUT_MAPS.find(key => config.maps[key]);
  return {
    name: 'surface',
    slots: {
      vertexPars: {at: 10, glsl: surfaceVertexDeclarations(config, vertexColour)},
      vertexPosition: {at: 10, glsl: surfaceVertexMain(config)},
      ...(luminousFacingPower(config) ? {vertexProjected: {at: 0, glsl: SURFACE_FACING}} : {}),
      fragmentPars: {at: 10, glsl: `${declarations.join('\n')}\n${code.declarations}`},
      fragmentAlbedo: {at: 0, glsl: `diffuseColor.rgb *= diffuse;\n${code.albedo}`},
      fragmentColour: {at: 0, glsl: `${SURFACE_ALPHA_TEST}\n${SURFACE_ROUGHNESS}\n${SURFACE_METALNESS}`},
      fragmentNormal: {at: 0, glsl: `{ ${code.normals} }\n${code.coatNormals}`},
      fragmentEmission: {at: 0, glsl: `totalEmissiveRadiance = emissive;\n${surfaceEmission(code)}`},
      fragmentMaterial: {at: 0, glsl: `${code.physical}\n${SURFACE_SPECULAR}`},
      fragmentOcclusion: {at: 10, glsl: surfaceOcclusion(config, code)},
      ...(light.length ? {fragmentLight: {at: 0, glsl: light.join('\n')}} : {}),
    },
    uniforms: () => uniforms,
    ownTextures: Object.keys(config.maps).map(key => `surface_${key}`),
    // Cut out where the family reads the map: on its UV set (or the world XZ), times its scale, plus its animation's shift.
    ...(cutOut ? {cutOut: (own: Readonly<Record<string, IUniform>>) => cutOutOf(own[`surface_${cutOut}`], own[`surface_uv_${cutOut}`],
      {scale: own[`surface_scale_${cutOut}`], ...(config.maps[cutOut]?.uvAnimation ? {shift: own[`surface_shift_${cutOut}`]} : {})})} : {}),
    ghost: {roughness: 0.7, metalness: 0},
  };
}

/**
 * The parts of a scenery surface's program: its texture fade-in, the sun's cascade shadow (terrain also by its baked shadow), the
 * halved-height ambient lookup, the track lights' baked sums, the family, then by kind the scenery reflection, the road's rubber
 * state, a lamp's size, a card's turn and a leaf's translucency, and the haze. `uniforms` are the material's own.
 */
export function surfaceProgramParts(config: SurfaceConfig, uniforms: Record<string, IUniform>): ShaderPart[] {
  const code = shaderParts(config, {uniforms: true});
  return [
    textureFocusPart(surfaceSamplers(config, uniforms)),
    cascadeShadowPart(config.normalShadowInfluence, config.kind === 'terrain' ? shadow => `min(${shadow}, surfaceBakedShadow)` : undefined),
    ambientLookupPart,
    trackLightPart('baked', code.lamps),
    surfaceFamilyPart(config, code, uniforms),
    ...(REFLECTING_KINDS.has(config.kind) ? [sceneryReflectionPart] : []),
    ...(readsRealRoad(config) ? [realRoadPart] : []),
    ...(isLampKind(config.kind) ? [lampSizePart] : []),
    ...(config.billboard ? [billboardPart(config.kind === 'vegetation')] : []),
    ...(readsLeafTranslucency(config) ? [leafTranslucencyPart(config)] : []),
    hazePart,
  ];
}

/**
 * A scenery surface's composed material (litTemplate.ts): the GLB material's own state (`original`: side, blending, transparency,
 * alpha test, vertex colours, flat shading), the family's program and the loaded maps (`textures`, one per map key).
 */
export function surfaceMaterial(original: MeshStandardMaterial, config: SurfaceConfig, textures: Readonly<Record<string, Texture>>): ShaderMaterial {
  const uniforms = {...surfaceUniforms(config, textures), ...surfaceValues(config, original.emissive.clone().multiplyScalar(original.emissiveIntensity))};
  const material = composedMaterial(litTemplate, surfaceProgramParts(config, uniforms), {}, surfaceDefines(config));
  Material.prototype.copy.call(material, original);
  // A program parameter three reads off any material; a shader material has no field for it.
  if (original.flatShading) Object.assign(material, {flatShading: true});
  return material;
}
