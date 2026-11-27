import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGFormat, UnsignedByteType, type IUniform, type Texture } from 'three';
import type { SceneryShading } from '../../../../../../shared/types/scenes/scenery.js';
import type { ShaderPart } from '../../shaders/composer.js';
import { setScene } from '../../shaders/sceneBlock.js';
import type { SurfaceKind } from './surfaceConfig.js';

/**
 * Scenery reflections as the package's `shading.sceneryReflection` gives them (the pipeline's docs/SCENE_PACKAGE.md "Shading"): the
 * venue's convolved cube read along the reflected view at the explicit level `lodScale` × roughness (no sharp cube), times
 * lerp(specular level · (bias + F0 · scale), lerp(albedo, 1, bias), metallic), with (scale, bias) from the package's split-sum table
 * at (N·V, roughness), times the family's own specular occlusion. Glass and clear coat read the cube their own way.
 */

/** The surface families that reflect by this rule. */
export const REFLECTING_KINDS: ReadonlySet<SurfaceKind> = new Set(['terrain', 'road', 'kerb', 'vegetation', 'standard', 'standardBlend', 'flag', 'roadDecal', 'water', 'tyre']);

/**
 * The textures every scenery program shares, set once the venue's cube is convolved (`setSceneryReflection`): the cube with whether it
 * is ready (a car's surface reads its own probe's in their place, car/carReflection.ts) and the split-sum table. The package's level
 * scale and dielectric F0 are the scene block's (`surface_reflectionLodScale`, `surface_dielectricF0`).
 */
export const sceneryReflectionUniforms = {
  surface_reflection: { value: null } as IUniform<Texture | null>,
  surface_reflectionReady: { value: 0 } as IUniform<number>,
  surface_integration: { value: null } as IUniform<Texture | null>,
};

/** The package's split-sum table as a two-channel 8-bit texture: scale in red, bias in green, N·V along u, roughness along v. */
export function integrationTexture(map: SceneryShading['integrationMap']): DataTexture {
  const data = new Uint8Array(map.width * map.height * 2);
  for (let i = 0; i < map.width * map.height; i++) { data[i * 2] = map.scale[i]; data[i * 2 + 1] = map.bias[i]; }
  const texture = new DataTexture(data, map.width, map.height, RGFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter; texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

/** Points the scenery at the venue's convolved cube (null: three's environment stands in) and the package's reflection values. */
export function setSceneryReflection(shading: SceneryShading, cube: Texture | null, integration: Texture): void {
  const u = sceneryReflectionUniforms;
  u.surface_reflection.value = cube; u.surface_reflectionReady.value = cube ? 1 : 0; u.surface_integration.value = integration;
  setScene('surface_reflectionLodScale', shading.sceneryReflection.lodScale); setScene('surface_dielectricF0', shading.sceneryReflection.dielectricF0);
}

/**
 * The uniforms' declarations and the indirect specular function; `main` fills the three surface globals (`SCENERY_REFLECTION_INPUTS`).
 * A car's surface (car/carReflection.ts) adds `declarations` after the uniforms and corrects the cube read by `afterRead`.
 */
function reflectionFunction(declarations = '', afterRead = ''): string {
  return `
  uniform samplerCube surface_reflection; uniform sampler2D surface_integration;
  uniform float surface_reflectionReady;${declarations}
  float surfaceReflectionRoughness = 1.0, surfaceReflectionSpecular = 1.0; vec3 surfaceReflectionAlbedo = vec3(0.0);
  #ifdef COCKPIT_OCCLUSION
    float surfaceReflectionOcclusion = 1.0; // Set in \`main\` by a car material inside the cockpit (car/cockpitOcclusion.ts).
  #endif
  void surfaceIndirectSpecular(const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition,
    const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
    inout ReflectedLight reflectedLight) {
    // The ambient diffuse keeps three's share of the environment light.
    vec3 single = vec3(0.0), multi = vec3(0.0);
    computeMultiscattering(material.dfg, material.specularColor, material.specularF90, single, multi);
    reflectedLight.indirectDiffuse += material.diffuseContribution * (1.0 - (single + multi)) * irradiance * RECIPROCAL_PI;
    float roughness = surfaceReflectionRoughness;
    vec2 split = texture2D(surface_integration, vec2(saturate(dot(geometryNormal, geometryViewDir)), roughness)).rg;
    vec3 r = transformDirectionByInverseViewMatrix(reflect(-geometryViewDir, geometryNormal), viewMatrix);
    vec3 light = surface_reflectionReady > 0.5 ? textureLod(surface_reflection, r, surface_reflectionLodScale * roughness).rgb : radiance;${afterRead}
    #ifdef COCKPIT_OCCLUSION
      light *= cockpitReflectionScale(r, surfaceReflectionOcclusion);
    #endif
    vec3 reflectance = mix(vec3(surfaceReflectionSpecular * (split.y + surface_dielectricF0 * split.x)), mix(surfaceReflectionAlbedo, vec3(1.0), split.y), material.metalness);
    reflectedLight.indirectSpecular += light * reflectance;
  }
`;
}

/** Fills the reflection's surface globals in `main`, after the family has set its roughness, specular level and albedo. */
export const SCENERY_REFLECTION_INPUTS = 'surfaceReflectionRoughness=clamp(surfaceRoughness,0.0,1.0); surfaceReflectionSpecular=surfaceSpecular; surfaceReflectionAlbedo=diffuseColor.rgb;';

/**
 * A reflection by this rule in a lit composed program (litTemplate.ts), under `name` on `uniforms` (`sceneryReflectionUniforms`'
 * names): its inputs filled once the family's material is set up (after the family's own lines there), and its function called in
 * place of three's indirect specular. `car` adds a car surface's declarations and its correction of the cube read
 * (car/carReflection.ts).
 */
export function reflectionPart(name: string, uniforms: Record<keyof typeof sceneryReflectionUniforms, IUniform> & Record<string, IUniform>,
  car?: {declarations: string; afterRead: string}): ShaderPart {
  return {
    name,
    slots: {
      fragmentPars: {at: 30, glsl: reflectionFunction(car?.declarations, car?.afterRead)},
      fragmentMaterial: {at: 50, glsl: SCENERY_REFLECTION_INPUTS},
      fragmentIndirectSpecular: {at: 0, glsl: '  surfaceIndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'},
    },
    uniforms: () => uniforms,
  };
}

/** The scenery's reflection of the venue's cube (`reflectionPart` on the shared uniforms). */
export const sceneryReflectionPart: ShaderPart = reflectionPart('sceneryReflection', sceneryReflectionUniforms);