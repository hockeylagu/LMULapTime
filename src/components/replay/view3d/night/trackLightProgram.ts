/**
 * The track lights in the surface programs. The game adds them per vertex, diffuse only, under the ambient occlusion:
 * N·L · colour · saturate(1 − d / range), a light below the vertex at its vertical distance stretched. The scenery's vertices carry
 * their sums, baked by the package (`TRACK_LIGHT_ATTRIBUTE`, RGBE); a car moves, so its vertices sum the lights nearest the camera (`NEAR_TRACK_LIGHTS`, picked on
 * the CPU each frame: ours, the game lists the lights per draw). The fragment adds the sum to the diffuse before the ambient occlusion,
 * albedo over pi times GAME_LIGHT_UNIT as a screen's strength is (shaderParts.ts). The scene block (sceneBlock.ts) switches them:
 * `trackLight_scale` is off by day, and the pass block's `surface_emission` while the venue is captured, as the game's ambient probe
 * takes no lamps.
 */
import type { Vector3 } from 'three';
import type { ShaderPart } from '../shaders/composer.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { NEAR_TRACK_LIGHTS, SCENE_BLOCK, sceneBlock, setScene } from '../shaders/sceneBlock.js';
import { TRACK_LIGHT_ATTRIBUTE as PACKAGE_TRACK_LIGHT_ATTRIBUTE, TRACK_LIGHT_BELOW_STRETCH, TRACK_LIGHT_EXPONENT_BIAS,
  type SceneryNightLight } from '../../../../../shared/packageContract/index.js';
import { CAR_SPOT_TERM, carSpotDeclarations } from './carSpots.js';
import { ALL_LAMPS, COCKPIT_LIGHT_DECLARATIONS, type LampShares } from './cockpitLight.js';

/** The scenery's per-vertex sums, as three's glTF loader names a custom attribute (lower case). */
export const TRACK_LIGHT_ATTRIBUTE = PACKAGE_TRACK_LIGHT_ATTRIBUTE.toLowerCase();
/** RGBE decoded: rgb × 2^(round(a × 255) − bias). */
const TRACK_LIGHT_DECODE = `(${TRACK_LIGHT_ATTRIBUTE}.rgb * exp2(floor(${TRACK_LIGHT_ATTRIBUTE}.a * 255.0 + 0.5) - ${TRACK_LIGHT_EXPONENT_BIAS.toFixed(1)}))`;

let lightsOn = false;

/** Switches the track lights (the night state's `lightsOn`): the scene block's `trackLight_scale`, the light unit or 0. */
export function switchTrackLights(on: boolean): void {
  lightsOn = on;
  setScene('trackLight_scale', on ? GAME_LIGHT_UNIT : 0);
}

export interface NearTrackLights {
  /** Picks the lights nearest `eye` (scene coordinates) for the cars' programs, while the lights are on. */
  update(eye: Vector3): void;
  dispose(): void;
}

/** The layout's lights in scene coordinates, for the cars. */
export function createNearTrackLights(lights: readonly SceneryNightLight[]): NearTrackLights {
  const order = lights.map((_, index) => index), reach = new Float64Array(lights.length);
  return {
    update(eye) {
      if (!lightsOn) return;
      lights.forEach(({position: [x, y, z], rangeM}, index) => { reach[index] = Math.hypot(x - eye.x, y - eye.y, z - eye.z) - rangeM; });
      order.sort((a, b) => reach[a] - reach[b]);
      const count = Math.min(NEAR_TRACK_LIGHTS, order.length);
      // Per near light, two vec4s of the scene block's `trackLight_near`: position and range, then colour.
      const at = SCENE_BLOCK.offsets.trackLight_near;
      for (let i = 0; i < count; i++) {
        const {position, rangeM, colour} = lights[order[i]];
        sceneBlock.set(position, at + 8 * i); sceneBlock[at + 8 * i + 3] = rangeM; sceneBlock.set(colour, at + 8 * i + 4); sceneBlock[at + 8 * i + 7] = 0;
      }
      setScene('trackLight_nearCount', count);
    },
    dispose() { setScene('trackLight_nearCount', 0); },
  };
}

/**
 * The fragment's share, before the occlusion: the lit diffuse of the vertices' track light, the pixel's headlight beams (carSpots.ts)
 * and a cabin's cockpit light, each by the surface's share (cockpitLight.ts). Lit by the diffuse share of the albedo (three's
 * `diffuseContribution`), so a metal takes none: its lamps show only in its reflection.
 */
export function trackLightFragment({omni, spot, cockpit}: LampShares): string {
  const share = (term: string, by: string) => by === '0.0' ? [] : [by === '1.0' ? term : `${term}*${by}`];
  const terms = [...share('vTrackLight', omni), ...share(CAR_SPOT_TERM, spot), ...(cockpit ? [cockpit] : [])];
  if (!terms.length) return '';
  return `{vec3 lampPoint=(vec4(-vViewPosition,0.0)*viewMatrix).xyz+cameraPosition;vec3 lampNormal=inverseTransformDirection(normal,viewMatrix);
reflectedLight.indirectDiffuse+=(${terms.join('+')})*BRDF_Lambert(material.diffuseContribution);}`;
}

const NEAR_MAIN = `vTrackLight = vec3(0.0);
  float trackLightScale = trackLight_scale * surface_emission;
  if (trackLightScale > 0.0) {
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
      if (d.y < 0.0) d.y *= ${TRACK_LIGHT_BELOW_STRETCH.toFixed(1)};
      float len = length(d);
      if (len > 0.0 && len < light.w) vTrackLight += trackLight_near[2 * i + 1].rgb * max(0.0, dot(trackLightNormal, d) / len) * (1.0 - len / light.w);
    }
    vTrackLight *= trackLightScale;
  }
`;

/** The vertex stage's declarations and sum for `source`, and the fragment's declarations (the scene-wide inputs are block members). */
function trackLightProgram(source: 'baked' | 'near', shares: LampShares) {
  return {
    vertexPars: `${source === 'baked' ? `attribute vec4 ${TRACK_LIGHT_ATTRIBUTE};\n` : ''}varying vec3 vTrackLight;`,
    vertexMain: source === 'baked' ? `vTrackLight = ${TRACK_LIGHT_DECODE} * trackLight_scale * surface_emission;\n` : NEAR_MAIN,
    fragmentPars: `varying vec3 vTrackLight;\n${carSpotDeclarations(source === 'near')}${shares.cockpit ? `\n${COCKPIT_LIGHT_DECLARATIONS}` : ''}`,
  };
}

/**
 * The track lights in a lit composed program (litTemplate.ts): `baked` reads the scenery's per-vertex sums, which every scenery
 * primitive carries (a geometry without them would decode WebGL's default attribute into NaN: the chunk loader refuses one,
 * scenery/chunkLoader.ts `prepareSceneryMesh`), `near` sums the lights nearest the camera (cars). The vertices' sums are passed once the position is final, the
 * fragment's share (`trackLightFragment`) added on the light before the occlusion, first there.
 */
export function trackLightPart(source: 'baked' | 'near', shares: LampShares = ALL_LAMPS): ShaderPart {
  const program = trackLightProgram(source, shares), fragment = trackLightFragment(shares);
  return {
    name: 'trackLights',
    slots: {
      vertexPars: {at: 20, glsl: program.vertexPars},
      vertexOutputs: {at: 20, glsl: program.vertexMain},
      fragmentPars: {at: 20, glsl: program.fragmentPars},
      ...(fragment ? {fragmentOcclusion: {at: 0, glsl: fragment}} : {}),
    },
  };
}
