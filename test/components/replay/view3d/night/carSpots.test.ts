import { afterEach, expect, it } from 'vitest';
import { Matrix4, ShaderChunk, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import type { CarLights, CarSpotLight } from '../../../../../shared/packageContract/index.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { sceneEmission } from '../../../../../src/components/replay/view3d/scene/dayLight.js';
import { CAR_SPOTS, carSpotUniforms, createCarSpots } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { patchTrackLights } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';

afterEach(() => { carSpotUniforms.carSpot_count.value = 0; });

const spot = (name: CarSpotLight['name'], x: number, rangeM: number): CarSpotLight => ({
  name, position: [x, 0.5, -2], direction: [0, -0.15, -0.99], rangeM, attenuation: [1, 0.15, 0.0005], innerConeDeg: 10, outerConeDeg: 100, falloff: 10,
  colour: [6, 5.8, 5.6],
});
const lights: CarLights = {spots: [spot('headlightLeft', 0.7, 400), spot('headlightRight', -0.7, 400), spot('tail', 0, 3)], cockpit: null};

it('adds the beams to the diffuse in every program that takes the track lights', () => {
  const shader = {uniforms: {}, vertexShader: ShaderChunk.meshphysical_vert, fragmentShader: ShaderChunk.meshphysical_frag} as unknown as WebGLProgramParametersWithUniforms;
  patchTrackLights(shader, 'baked');
  expect(shader.fragmentShader).toContain(`uniform vec4 carSpot_spots[${4 * CAR_SPOTS}];`);
  expect(shader.fragmentShader).toMatch(/indirectDiffuse\+=\(vTrackLight\+carSpotLight\([^\n]*\n#include <aomap_fragment>/);
  expect(shader.uniforms.carSpot_spots).toBe(carSpotUniforms.carSpot_spots);
});

it("places each headlight through its car's frame, leaving the tail spot out", () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0);
  spots.update([{lights, frame}], new Vector3());
  const [position, direction, attenuation, colour] = carSpotUniforms.carSpot_spots.value;
  expect(carSpotUniforms.carSpot_count.value).toBe(2);
  // The right headlight (x −0.7) first: nearer the camera.
  [9.3, 0.5, -2, 400].forEach((value, i) => expect(position.getComponent(i)).toBeCloseTo(value));
  expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
  expect(direction.w).toBeCloseTo(Math.cos(50 * Math.PI / 180));
  expect(attenuation.toArray().slice(0, 3)).toEqual([1, 0.15, 0.0005]);
  expect(attenuation.w).toBeCloseTo(Math.cos(5 * Math.PI / 180));
  expect(colour.toArray()).toEqual([6, 5.8, 5.6, 10]);
  spots.dispose();
  expect(carSpotUniforms.carSpot_count.value).toBe(0);
});

it('keeps the beams nearest the camera', () => {
  const cars = Array.from({length: CAR_SPOTS}, (_, i) => ({lights, frame: new Matrix4().makeTranslation(100 - i * 5, 0, 0)}));
  createCarSpots().update(cars, new Vector3(0, 0.5, -2));
  expect(carSpotUniforms.carSpot_count.value).toBe(CAR_SPOTS);
  const xs = carSpotUniforms.carSpot_spots.value.filter((_, i) => i % 4 === 0).map(slot => slot.x);
  expect(xs[0]).toBeCloseTo(4.3);
  // Two beams a car: the ten nearest cars (x 5 to 50) keep theirs.
  expect(Math.max(...xs)).toBeCloseTo(50.7);
});

it('lights by GAME_LIGHT_UNIT, and not while the venue is captured', () => {
  expect(carSpotUniforms.carSpot_scale.value).toBe(GAME_LIGHT_UNIT);
  sceneEmission.value = 0;
  try { expect(carSpotUniforms.carSpot_scale.value).toBe(0); } finally { sceneEmission.value = 1; }
});
