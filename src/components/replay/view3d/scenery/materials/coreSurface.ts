import { DataTexture, Vector3, type IUniform, type Texture } from 'three';
import { CORE_LAMP_DECLARATIONS, coreLampUniforms } from '../../night/cockpitLight.js';
import { list, value } from './shaderContext.js';
import type { SurfaceConfig, SurfaceMap } from './surfaceConfig.js';

/**
 * The maps of the core standard surface, in the order of its `surface_hasMap` switches. A car's standard material whose maps are
 * among them draws through the one program of its flags, whichever of them it has: its program declares them (but those `leftOut`), a missing one bound to `CORE_DEFAULT_TEXTURE`, and each lookup reads the map only where the material has it, else the same fallback as its own
 * program would (`shaderParts` with `core`). Its emission and lamp shares are uniforms too. The cars of a race arrive with few
 * programs of their own to link and first draw (a GT3 body's 21 held a frame 230-330 ms, Barcelona race, 2026-11-27).
 */
export const CORE_MAPS = ['albedo', 'aoSpec', 'detail', 'emissive', 'metalRough', 'normal'] as const;

/** The core program's own uniforms: the map switches, the emission (`coreEmission`) and the lamp shares (`coreLampUniforms`). */
export const CORE_DECLARATIONS = `uniform float surface_hasMap[${CORE_MAPS.length}];
uniform vec3 surface_emissiveColour;
uniform float surface_emissiveStrength, surface_emissiveMask, surface_emissiveNight;
${CORE_LAMP_DECLARATIONS}`;

/** The flags whose code the core surface does not switch: a material with one keeps its own program. */
const OWN_PROGRAM_FLAGS = ['albedoBlend', 'metalnessBlend', 'roughnessBlend', 'normalBlend', 'detailNormal'] as const;
/** The flags that read the detail map, written only where the material has one (standardSurface.ts). */
const DETAIL_FLAGS = ['detailAlbedo', 'detailAo', 'detailSpecular', 'detailRoughness', 'detailMetalness'] as const;

/** What a missing core map is bound to: never read (its switch is off), never disposed (every core material shares it). */
export const CORE_DEFAULT_TEXTURE = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
CORE_DEFAULT_TEXTURE.name = 'core surface default';
CORE_DEFAULT_TEXTURE.needsUpdate = true;

const isCoreMap = (key: string): key is (typeof CORE_MAPS)[number] => (CORE_MAPS as readonly string[]).includes(key);

/**
 * Whether a standard surface draws exactly the same through the core program: its maps are core maps without animation, it has
 * no flag the core leaves to its own program, its roughness is not read from its albedo's alpha for want of a metal/rough map
 * (the filled one would stop it), and its lamp share is not its emissive map's alpha (the core's share is a uniform).
 */
export function drawsOnCore(config: SurfaceConfig): boolean {
  const {maps, flags} = config;
  if (config.kind !== 'standard' && config.kind !== 'standardBlend') return false;
  // Those without maps already share their program, and the core moved a cabin occluder's edge (BMW M4 GT3, Barcelona chase D8).
  if (Object.keys(config.maps).length === 0) return false;
  if (Object.entries(maps).some(([key, map]) => !map || !isCoreMap(key) || map.uvAnimation)) return false;
  if ((flags.blendMask ?? 'none') !== 'none' || OWN_PROGRAM_FLAGS.some(flag => flags[flag])) return false;
  if (maps.emissive && flags.cockpitMode === 'emissiveAlpha') return false;
  // With both an emissive and a detail map the core would stand in for a sixth map (`leftOut`): only one with every map draws on it.
  if (maps.emissive && maps.detail && CORE_MAPS.some(key => !maps[key])) return false;
  const maskedColour = flags.vertexColour === 'albedoMultiplyMasked' || flags.vertexColour === 'albedoOverlayMasked';
  return !(maps.albedo && !maps.metalRough && flags.roughnessFromAlbedoAlpha && !maskedColour);
}

/**
 * A core surface's emission uniforms, as its own program would bake them (standardSurface.ts): the squared colour and strength
 * (0 for a surface that does not glow), the mask's mode (1 the map's rgb, 2 its green, 0 none) and 1 where it glows at night only.
 */
function coreEmission({flags, parameters: p}: SurfaceConfig): Record<string, IUniform> {
  const glows = flags.emissive === 'always' || flags.emissive === 'night', mode = flags.emissiveMask ?? '';
  return {
    surface_emissiveColour: {value: glows ? new Vector3(...list(p.emissive, 'colour').slice(0, 3).map(x => x * x)) : new Vector3()},
    surface_emissiveStrength: {value: glows ? value(p.emissive, 'strength') : 0},
    surface_emissiveMask: {value: mode === 'rgb' || mode === 'rgba' ? 1 : mode === 'rg' || mode === 'map' ? 2 : 0},
    surface_emissiveNight: {value: flags.emissive === 'night' ? 1 : 0},
  };
}

/**
 * The core maps a material without them leaves out: five stood-in maps at most, as six would take a cabin part's program to 17
 * texture units batched (carBatching.ts). The emissive map is left out without one, the detail map with an emissive map: the few
 * that glow share a core program of their own.
 */
const leftOut = (maps: SurfaceConfig['maps']): string[] => maps.emissive ? (maps.detail ? [] : ['detail']) : ['emissive'];

/** A stand-in for a missing core map: read on the first UV set at scale 1 (its switch is off, so nothing it reads shows). */
const MISSING_MAP: SurfaceMap = {texture: '', uv: 'uv0', scale: [1, 1], srgb: false};

/**
 * A core surface (`drawsOnCore`) with every core map, the missing ones stood in for, its textures (`loaded` plus the default for
 * those), and its own uniforms (`CORE_DECLARATIONS`). Without a detail map its detail flags go: its own program reads them only
 * with one (most car materials carry `detailAlbedo` and no detail map), and the filled one would.
 */
export function coreSurface(config: SurfaceConfig, loaded: Readonly<Record<string, Texture>>): {config: SurfaceConfig; textures: Record<string, Texture>; switches: Record<string, IUniform>} {
  const maps: SurfaceConfig['maps'] = {}, textures: Record<string, Texture> = {};
  const skipped = leftOut(config.maps);
  for (const key of CORE_MAPS) {
    if (skipped.includes(key)) continue;
    maps[key] = config.maps[key] ?? MISSING_MAP;
    textures[key] = loaded[key] ?? CORE_DEFAULT_TEXTURE;
  }
  const flags = config.maps.detail ? config.flags : Object.fromEntries(Object.entries(config.flags).filter(([flag]) => !(DETAIL_FLAGS as readonly string[]).includes(flag)));
  const switches = {surface_hasMap: {value: CORE_MAPS.map(key => (config.maps[key] ? 1 : 0))}, ...coreEmission(config), ...coreLampUniforms(config)};
  return {config: {...config, maps, flags}, textures, switches};
}
