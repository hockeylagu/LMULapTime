import { Vector3, type IUniform } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { glslNumber } from '../scenery/materials/shaderContext.js';
import type { ShaderPart } from '../shaders/composer.js';

/** A lit race number: its glow colour (colour² · strength / π, the package's light unit), where it glows, and whether by night only. */
export interface NumberPlateGlow { colour: Vector3; switchU: number; nightOnly: boolean }

/**
 * The glow of a number plate whose package surface lights it (`flags.emissive` 'night' or 'always', `parameters.emissive`), else
 * null. The game adds colour² · strength where the albedo's U passes `switchU` (the plate's digit half) to the diffuse light, so a
 * white digit gives 2 · albedo / π (docs/SCENE_PACKAGE.md in the pipeline; the Mustang's 77 at about 0.3 on the Algarve night captures).
 */
export function numberPlateGlow(surface: CarSurface | undefined): NumberPlateGlow | null {
  const mode = surface?.flags?.emissive;
  if (surface?.kind !== 'numberPlate' || (mode !== 'night' && mode !== 'always')) return null;
  const emissive = surface.parameters?.emissive as {colour?: unknown; strength?: unknown; switchU?: unknown} | undefined;
  const {colour, strength, switchU} = emissive ?? {};
  if (!Array.isArray(colour) || colour.length < 3 || !colour.every(Number.isFinite) || typeof strength !== 'number' || typeof switchU !== 'number') {
    throw Error(`Number plate ${surface.name}: its glow has no colour, strength or switchU`);
  }
  const [r, g, b] = (colour as number[]).map(value => value * value * strength / Math.PI);
  return {colour: new Vector3(r, g, b), switchU, nightOnly: mode === 'night'};
}

/**
 * The plate's glow on the car's emission (a part of its standard family, carStandardSurface.ts), over its albedo: in the scene's
 * light unit, not while the venue is captured (the pass block's `surface_emission` 0), and for a night-only plate only while the day
 * share (`lit_dayLight`) is under full day (as the surface program gates it). With its albedo map (`mapped`, `vCarMapUv`) only past `switchU` along the map's U.
 */
export function numberPlateGlowPart(glow: NumberPlateGlow, mapped: boolean): ShaderPart {
  const uniforms: Record<string, IUniform> = {
    plate_colour: {value: glow.colour}, plate_switchU: {value: glow.switchU}, plate_nightOnly: {value: glow.nightOnly ? 1 : 0},
  };
  return {
    name: 'numberPlateGlow',
    slots: {
      fragmentPars: {at: 40, glsl: 'uniform vec3 plate_colour;\nuniform float plate_switchU, plate_nightOnly;'},
      fragmentEmission: {at: 10, glsl: `  totalEmissiveRadiance += plate_colour${mapped ? ' * step( plate_switchU, vCarMapUv.x )' : ''} * diffuseColor.rgb
    * ( plate_nightOnly > 0.5 && lit_dayLight >= 1.0 ? 0.0 : ${glslNumber(GAME_LIGHT_UNIT)} * surface_emission );`},
    },
    uniforms: () => uniforms,
  };
}