import { afterEach, expect, it } from 'vitest';
import { Matrix4, ShaderChunk, type WebGLProgramParametersWithUniforms } from 'three';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { sceneDayLight, sceneEmission } from '../../../../../src/components/replay/view3d/scene/dayLight.js';
import { cockpitLightUniforms, lampShares, setCockpitFrame } from '../../../../../src/components/replay/view3d/night/cockpitLight.js';
import { CAR_SPOT_TERM } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { patchTrackLights } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import type { ShaderContext } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import type { SurfaceConfig } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

afterEach(() => { setCockpitFrame(null); sceneDayLight.value = 1; });

const context = {
  sample: (key: string) => `tex(${key})`, number: (n: number) => String(n), vec: (a: readonly number[]) => `vec${a.length}(${a.join(',')})`,
  uv: () => 'uv', uniforms: false,
} as ShaderContext;
const light = {position: [0, 0.9, 0.25], range: 1.3, intensity: 10, colour: [0.04, 0, 1]};
const surface = (kind: SurfaceConfig['kind'], cockpitMode?: string, cockpitLight: typeof light | undefined = light) =>
  ({version: 4, kind, flags: {cockpitMode}, parameters: {cockpitLight}, maps: {}, normalYSign: 1, normalShadowInfluence: 0}) as unknown as SurfaceConfig;

it('drops the lamp light in a cabin, or scales it by the emissive alpha, and adds the cockpit light', () => {
  expect(lampShares(surface('standard'), context)).toEqual({omni: '1.0', spot: '1.0', cockpit: null});
  const cabin = lampShares(surface('standard', 'on'), context);
  expect([cabin.omni, cabin.spot]).toEqual(['0.0', '0.0']);
  expect(cabin.cockpit).toBe('cockpitLightTerm(vec3(0,0.9,0.25),1.3,vec3(0.4,0,10),lampPoint,lampNormal)');
  const masked = lampShares(surface('standardBlend', 'emissiveAlpha'), context);
  expect([masked.omni, masked.spot]).toEqual(['tex(emissive).a', 'tex(emissive).a']);
  // A material whose copy is the shader default (intensity 0) has no cockpit light.
  expect(lampShares(surface('standard', 'on', {...light, intensity: 0}), context).cockpit).toBeNull();
  expect(() => lampShares(surface('standard', 'sometimes'), context)).toThrow('Unsupported cockpit mode');
});

it('keeps the beams off glass, and the cockpit light off cabin glass', () => {
  expect(lampShares(surface('glass'), context)).toEqual({omni: '1.0', spot: '0.0', cockpit: null});
  expect(lampShares(surface('glass', 'on'), context)).toEqual({omni: '0.0', spot: '0.0', cockpit: null});
});

it('writes only the terms a surface takes', () => {
  const program = () => ({uniforms: {}, vertexShader: ShaderChunk.meshphysical_vert, fragmentShader: ShaderChunk.meshphysical_frag}) as unknown as WebGLProgramParametersWithUniforms;
  const cabin = program(), glass = program();
  patchTrackLights(cabin, 'near', lampShares(surface('standard', 'on'), context));
  patchTrackLights(glass, 'near', lampShares(surface('glass'), context));
  expect(cabin.fragmentShader).toContain('indirectDiffuse+=(cockpitLightTerm(');
  expect(cabin.fragmentShader).not.toContain(CAR_SPOT_TERM);
  expect(cabin.uniforms.cockpitLight_frame).toBe(cockpitLightUniforms.cockpitLight_frame);
  expect(glass.fragmentShader).not.toContain(CAR_SPOT_TERM);
  expect(glass.fragmentShader).not.toContain('cockpitLightTerm');
});

it('lights at night only, while a cabin car is placed, and not while the venue is captured', () => {
  sceneDayLight.value = 0.5;
  expect(cockpitLightUniforms.cockpitLight_scale.value).toBe(0);
  setCockpitFrame(new Matrix4().makeTranslation(1, 2, 3));
  expect(cockpitLightUniforms.cockpitLight_frame.value.elements[12]).toBe(1);
  expect(cockpitLightUniforms.cockpitLight_scale.value).toBe(GAME_LIGHT_UNIT);
  sceneDayLight.value = 1;
  expect(cockpitLightUniforms.cockpitLight_scale.value).toBe(0);
  sceneDayLight.value = 0; sceneEmission.value = 0;
  try { expect(cockpitLightUniforms.cockpitLight_scale.value).toBe(0); } finally { sceneEmission.value = 1; }
});
