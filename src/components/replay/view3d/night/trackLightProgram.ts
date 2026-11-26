/**
 * The track lights in the surface programs (trackLights.ts holds the game's per-vertex term). The scenery's vertices carry their sums,
 * worked out once as each chunk loads; a car moves, so its vertices sum the lights nearest the camera (`NEAR_TRACK_LIGHTS`, picked on
 * the CPU each frame: ours, the game lists the lights per draw). The fragment adds the sum to the diffuse before the ambient occlusion,
 * albedo over pi times GAME_LIGHT_UNIT as a screen's strength is (shaderParts.ts). One uniform, shared by every program, switches them:
 * off by day and while the venue is captured (dayLight.ts `sceneEmission`), as the game's ambient probe takes no lamps.
 */
import { Vector4, type Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { sceneEmission } from '../scene/dayLight.js';
import { BELOW_STRETCH, TRACK_LIGHT_ATTRIBUTE, TRACK_LIGHT_DECODE_GLSL, type TrackLight } from './trackLights.js';
import { CAR_SPOT_DECLARATIONS, CAR_SPOT_TERM, carSpotUniforms } from './carSpots.js';

/** The lights a car's vertices sum: the nearest the camera (ours; the game's per-draw list holds 20). */
export const NEAR_TRACK_LIGHTS = 32;

let lightsOn = false;
const near = Array.from({length: 2 * NEAR_TRACK_LIGHTS}, () => new Vector4());
export const trackLightUniforms = {
  trackLight_scale: {get value() { return lightsOn ? GAME_LIGHT_UNIT * sceneEmission.value : 0; }},
  /** Per near light: position and range, then colour. */
  trackLight_near: {value: near},
  trackLight_nearCount: {value: 0},
};

/** Switches the track lights (the night state's `lightsOn`). */
export function switchTrackLights(on: boolean): void { lightsOn = on; }

export interface NearTrackLights {
  /** Picks the lights nearest `eye` (scene coordinates) for the cars' programs, while the lights are on. */
  update(eye: Vector3): void;
  dispose(): void;
}

/** The layout's lights in scene coordinates, for the cars. */
export function createNearTrackLights(lights: readonly TrackLight[]): NearTrackLights {
  const order = lights.map((_, index) => index), reach = new Float64Array(lights.length);
  return {
    update(eye) {
      if (!lightsOn) return;
      lights.forEach(({position: [x, y, z], rangeM}, index) => { reach[index] = Math.hypot(x - eye.x, y - eye.y, z - eye.z) - rangeM; });
      order.sort((a, b) => reach[a] - reach[b]);
      const count = Math.min(NEAR_TRACK_LIGHTS, order.length);
      for (let i = 0; i < count; i++) {
        const {position, rangeM, colour} = lights[order[i]];
        near[2 * i].set(position[0], position[1], position[2], rangeM); near[2 * i + 1].set(colour[0], colour[1], colour[2], 0);
      }
      trackLightUniforms.trackLight_nearCount.value = count;
    },
    dispose() { trackLightUniforms.trackLight_nearCount.value = 0; },
  };
}

/** The fragment's share, before the occlusion: the lit diffuse of the vertices' track light and the pixel's headlight beams (carSpots.ts). */
export const TRACK_LIGHT_FRAGMENT = `{vec3 lampPoint=(vec4(-vViewPosition,0.0)*viewMatrix).xyz+cameraPosition;vec3 lampNormal=inverseTransformDirection(normal,viewMatrix);
reflectedLight.indirectDiffuse+=(vTrackLight+${CAR_SPOT_TERM})*BRDF_Lambert(material.diffuseColor);}`;

const NEAR_MAIN = `vTrackLight = vec3(0.0);
  if (trackLight_scale > 0.0) {
    vec4 trackLightPoint = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      trackLightPoint = batchingMatrix * trackLightPoint;
    #endif
    #ifdef USE_INSTANCING
      trackLightPoint = instanceMatrix * trackLightPoint;
    #endif
    trackLightPoint = modelMatrix * trackLightPoint;
    vec3 trackLightNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
    for (int i = 0; i < ${NEAR_TRACK_LIGHTS}; i++) {
      if (float(i) >= trackLight_nearCount) break;
      vec4 light = trackLight_near[2 * i];
      vec3 d = light.xyz - trackLightPoint.xyz;
      if (d.y < 0.0) d.y *= ${BELOW_STRETCH.toFixed(1)};
      float len = length(d);
      if (len > 0.0 && len < light.w) vTrackLight += trackLight_near[2 * i + 1].rgb * max(0.0, dot(trackLightNormal, d) / len) * (1.0 - len / light.w);
    }
    vTrackLight *= trackLight_scale;
  }
`;

/**
 * Adds the track lights to a program: `baked` reads the scenery's per-vertex sums (a geometry without them reads none), `near` sums
 * the lights nearest the camera (cars). Before any other patch replaces the occlusion include.
 */
export function patchTrackLights(shader: WebGLProgramParametersWithUniforms, source: 'baked' | 'near'): void {
  Object.assign(shader.uniforms, trackLightUniforms);
  const declarations = source === 'baked' ? `attribute vec4 ${TRACK_LIGHT_ATTRIBUTE};`
    : `uniform vec4 trackLight_near[${2 * NEAR_TRACK_LIGHTS}];\nuniform float trackLight_nearCount;`;
  const main = source === 'baked' ? `vTrackLight = ${TRACK_LIGHT_DECODE_GLSL(TRACK_LIGHT_ATTRIBUTE)} * trackLight_scale;\n` : NEAR_MAIN;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${declarations}\nuniform float trackLight_scale;\nvarying vec3 vTrackLight;`)
    .replace('#include <worldpos_vertex>', `${main}#include <worldpos_vertex>`);
  Object.assign(shader.uniforms, carSpotUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vTrackLight;\n${CAR_SPOT_DECLARATIONS}`)
    .replace('#include <aomap_fragment>', `${TRACK_LIGHT_FRAGMENT}\n#include <aomap_fragment>`);
}
