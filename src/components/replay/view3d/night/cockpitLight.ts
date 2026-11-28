/**
 * The game's cockpit rule for a car's cabin materials (`flags.cockpitMode`, docs/PACKAGE_FORMAT.md of the pipeline, car lights): the
 * track lights and the headlight beams are dropped (`on`) or scaled by the emissive map's alpha (`emissiveAlpha`), and at night the
 * material's own cockpit light (`parameters.cockpitLight`, the car's model frame) joins the diffuse light:
 * `colour · N·L · (1 − d / range)² · intensity`. Glass drops the track lights there too and has no cockpit light; glass and the
 * windscreens never take the beams, and the screens (dashboard, external monitor) take neither. The light sits in the frame of the car whose cabin the cameras ride in (`setCockpitFrame`): its
 * reach (at most 1.3 m) keeps it inside that car, so another car of the body sharing the material stays dark inside.
 */
import { Vector4, type IUniform, type Matrix4 } from 'three';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { SCENE_BLOCK, sceneBlock, setScene } from '../shaders/sceneBlock.js';
import { list, value, type ShaderContext } from '../scenery/materials/shaderContext.js';
import type { SurfaceConfig } from '../scenery/materials/surfaceConfig.js';

const GLASS_KINDS = new Set<SurfaceConfig['kind']>(['glass', 'windscreen', 'windscreenInside']);
/** The screens: their light is their own glow alone (the game's screen shaders take neither the track lights nor the beams). */
const SCREEN_KINDS = new Set<SurfaceConfig['kind']>(['dashboard', 'externalMonitor']);

/** GLSL factors on a surface's track lights and beams, and its cockpit light term (null for none). */
export interface LampShares { omni: string; spot: string; cockpit: string | null }
export const ALL_LAMPS: LampShares = {omni: '1.0', spot: '1.0', cockpit: null};

/**
 * The cabin car's native car frame in the scene, or null when no car's cabin is drawn: the scene block's `cockpitLight_frame`, and its
 * `cockpitLight_scale` the light unit while a cabin car is placed, else 0. The light is on at night only (the day share under 1, as
 * the game's `isNightTime`) and not while the venue is captured (`surface_emission` 0), both read in the program.
 */
export function setCockpitFrame(frame: Matrix4 | null): void {
  setScene('cockpitLight_scale', frame ? GAME_LIGHT_UNIT : 0);
  frame?.toArray(sceneBlock, SCENE_BLOCK.offsets.cockpitLight_frame);
}

/** The cockpit light a surface takes (its cockpit mode set, not glass, a light of some intensity), or null. */
function cockpitLightOf(config: SurfaceConfig): {position: readonly number[]; range: number; colour: number[]} | null {
  const light = config.parameters.cockpitLight, intensity = light ? value(light, 'intensity') : 0;
  if (!config.flags.cockpitMode || GLASS_KINDS.has(config.kind) || !light || intensity <= 0) return null;
  return {position: list(light, 'position'), range: value(light, 'range'), colour: list(light, 'colour').map(c => c * intensity)};
}

/**
 * A surface's shares of the lamp light by its cockpit mode and kind. A core surface (coreSurface.ts: a standard one whose share is
 * not its emissive map's alpha) reads its share and its cockpit light from uniforms (`coreLampUniforms`):
 * a share of 0 adds nothing, as a share left out, and a light of range 0 none, as no light.
 */
export function lampShares(config: SurfaceConfig, {sample, number, vec}: ShaderContext, core = false): LampShares {
  const mode = config.flags.cockpitMode, glass = GLASS_KINDS.has(config.kind);
  if (mode !== undefined && mode !== 'on' && mode !== 'emissiveAlpha') throw Error(`Unsupported cockpit mode ${mode}: ${config.name ?? '?'}`);
  if (core) return {omni: 'surface_lampShare', spot: 'surface_lampShare', cockpit: 'cockpitLightTerm(surface_cockpitLight[0].xyz,surface_cockpitLight[0].w,surface_cockpitLight[1].xyz,lampPoint,lampNormal)'};
  const omni = mode === 'on' || SCREEN_KINDS.has(config.kind) ? '0.0' : mode === 'emissiveAlpha' ? `${sample('emissive')}.a` : '1.0';
  const light = cockpitLightOf(config);
  const cockpit = light ? `cockpitLightTerm(${vec(light.position)},${number(light.range)},${vec(light.colour)},lampPoint,lampNormal)` : null;
  return {omni, spot: glass ? '0.0' : omni, cockpit};
}

/** A core surface's lamp uniforms, declared by `CORE_LAMP_DECLARATIONS`: its share (0 in a cockpit-lit cabin) and its cockpit light. */
export function coreLampUniforms(config: SurfaceConfig): Record<string, IUniform> {
  const light = cockpitLightOf(config);
  return {
    surface_lampShare: {value: config.flags.cockpitMode === 'on' ? 0 : 1},
    surface_cockpitLight: {value: light ? [new Vector4(...light.position, light.range), new Vector4(...light.colour, 0)] : [new Vector4(), new Vector4()]},
  };
}

export const CORE_LAMP_DECLARATIONS = 'uniform float surface_lampShare;\nuniform vec4 surface_cockpitLight[2];';

/** The fragment's cockpit light at a world point and normal (`lampPoint`, `lampNormal` where the lamp light is added). */
export const COCKPIT_LIGHT_DECLARATIONS = `vec3 cockpitLightTerm(vec3 local, float range, vec3 colour, vec3 point, vec3 normal) {
  float scale = lit_dayLight < 1.0 ? cockpitLight_scale * surface_emission : 0.0;
  vec3 toLight = (cockpitLight_frame * vec4(local, 1.0)).xyz - point;
  float d = length(toLight);
  if (scale <= 0.0 || d <= 0.0 || d >= range) return vec3(0.0);
  float reach = 1.0 - d / range;
  return colour * max(0.0, dot(normal, toLight / d)) * reach * reach * scale;
}`;
