import { afterEach, expect, it } from 'vitest';
import { ShaderChunk, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { sceneEmission } from '../../../../../src/components/replay/view3d/scene/dayLight.js';
import {
  createNearTrackLights, NEAR_TRACK_LIGHTS, patchTrackLights, switchTrackLights, TRACK_LIGHT_FRAGMENT, trackLightUniforms,
} from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import { TRACK_LIGHT_ATTRIBUTE } from '../../../../../src/components/replay/view3d/night/trackLights.js';

afterEach(() => { switchTrackLights(false); trackLightUniforms.trackLight_nearCount.value = 0; });

const program = () => ({uniforms: {}, vertexShader: ShaderChunk.meshphysical_vert, fragmentShader: ShaderChunk.meshphysical_frag}) as unknown as WebGLProgramParametersWithUniforms;

it("reads the scenery's baked sums, and a car's nearest lights, into the diffuse before the occlusion", () => {
  const scenery = program(), car = program();
  patchTrackLights(scenery, 'baked'); patchTrackLights(car, 'near');
  expect(scenery.vertexShader).toContain(`attribute vec4 ${TRACK_LIGHT_ATTRIBUTE};`);
  expect(car.vertexShader).not.toContain(TRACK_LIGHT_ATTRIBUTE);
  expect(car.vertexShader).toContain(`uniform vec4 trackLight_near[${2 * NEAR_TRACK_LIGHTS}];`);
  for (const shader of [scenery, car]) {
    expect(shader.vertexShader).toMatch(/vTrackLight \*?=[^\n]*\n?[\s\S]*#include <worldpos_vertex>/);
    expect(shader.fragmentShader).toContain(`${TRACK_LIGHT_FRAGMENT}\n#include <aomap_fragment>`);
    expect(shader.uniforms.trackLight_scale).toBe(trackLightUniforms.trackLight_scale);
  }
});

it('lights by GAME_LIGHT_UNIT while switched on, and not while the venue is captured', () => {
  expect(trackLightUniforms.trackLight_scale.value).toBe(0);
  switchTrackLights(true);
  expect(trackLightUniforms.trackLight_scale.value).toBe(GAME_LIGHT_UNIT);
  sceneEmission.value = 0;
  try { expect(trackLightUniforms.trackLight_scale.value).toBe(0); } finally { sceneEmission.value = 1; }
});

it('hands the cars the lights whose reach comes nearest the camera, while the lights are on', () => {
  const lights = Array.from({length: NEAR_TRACK_LIGHTS + 3}, (_, i) => ({position: [i * 10, 5, 0] as const, rangeM: 20, colour: [i, 0, 0] as const}));
  // A long-reach light far away: its reach ends 5 m past the camera, nearer than every light but the first two (20 and 10 m past).
  lights.push({position: [1000, 5, 0], rangeM: 1005, colour: [99, 0, 0]});
  const near = createNearTrackLights(lights), eye = new Vector3(0, 5, 0);
  near.update(eye);
  expect(trackLightUniforms.trackLight_nearCount.value).toBe(0); // Off: nothing picked.
  switchTrackLights(true); near.update(eye);
  const picked = trackLightUniforms.trackLight_near.value.filter((_, i) => i % 2 === 1).map(colour => colour.x);
  expect(trackLightUniforms.trackLight_nearCount.value).toBe(NEAR_TRACK_LIGHTS);
  expect(picked.slice(0, 3)).toEqual([0, 1, 99]);
  near.dispose();
  expect(trackLightUniforms.trackLight_nearCount.value).toBe(0);
});
