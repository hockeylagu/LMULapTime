/**
 * The game's cockpit rule for a car's cabin materials (`flags.cockpitMode`, docs/PACKAGE_FORMAT.md of the pipeline, car lights): the
 * track lights and the headlight beams are dropped (`on`) or scaled by the emissive map's alpha (`emissiveAlpha`), and at night the
 * material's own cockpit light (`parameters.cockpitLight`, the car's model frame) joins the diffuse light:
 * `colour · N·L · (1 − d / range)² · intensity`. Glass drops the track lights there too and has no cockpit light; glass and the
 * windscreens never take the beams, and the screens (dashboard, external monitor) take neither. The light sits in the frame of the car whose cabin the cameras ride in (`setCockpitFrame`): its
 * reach (at most 1.3 m) keeps it inside that car, so another car of the body sharing the material stays dark inside.
 */
import { Matrix4 } from 'three';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { sceneDayLight, sceneEmission } from '../scene/dayLight.js';
import { list, value, type ShaderContext } from '../scenery/materials/shaderContext.js';
import type { SurfaceConfig } from '../scenery/materials/surfaceConfig.js';

const GLASS_KINDS = new Set<SurfaceConfig['kind']>(['glass', 'windscreen', 'windscreenInside']);
/** The screens: their light is their own glow alone (the game's screen shaders take neither the track lights nor the beams). */
const SCREEN_KINDS = new Set<SurfaceConfig['kind']>(['dashboard', 'externalMonitor']);

/** GLSL factors on a surface's track lights and beams, and its cockpit light term (null for none). */
export interface LampShares { omni: string; spot: string; cockpit: string | null }
export const ALL_LAMPS: LampShares = {omni: '1.0', spot: '1.0', cockpit: null};

let framed = false;
export const cockpitLightUniforms = {
  cockpitLight_frame: {value: new Matrix4()},
  /** On at night (the day share under 1, as the game's `isNightTime`), while a cabin car is placed, and not while the venue is captured. */
  cockpitLight_scale: {get value() { return framed && sceneDayLight.value < 1 ? GAME_LIGHT_UNIT * sceneEmission.value : 0; }},
};

/** The cabin car's native car frame in the scene, or null when no car's cabin is drawn. */
export function setCockpitFrame(frame: Matrix4 | null): void {
  framed = frame !== null;
  if (frame) cockpitLightUniforms.cockpitLight_frame.value.copy(frame);
}

/** A surface's shares of the lamp light by its cockpit mode and kind. */
export function lampShares(config: SurfaceConfig, {sample, number, vec}: ShaderContext): LampShares {
  const mode = config.flags.cockpitMode, glass = GLASS_KINDS.has(config.kind);
  if (mode !== undefined && mode !== 'on' && mode !== 'emissiveAlpha') throw Error(`Unsupported cockpit mode ${mode}: ${config.name ?? '?'}`);
  const omni = mode === 'on' || SCREEN_KINDS.has(config.kind) ? '0.0' : mode === 'emissiveAlpha' ? `${sample('emissive')}.a` : '1.0';
  const light = config.parameters.cockpitLight, intensity = light ? value(light, 'intensity') : 0;
  const cockpit = mode && !glass && light && intensity > 0
    ? `cockpitLightTerm(${vec(list(light, 'position'))},${number(value(light, 'range'))},${vec(list(light, 'colour').map(c => c * intensity))},lampPoint,lampNormal)` : null;
  return {omni, spot: glass ? '0.0' : omni, cockpit};
}

/** The fragment's cockpit light at a world point and normal (`lampPoint`, `lampNormal` where the lamp light is added). */
export const COCKPIT_LIGHT_DECLARATIONS = `uniform mat4 cockpitLight_frame;
uniform float cockpitLight_scale;
vec3 cockpitLightTerm(vec3 local, float range, vec3 colour, vec3 point, vec3 normal) {
  vec3 toLight = (cockpitLight_frame * vec4(local, 1.0)).xyz - point;
  float d = length(toLight);
  if (cockpitLight_scale <= 0.0 || d <= 0.0 || d >= range) return vec3(0.0);
  float reach = 1.0 - d / range;
  return colour * max(0.0, dot(normal, toLight / d)) * reach * reach * cockpitLight_scale;
}`;
