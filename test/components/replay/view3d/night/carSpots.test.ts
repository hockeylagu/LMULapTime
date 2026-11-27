import { afterEach, expect, it } from 'vitest';
import { Box3, Matrix4, PerspectiveCamera, ShaderChunk, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import type { CarLights, CarSpotLight } from '../../../../../shared/packageContract/index.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { sceneEmission } from '../../../../../src/components/replay/view3d/scene/dayLight.js';
import { CAR_SPOTS, carSpotUniforms, createCarSpots, withoutCarSpots } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { patchTrackLights } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';

afterEach(() => { carSpotUniforms.carSpot_count.value = 0; });

const spot = (name: CarSpotLight['name'], x: number, rangeM: number): CarSpotLight => ({
  name, position: [x, 0.5, -2], direction: [0, -0.15, -0.99], rangeM, attenuation: [1, 0.15, 0.0005], innerConeDeg: 10, outerConeDeg: 100, falloff: 10,
  colour: [6, 5.8, 5.6], states: name === 'tail' ? {lit: [1, 0.02, 0.02], braking: [2.5, 0.05, 0.05]} : null,
});
const lights: CarLights = {spots: [spot('headlightLeft', 0.7, 400), spot('headlightRight', -0.7, 400), spot('tail', 0, 3)], cockpit: null};

it("adds the beams to the diffuse in every program that takes the track lights, the cars' with their own car's box", () => {
  const program = () => ({uniforms: {}, vertexShader: ShaderChunk.meshphysical_vert, fragmentShader: ShaderChunk.meshphysical_frag}) as unknown as WebGLProgramParametersWithUniforms;
  const scenery = program(), car = program();
  patchTrackLights(scenery, 'baked'); patchTrackLights(car, 'near');
  for (const shader of [scenery, car]) {
    expect(shader.fragmentShader).toContain(`uniform vec4 carSpot_spots[${4 * CAR_SPOTS}];`);
    expect(shader.fragmentShader).toMatch(/indirectDiffuse\+=\(vTrackLight\+carSpotLight\([^\n]*\n#include <aomap_fragment>/);
    expect(shader.uniforms.carSpot_spots).toBe(carSpotUniforms.carSpot_spots);
  }
  // Only a car leaves out its own spots by its box; the road under it is behind the lamps.
  expect(car.fragmentShader).toContain(`uniform vec4 carSpot_owners[${2 * CAR_SPOTS}];`);
  expect(scenery.fragmentShader).not.toContain('carSpot_owners');
});

it("hands each spot its car's box on the ground, and none for a car whose bounds are unknown", () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0), box = new Box3(new Vector3(-1, 0, -2), new Vector3(1, 1, 2));
  spots.update([{lights, frame, headlights: true, braking: true, box}], cameraAt(10), null);
  const owners = carSpotUniforms.carSpot_owners.value;
  // Centre and half width; the length axis (x, z), half length and half height, each 5 cm wider.
  [10, 0.5, 0, 1.05].forEach((value, i) => expect(owners[0].getComponent(i)).toBeCloseTo(value));
  [0, 1, 2.05, 0.55].forEach((value, i) => expect(owners[1].getComponent(i)).toBeCloseTo(value));
  expect(owners[5].toArray()).toEqual(owners[1].toArray()); // Its tail spot: the same car.
  // On a 10° grade the level box holds the tilted car: its nose rises out of the flat one's height.
  const pitch = 10 * Math.PI / 180, uphill = new Matrix4().makeRotationX(pitch).setPosition(10, 0, 0);
  spots.update([{lights, frame: uphill, headlights: true, braking: true, box}], cameraAt(10), null);
  expect(owners[0].w).toBeCloseTo(1.05);
  [0, 1].forEach((value, i) => expect(owners[1].getComponent(i)).toBeCloseTo(value));
  expect(owners[1].z).toBeCloseTo(2 * Math.cos(pitch) + 0.5 * Math.sin(pitch) + 0.05);
  expect(owners[1].w).toBeCloseTo(0.5 * Math.cos(pitch) + 2 * Math.sin(pitch) + 0.05);
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], cameraAt(10), null);
  expect(owners[1].z).toBe(0);
  spots.dispose();
});

/** A camera at `eye` looking down −z, the way the cars' tail spots face. */
const cameraAt = (x: number, y = 0.5, z = 20) => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(x, y, z); camera.lookAt(x, y, z - 1);
  return camera;
};
const colours = () => carSpotUniforms.carSpot_spots.value.slice(0, 4 * carSpotUniforms.carSpot_count.value).filter((_, i) => i % 4 === 3).map(slot => slot.x);

