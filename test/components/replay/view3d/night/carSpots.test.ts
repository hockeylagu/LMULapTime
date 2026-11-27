import { afterEach, expect, it } from 'vitest';
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { CarLights, CarSpotLight } from '../../../../../shared/packageContract/index.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { glslNumber } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import { createCarSpots, withoutCarSpots } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { CAR_SPOTS, passValues, SCENE_BLOCK, sceneBlock, sceneValue, setScene } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { trackLightPart } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';

afterEach(() => { setScene('carSpot_count', 0); });
/** The scene block's spot list and car boxes. */
const spotList = () => sceneBlock.subarray(SCENE_BLOCK.offsets.carSpot_spots, SCENE_BLOCK.offsets.carSpot_spots + 16 * CAR_SPOTS);
const ownerList = () => sceneBlock.subarray(SCENE_BLOCK.offsets.carSpot_owners, SCENE_BLOCK.offsets.carSpot_owners + 8 * CAR_SPOTS);

const spot = (name: CarSpotLight['name'], x: number, rangeM: number): CarSpotLight => ({
  name, position: [x, 0.5, -2], direction: [0, -0.15, -0.99], rangeM, attenuation: [1, 0.15, 0.0005], innerConeDeg: 10, outerConeDeg: 100, falloff: 10,
  colour: [6, 5.8, 5.6], states: name === 'tail' ? {lit: [1, 0.02, 0.02], braking: [2.5, 0.05, 0.05]} : null,
});
const lights: CarLights = {spots: [spot('headlightLeft', 0.7, 400), spot('headlightRight', -0.7, 400), spot('tail', 0, 3)], cockpit: null};
/** The `index`th vec4 of a packed list. */
const vec4 = (array: Float32Array, index: number) => Array.from(array.subarray(4 * index, 4 * index + 4));
/** Expects packed values as three uploads them: each rounded to 32 bits. */
const expectPacked = (actual: number[], expected: number[]) => expect(actual).toEqual(expected.map(Math.fround));

it("adds the beams to the diffuse in every program that takes the track lights, the cars' with their own car's box", () => {
  const scenery = trackLightPart('baked'), car = trackLightPart('near');
  for (const part of [scenery, car]) {
    // The list is the scene block's: no part declares it or gives it as a uniform.
    expect(part.slots.fragmentPars?.glsl).not.toContain('uniform');
    expect(part.slots.fragmentOcclusion?.glsl).toMatch(/reflectedLight\.indirectDiffuse\+=\(vTrackLight\+carSpotLight\(/);
    expect(part.uniforms).toBeUndefined();
  }
  // Packed vec4s in the block: one per GLSL array element.
  expect(SCENE_BLOCK.glsl).toContain(`highp vec4 carSpot_spots[ ${4 * CAR_SPOTS} ];`);
  expect(SCENE_BLOCK.glsl).toContain(`highp vec4 carSpot_owners[ ${2 * CAR_SPOTS} ];`);
  // Only a car leaves out its own spots by its box; the road under it is behind the lamps.
  expect(car.slots.fragmentPars?.glsl).toContain('carSpot_owners[2 * i]');
  expect(scenery.slots.fragmentPars?.glsl).not.toContain('carSpot_owners');
});
it("hands each spot its car's box on the ground, and none for a car whose bounds are unknown", () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0), box = new Box3(new Vector3(-1, 0, -2), new Vector3(1, 1, 2));
  spots.update([{lights, frame, headlights: true, braking: true, box}], cameraAt(10), null);
  const owners = ownerList();
  // Centre and half width; the length axis (x, z), half length and half height, each 5 cm wider.
  [10, 0.5, 0, 1.05].forEach((value, i) => expect(vec4(owners, 0)[i]).toBeCloseTo(value));
  [0, 1, 2.05, 0.55].forEach((value, i) => expect(vec4(owners, 1)[i]).toBeCloseTo(value));
  expect(vec4(owners, 5)).toEqual(vec4(owners, 1)); // Its tail spot: the same car.
  // On a 10° grade the level box holds the tilted car: its nose rises out of the flat one's height.
  const pitch = 10 * Math.PI / 180, uphill = new Matrix4().makeRotationX(pitch).setPosition(10, 0, 0);
  spots.update([{lights, frame: uphill, headlights: true, braking: true, box}], cameraAt(10), null);
  expect(vec4(owners, 0)[3]).toBeCloseTo(1.05);
  [0, 1].forEach((value, i) => expect(vec4(owners, 1)[i]).toBeCloseTo(value));
  expect(vec4(owners, 1)[2]).toBeCloseTo(2 * Math.cos(pitch) + 0.5 * Math.sin(pitch) + 0.05);
  expect(vec4(owners, 1)[3]).toBeCloseTo(0.5 * Math.cos(pitch) + 2 * Math.sin(pitch) + 0.05);
  // No box: both of the spot's vec4s zeroed.
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], cameraAt(10), null);
  expect([...vec4(owners, 0), ...vec4(owners, 1)]).toEqual(Array<number>(8).fill(0));
  spots.dispose();
});

