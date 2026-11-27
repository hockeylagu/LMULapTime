import { expect, it } from 'vitest';
import type { IUniform } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { glslNumber } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import { numberPlateGlow, numberPlateGlowPart } from '../../../../../src/components/replay/view3d/car/numberPlateGlow.js';

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
  const part = numberPlateGlowPart(numberPlateGlow(plate('night'))!, true);
  // Its scale from the blocks: 0 for a night-only plate at full day (`lit_dayLight`) and while the venue is captured (`surface_emission`).
  const scale = `* ( plate_nightOnly > 0.5 && lit_dayLight >= 1.0 ? 0.0 : ${glslNumber(GAME_LIGHT_UNIT)} * surface_emission );`;
  expect(part.slots.fragmentEmission?.glsl.replace(/\s+/g, ' ').trim()).toBe(`totalEmissiveRadiance += plate_colour * step( plate_switchU, vCarMapUv.x ) * diffuseColor.rgb ${scale}`);
  // Without its albedo map the whole plate glows.
  expect(numberPlateGlowPart(numberPlateGlow(plate('night'))!, false).slots.fragmentEmission?.glsl.replace(/\s+/g, ' ').trim()).toBe(`totalEmissiveRadiance += plate_colour * diffuseColor.rgb ${scale}`);
  expect((part.uniforms!().plate_nightOnly as IUniform<number>).value).toBe(1);
  expect(numberPlateGlowPart(numberPlateGlow(plate('always'))!, true).uniforms?.().plate_nightOnly.value).toBe(0);
  expect(part.uniforms?.()).not.toHaveProperty('plate_scale');
});