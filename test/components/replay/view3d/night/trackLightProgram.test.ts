import { afterEach, expect, it } from 'vitest';
import { ShaderChunk, Vector3 } from 'three';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { NEAR_TRACK_LIGHTS, SCENE_BLOCK, sceneBlock, sceneValue, setScene } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import {
  createNearTrackLights, switchTrackLights, TRACK_LIGHT_ATTRIBUTE, trackLightFragment, trackLightPart,
} from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import { ALL_LAMPS } from '../../../../../src/components/replay/view3d/night/cockpitLight.js';

/** The fragment of every lamp, as a material without its own shares draws it. */
const TRACK_LIGHT_FRAGMENT = trackLightFragment(ALL_LAMPS);

afterEach(() => { switchTrackLights(false); setScene('trackLight_nearCount', 0); });

it("reads the scenery's baked sums, and a car's nearest lights, into the diffuse before the occlusion", () => {
  const scenery = trackLightPart('baked').slots, car = trackLightPart('near').slots;
  // The package's attribute as three's glTF loader names it, RGBE with the contract's exponent bias.
  expect(scenery.vertexPars?.glsl).toContain('attribute vec4 _lmu_tracklight;');
  expect(scenery.vertexOutputs?.glsl).toContain('vTrackLight = (_lmu_tracklight.rgb * exp2(floor(_lmu_tracklight.a * 255.0 + 0.5) - 64.0)) * trackLight_scale * surface_emission;');
  expect(car.vertexPars?.glsl).not.toContain(TRACK_LIGHT_ATTRIBUTE);
  expect(car.vertexPars?.glsl).not.toContain('uniform'); // The near lights are the scene block's.
  expect(car.vertexOutputs?.glsl).toContain('float trackLightScale = trackLight_scale * surface_emission;');
  expect(SCENE_BLOCK.glsl).toContain(`highp vec4 trackLight_near[ ${2 * NEAR_TRACK_LIGHTS} ];`);
  for (const slots of [scenery, car]) expect(slots.fragmentOcclusion).toEqual({at: 0, glsl: TRACK_LIGHT_FRAGMENT});
  // The diffuse share of the albedo: a metal (a mirror, chrome) takes no lamp light.
  expect(TRACK_LIGHT_FRAGMENT).toContain('*BRDF_Lambert(material.diffuseContribution);');
  expect(ShaderChunk.lights_physical_fragment).toContain('material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );');
});
it('lights by GAME_LIGHT_UNIT while switched on (the scene block), and not while the venue is captured (the pass block, read in the program)', () => {
  expect(sceneValue('trackLight_scale')).toBe(0);
  switchTrackLights(true);
  expect(sceneValue('trackLight_scale')).toBe(Math.fround(GAME_LIGHT_UNIT));
  switchTrackLights(false);
  expect(sceneValue('trackLight_scale')).toBe(0);
});

it('hands the cars the lights whose reach comes nearest the camera, while the lights are on', () => {
  const lights = Array.from({length: NEAR_TRACK_LIGHTS + 3}, (_, i) => ({position: [i * 10, 5, 0] as [number, number, number], rangeM: 20, colour: [i, 0, 0] as [number, number, number]}));
  // A long-reach light far away: its reach ends 5 m past the camera, nearer than every light but the first two (20 and 10 m past).
  lights.push({position: [1000, 5, 0], rangeM: 1005, colour: [99, 0, 0]});
  const near = createNearTrackLights(lights), eye = new Vector3(0, 5, 0);
  near.update(eye);
  expect(sceneValue('trackLight_nearCount')).toBe(0); // Off: nothing picked.
  switchTrackLights(true); near.update(eye);
  // Packed vec4s in the scene block: per light, position and range, then colour and 0.
  const packed = sceneBlock.subarray(SCENE_BLOCK.offsets.trackLight_near, SCENE_BLOCK.offsets.trackLight_near + 8 * NEAR_TRACK_LIGHTS);
  const picked = Array.from({length: NEAR_TRACK_LIGHTS}, (_, i) => packed[8 * i + 4]);
  expect(sceneValue('trackLight_nearCount')).toBe(NEAR_TRACK_LIGHTS);
  expect(picked.slice(0, 3)).toEqual([0, 1, 99]);
  expect(Array.from(packed.subarray(0, 8))).toEqual([0, 5, 0, 20, 0, 0, 0, 0]);
  expect(Array.from(packed.subarray(16, 24))).toEqual([1000, 5, 0, 1005, 99, 0, 0, 0]);
  near.dispose();
  expect(sceneValue('trackLight_nearCount')).toBe(0);
});

it('gives a composed program the same track lights: the sums passed once the position is final, the share added before the occlusion', () => {
  const part = trackLightPart('baked'), {slots} = part;
  expect(slots.vertexPars?.glsl).toContain(`attribute vec4 ${TRACK_LIGHT_ATTRIBUTE};`);
  expect(slots.vertexOutputs?.glsl).toContain('vTrackLight = ');
  expect(slots.fragmentOcclusion).toEqual({at: 0, glsl: TRACK_LIGHT_FRAGMENT});
  expect(part.uniforms).toBeUndefined();
  expect(trackLightPart('near', {omni: '0.0', spot: '0.0', cockpit: null}).slots.fragmentOcclusion).toBeUndefined();
});