/** A camera at `eye` looking down −z, the way the cars' tail spots face. */
const cameraAt = (x: number, y = 0.5, z = 20) => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(x, y, z); camera.lookAt(x, y, z - 1);
  return camera;
};
const colours = () => Array.from({length: sceneValue('carSpot_count')}, (_, i) => vec4(spotList(), 4 * i + 3)[0]);

it("places each spot through its car's frame, the tail spot only while braking", () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0);
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], cameraAt(10), null);
  // Its lit colour, headlights on, lights nothing.
  expect(sceneValue('carSpot_count')).toBe(2);
  spots.update([{lights, frame, headlights: true, braking: true, box: null}], cameraAt(10), null);
  const packed = spotList(), [position, direction, attenuation, colour] = [0, 1, 2, 3].map(i => vec4(packed, i));
  expect(sceneValue('carSpot_count')).toBe(3);
  // The car's own order: left headlight, right headlight, tail.
  [10.7, 0.5, -2, 400].forEach((value, i) => expect(position[i]).toBeCloseTo(value));
  expect(Math.hypot(direction[0], direction[1], direction[2])).toBeCloseTo(1);
  expect(direction[3]).toBeCloseTo(Math.cos(50 * Math.PI / 180));
  expectPacked(attenuation.slice(0, 3), [1, 0.15, 0.0005]);
  expect(attenuation[3]).toBeCloseTo(Math.cos(5 * Math.PI / 180));
  expectPacked(colour, [6, 5.8, 5.6, 10]);
  // The second headlight's position follows the first spot's four vec4s.
  [9.3, 0.5, -2, 400].forEach((value, i) => expect(vec4(packed, 4)[i]).toBeCloseTo(value));
  // The tail spot's falloff negated: it lights by the angle of incidence too.
  expectPacked(vec4(packed, 11), [2.5, 0.05, 0.05, -10]);
  spots.dispose();
  expect(sceneValue('carSpot_count')).toBe(0);
});

it('shines the tail spot in its braking colour while the car brakes, headlights on or off', () => {
  const spots = createCarSpots(), frame = new Matrix4().makeTranslation(10, 0, 0), camera = cameraAt(10);
  spots.update([{lights, frame, headlights: true, braking: true, box: null}], camera, null);
  expect(colours()).toEqual([6, 6, 2.5]);
  spots.update([{lights, frame, headlights: true, braking: false, box: null}], camera, null);
  expect(colours()).toEqual([6, 6]);
  spots.update([{lights, frame, headlights: false, braking: true, box: null}], camera, null);
  expectPacked(vec4(spotList(), 0), [10, 0.5, -2, 3]);
  expect(colours()).toEqual([2.5]);
  spots.update([{lights, frame, headlights: false, braking: false, box: null}], camera, null);
  expect(sceneValue('carSpot_count')).toBe(0);
  spots.dispose();
});

it("picks the headlights before the tail spots, each by its car's distance to the focus car, up to the game's 20", () => {
  // Twenty-two cars along x, lamps on, all braking: 44 headlights for 20 places, so no tail spot.
  const cars = Array.from({length: 22}, (_, i) => ({lights, frame: new Matrix4().makeTranslation(i * 5, 0, 0), headlights: true, braking: true, box: null}));
  createCarSpots().update(cars, cameraAt(50, 60, 160), new Vector3(105, 0, 0));
  expect(sceneValue('carSpot_count')).toBe(CAR_SPOTS);
  expect(colours()).toEqual(Array<number>(20).fill(6));
  // The nearest car (x 105) first, left headlight then right; the tenth nearest (x 60) last.
  const xs = Array.from({length: CAR_SPOTS}, (_, i) => vec4(spotList(), 4 * i)[0]);
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
  expect(sceneValue('carSpot_count')).toBe(0);
  spots.update([{...braking, frame: new Matrix4()}], cameraAt(0), null);
  expect(sceneValue('carSpot_count')).toBe(1);
  spots.dispose();
});

it('lights by GAME_LIGHT_UNIT, and not while the venue is captured nor in the car probe: pass values the term reads', () => {
  expect(trackLightPart('near').slots.fragmentPars?.glsl).toContain(`return sum * (${glslNumber(GAME_LIGHT_UNIT)} * surface_emission * carSpot_shown);`);
});

it('draws without the spots inside withoutCarSpots, as the car probe does, and with them again after, even on a throw', () => {
  const seen: number[] = [];
  withoutCarSpots(() => { seen.push(passValues().carSpot_shown); });
  expect(() => withoutCarSpots(() => { throw Error('draw failed'); })).toThrow('draw failed');
  expect([...seen, passValues().carSpot_shown]).toEqual([0, 1]);
});