/**
 * The cars' headlight beams (the body's GEN spots, `CarLights.spots`), per pixel in every program that takes the track lights
 * (trackLightProgram.ts). The game lists at most 20 spots per object by a rule not traced; the scene-wide 20 headlights nearest the
 * camera stand in for it (ours: within 6 % of the game's scenery light on the measured night frames). The tail spot is left out: the
 * game almost never lists it. A car's beams follow its replay headlight bit, by day too, as the game's do; they add nothing while
 * the venue is captured (`sceneEmission` 0), as the game's ambient probe takes no lamps.
 */
import { Vector3, Vector4, type Matrix4 } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { sceneEmission } from '../scene/dayLight.js';

/** The beams drawn at once: the nearest the camera. */
export const CAR_SPOTS = 20;
/** A spot this long reaches far enough to be a headlight (GEN: headlights 240 or 400 m, tail lights 2.5–4.8 m). */
export const HEADLIGHT_MIN_RANGE_M = 50;

/** A car whose headlights are on: its lights and its native car frame in the scene (the body envelope's world matrix). */
export interface SpotCar { lights: CarLights; frame: Matrix4 }

const slots = Array.from({length: 4 * CAR_SPOTS}, () => new Vector4());
export const carSpotUniforms = {
  carSpot_scale: {get value() { return GAME_LIGHT_UNIT * sceneEmission.value; }},
  /** Per spot: position and range; direction and cos(outer / 2); attenuation and cos(inner / 2); colour and falloff. */
  carSpot_spots: {value: slots},
  carSpot_count: {value: 0},
};

interface Beam { distance: number; position: Vector3; direction: Vector3; spot: CarLights['spots'][number] }

export interface CarSpots {
  /** Places the beams of `cars` and keeps the `CAR_SPOTS` nearest `eye` (scene coordinates). */
  update(cars: readonly SpotCar[], eye: Vector3): void;
  dispose(): void;
}

export function createCarSpots(): CarSpots {
  const pool: Beam[] = [], cosHalf = (degrees: number) => Math.cos(degrees * Math.PI / 360);
  return {
    update(cars, eye) {
      let count = 0;
      for (const {lights, frame} of cars) {
        for (const spot of lights.spots) {
          if (spot.rangeM <= HEADLIGHT_MIN_RANGE_M) continue;
          const beam = pool[count] ??= {distance: 0, position: new Vector3(), direction: new Vector3(), spot};
          beam.spot = spot;
          beam.position.set(...spot.position).applyMatrix4(frame);
          beam.direction.set(...spot.direction).transformDirection(frame);
          beam.distance = beam.position.distanceTo(eye);
          count++;
        }
      }
      const nearest = pool.slice(0, count).sort((a, b) => a.distance - b.distance).slice(0, CAR_SPOTS);
      nearest.forEach(({position, direction, spot}, i) => {
        slots[4 * i].set(position.x, position.y, position.z, spot.rangeM);
        slots[4 * i + 1].set(direction.x, direction.y, direction.z, cosHalf(spot.outerConeDeg));
        slots[4 * i + 2].set(spot.attenuation[0], spot.attenuation[1], spot.attenuation[2], cosHalf(spot.innerConeDeg));
        slots[4 * i + 3].set(spot.colour[0], spot.colour[1], spot.colour[2], spot.falloff);
      });
      carSpotUniforms.carSpot_count.value = nearest.length;
    },
    dispose() { carSpotUniforms.carSpot_count.value = 0; },
  };
}

/** The fragment's declarations: the spot list and the game's spot term at a world point and normal. */
export const CAR_SPOT_DECLARATIONS = `uniform vec4 carSpot_spots[${4 * CAR_SPOTS}];
uniform float carSpot_count;
uniform float carSpot_scale;
vec3 carSpotLight(vec3 point, vec3 normal) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${CAR_SPOTS}; i++) {
    if (float(i) >= carSpot_count) break;
    vec4 dirOuter = carSpot_spots[4 * i + 1];
    float facing = dot(-dirOuter.xyz, normal);
    if (facing <= -0.05) continue;
    vec4 posRange = carSpot_spots[4 * i];
    vec3 fromLight = point - posRange.xyz;
    float d = length(fromLight);
    if (d <= 0.0 || d >= posRange.w) continue;
    float rho = dot(dirOuter.xyz, fromLight / d);
    if (rho < dirOuter.w) continue;
    vec4 attenInner = carSpot_spots[4 * i + 2];
    vec4 rgbFalloff = carSpot_spots[4 * i + 3];
    float coeff = rho < attenInner.w ? pow(clamp((rho - dirOuter.w) / (attenInner.w - dirOuter.w), 0.0, 1.0), rgbFalloff.w) : 1.0;
    sum += rgbFalloff.rgb * clamp(coeff / (attenInner.x + d * (attenInner.y + d * attenInner.z)), 0.0, 1.0)
      * (1.0 - d / posRange.w) * smoothstep(-0.05, 0.2, facing);
  }
  return sum * carSpot_scale;
}`;

/** The beams at the fragment's world point and normal (`lampPoint`, `lampNormal` where the lamp light is added). */
export const CAR_SPOT_TERM = 'carSpotLight(lampPoint,lampNormal)';
