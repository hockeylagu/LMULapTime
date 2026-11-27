import { afterEach, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { COCKPIT_LIGHT_DECLARATIONS, lampShares, setCockpitFrame } from '../../../../../src/components/replay/view3d/night/cockpitLight.js';
import { SCENE_BLOCK, sceneBlock, sceneValue } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { CAR_SPOT_TERM } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { trackLightPart } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import type { ShaderContext } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import type { SurfaceConfig } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

afterEach(() => { setCockpitFrame(null); });

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

it('keeps the track lights and the beams off the screens, which show their own glow', () => {
  expect(lampShares(surface('externalMonitor', undefined, undefined), context)).toEqual({omni: '0.0', spot: '0.0', cockpit: null});
  const dash = lampShares(surface('dashboard', 'on'), context);
  expect([dash.omni, dash.spot]).toEqual(['0.0', '0.0']);
  expect(dash.cockpit).not.toBeNull();
});

it('writes only the terms a surface takes', () => {
  const cabin = trackLightPart('near', lampShares(surface('standard', 'on'), context)), glass = trackLightPart('near', lampShares(surface('glass'), context));
  const fragment = (part: typeof cabin) => `${part.slots.fragmentPars?.glsl ?? ''}\n${part.slots.fragmentOcclusion?.glsl ?? ''}`;
  expect(fragment(cabin)).toContain('indirectDiffuse+=(cockpitLightTerm(');
  expect(fragment(cabin)).not.toContain(CAR_SPOT_TERM);
  expect(cabin.uniforms).toBeUndefined(); // The frame and its scale are the scene block's.
  expect(fragment(glass)).not.toContain(CAR_SPOT_TERM);
  expect(fragment(glass)).not.toContain('cockpitLightTerm');
});

it('lights while a cabin car is placed, at night only and not while the venue is captured', () => {
  expect(sceneValue('cockpitLight_scale')).toBe(0);
  setCockpitFrame(new Matrix4().makeTranslation(1, 2, 3));
  expect(sceneBlock[SCENE_BLOCK.offsets.cockpitLight_frame + 12]).toBe(1);
  expect(sceneValue('cockpitLight_scale')).toBe(Math.fround(GAME_LIGHT_UNIT));
  setCockpitFrame(null);
  expect(sceneValue('cockpitLight_scale')).toBe(0);
  // The day share and the emission switch are read where the term is worked out.
  expect(COCKPIT_LIGHT_DECLARATIONS).toContain('float scale = lit_dayLight < 1.0 ? cockpitLight_scale * surface_emission : 0.0;');
});
