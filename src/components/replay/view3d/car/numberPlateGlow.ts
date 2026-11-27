import { Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { sceneDayLight, sceneEmission } from '../scene/dayLight.js';

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
 * Adds the plate's glow to three's emission, over its albedo: in the scene's light unit, not while the venue is captured
 * (`sceneEmission` 0), and for a night-only plate only while the day share is under full day (as the surface program gates it).
 */
export function patchNumberPlateGlow(shader: WebGLProgramParametersWithUniforms, glow: NumberPlateGlow): void {
  shader.uniforms.plate_colour = {value: glow.colour};
  shader.uniforms.plate_switchU = {value: glow.switchU};
  shader.uniforms.plate_scale = {get value() { return glow.nightOnly && sceneDayLight.value >= 1 ? 0 : GAME_LIGHT_UNIT * sceneEmission.value; }};
  shader.fragmentShader = `uniform vec3 plate_colour;\nuniform float plate_switchU, plate_scale;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
totalEmissiveRadiance += plate_colour * step(plate_switchU, vMapUv.x) * diffuseColor.rgb * plate_scale;
#else
totalEmissiveRadiance += plate_colour * diffuseColor.rgb * plate_scale;
#endif`)}`;
}
