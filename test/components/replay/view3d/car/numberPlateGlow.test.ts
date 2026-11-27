import { afterEach, expect, it } from 'vitest';
import { ShaderChunk, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { sceneDayLight, sceneEmission } from '../../../../../src/components/replay/view3d/scene/dayLight.js';
import { numberPlateGlow, patchNumberPlateGlow } from '../../../../../src/components/replay/view3d/car/numberPlateGlow.js';

afterEach(() => { sceneDayLight.value = 1; sceneEmission.value = 1; });

const plate = (emissive: string | undefined, parameters: Record<string, unknown> = {emissive: {colour: [1, 0.5, 1], strength: 2, switchU: 0.5}}): CarSurface => ({
  version: 4, kind: 'numberPlate', name: 'WCEXTRA3', flags: {emissive}, parameters, maps: {},
});

it("reads a lit plate's glow: colour squared times its strength over pi, on the digit half, at night only", () => {
  const glow = numberPlateGlow(plate('night'))!;
  [2 / Math.PI, 0.5 / Math.PI, 2 / Math.PI].forEach((value, i) => expect(glow.colour.getComponent(i)).toBeCloseTo(value));
  expect(glow.switchU).toBe(0.5);
  expect(glow.nightOnly).toBe(true);
  expect(numberPlateGlow(plate('always'))!.nightOnly).toBe(false);
});

it('gives no glow to an unlit plate or another kind, and rejects a lit plate without its values', () => {
  expect(numberPlateGlow(plate(undefined))).toBeNull();
  expect(numberPlateGlow({...plate('night'), kind: 'standard'})).toBeNull();
  expect(numberPlateGlow(undefined)).toBeNull();
  expect(() => numberPlateGlow(plate('night', {}))).toThrow(/WCEXTRA3/);
});

it("adds the glow to three's emission in the scene's light unit, by night only and not while the venue is captured", () => {
  const shader = {uniforms: {} as Record<string, IUniform>, fragmentShader: ShaderChunk.meshphysical_frag} as unknown as WebGLProgramParametersWithUniforms;
  patchNumberPlateGlow(shader, numberPlateGlow(plate('night'))!);
  expect(shader.fragmentShader).toContain('totalEmissiveRadiance += plate_colour * step(plate_switchU, vMapUv.x) * diffuseColor.rgb * plate_scale;');
  const scale = shader.uniforms.plate_scale;
  expect(scale.value).toBe(0); // Full day.
  sceneDayLight.value = 0.2;
  expect(scale.value).toBe(GAME_LIGHT_UNIT);
  sceneEmission.value = 0;
  expect(scale.value).toBe(0);
});
