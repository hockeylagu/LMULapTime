import type { ShaderPart } from './composer.js';

/**
 * The ambient lookup every lit surface of the scene shares (scenery and cars) in a lit composed program (litTemplate.ts): the
 * environment's light read along the normal with its world height halved, in place of the template's lookup along the normal.
 */
export const ambientLookupPart: ShaderPart = {
  name: 'ambientLookup',
  slots: {fragmentIrradiance: {at: 0, glsl: '  iblIrradiance += getIBLIrradiance( transformDirection( inverseTransformDirection( geometryNormal, viewMatrix ) * vec3( 1.0, 0.5, 1.0 ), viewMatrix ) );'}},
};