it("places each spot through its car's frame, the tail spot only while braking", () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0);
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], cameraAt(10), null);
  // Its lit colour, headlights on, lights nothing.
  expect(carSpotUniforms.carSpot_count.value).toBe(2);
  spots.update([{lights, frame, headlights: true, braking: true, box: null}], cameraAt(10), null);
  const [position, direction, attenuation, colour] = carSpotUniforms.carSpot_spots.value;
  expect(carSpotUniforms.carSpot_count.value).toBe(3);
  // The car's own order: left headlight, right headlight, tail.
  [10.7, 0.5, -2, 400].forEach((value, i) => expect(position.getComponent(i)).toBeCloseTo(value));
  expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
  expect(direction.w).toBeCloseTo(Math.cos(50 * Math.PI / 180));
  expect(attenuation.toArray().slice(0, 3)).toEqual([1, 0.15, 0.0005]);
  expect(attenuation.w).toBeCloseTo(Math.cos(5 * Math.PI / 180));
  expect(colour.toArray()).toEqual([6, 5.8, 5.6, 10]);
  // The tail spot's falloff negated: it lights by the angle of incidence too.
  expect(carSpotUniforms.carSpot_spots.value[11].toArray()).toEqual([2.5, 0.05, 0.05, -10]);
  spots.dispose();
  expect(carSpotUniforms.carSpot_count.value).toBe(0);
});

it('shines the tail spot in its braking colour while the car brakes, headlights on or off', () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0), camera = cameraAt(10);
  spots.update([{lights, frame, headlights: true, braking: true, box: null}], camera, null);
  expect(colours()).toEqual([6, 6, 2.5]);
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], camera, null);
  expect(colours()).toEqual([6, 6]);
  spots.update([{lights, frame, headlights: false, braking: true, box: null}], camera, null);
  expect(carSpotUniforms.carSpot_spots.value[0].toArray()).toEqual([10, 0.5, -2, 3]);
  expect(colours()).toEqual([2.5]);
  spots.update([{lights, frame, headlights: false, braking: false, box: null}], camera, null);
  expect(carSpotUniforms.carSpot_count.value).toBe(0);
  spots.dispose();
});

it("picks the headlights before the tail spots, each by its car's distance to the focus car, up to the game's 20", () => {
  // Twenty-two cars along x, lamps on, all braking: 44 headlights for 20 places, so no tail spot.
  const cars = Array.from({length: 22}, (_, i) => ({lights, frame: new Matrix4().makeTranslation(i * 5, 0, 0), headlights: true, braking: true, box: null}));
  createCarSpots().update(cars, cameraAt(50, 60, 160), new Vector3(105, 0, 0));
  expect(carSpotUniforms.carSpot_count.value).toBe(CAR_SPOTS);
  expect(colours()).toEqual(Array<number>(20).fill(6));
  // The nearest car (x 105) first, left headlight then right; the tenth nearest (x 60) last.
  const xs = carSpotUniforms.carSpot_spots.value.slice(0, 4 * CAR_SPOTS).filter((_, i) => i % 4 === 0).map(slot => slot.x);
  expect(xs[0]).toBeCloseTo(105.7);
  expect(xs.slice(-2).map(x => Number(x.toFixed(1)))).toEqual([60.7, 59.3]);
  // By the car nearest the camera when there is no focus car (ties in the cars' order); the braking car's tail spot after every headlight.
  createCarSpots().update(cars.slice(0, 5).map((car, i) => ({...car, braking: i === 3})), cameraAt(10, 30, 60), null);
  expect(colours()).toEqual([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 2.5]);
});

it('leaves out a spot whose cone is outside the view', () => {
  const spots = createCarSpots(), braking = {lights, headlights: false, braking: true, box: null};
  // A tail spot 3 m long, behind a camera that looks away from it.
  spots.update([{...braking, frame: new Matrix4().makeTranslation(0, 0, 40)}], cameraAt(0), null);
  expect(carSpotUniforms.carSpot_count.value).toBe(0);
  spots.update([{...braking, frame: new Matrix4()}], cameraAt(0), null);
  expect(carSpotUniforms.carSpot_count.value).toBe(1);
  spots.dispose();
});

it('lights by GAME_LIGHT_UNIT, and not while the venue is captured', () => {
  expect(carSpotUniforms.carSpot_scale.value).toBe(GAME_LIGHT_UNIT);
  sceneEmission.value = 0;
  try { expect(carSpotUniforms.carSpot_scale.value).toBe(0); } finally { sceneEmission.value = 1; }
});

it('draws without the spots inside withoutCarSpots, as the car probe does, and with them again after, even on a throw', () => {
  const seen: number[] = [];
  withoutCarSpots(() => { seen.push(carSpotUniforms.carSpot_scale.value); });
  expect(() => withoutCarSpots(() => { throw Error('draw failed'); })).toThrow('draw failed');
  expect([...seen, carSpotUniforms.carSpot_scale.value]).toEqual([0, GAME_LIGHT_UNIT]);
});
