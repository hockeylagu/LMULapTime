import { Color, type ColorRepresentation, type IUniform, type Material, type ShaderMaterial } from 'three';
import { hazePart } from '../atmosphere/haze.js';
import { composedMaterial, composedParts, type ComposedParameters, type ShaderPart } from './composer.js';
import { litTemplate } from './litTemplate.js';

/** A plain surface's values, as three's standard material takes them (no maps, no emission, no vertex colour). */
export interface PlainSurface {
  colour: ColorRepresentation;
  roughness: number;
  metalness: number;
  /**
   * The share of the environment's light it takes: 1 as three's standard material on the scene's environment, 0 none (three's
   * standard material at `envMapIntensity` 0 on an environment map of its own).
   */
  environment: number;
}

/**
 * The plain surface family: three's standard material of one colour, roughness and metalness, on the lit template (whose white,
 * roughness 1, metalness 0 it replaces before the light model reads them). Its environment share drops the environment's light
 * from the outgoing light: at 1 the template's sum is left as it is. Every value is the material's own uniform, so every plain
 * surface shares one program.
 */
export const plainSurfacePart: ShaderPart = {
  name: 'plainSurface',
  slots: {
    fragmentPars: {at: 0, glsl: 'uniform vec3 plain_colour;\nuniform float plain_roughness, plain_metalness, plain_environment;\n'},
    fragmentColour: {at: 0, glsl: '  diffuseColor.rgb *= plain_colour;\n  roughnessFactor = plain_roughness;\n  metalnessFactor = plain_metalness;'},
    fragmentLight: {at: 0, glsl: '  outgoingLight -= ( 1.0 - plain_environment ) * ( reflectedLight.indirectDiffuse + reflectedLight.indirectSpecular );'},
  },
  uniforms: () => ({plain_colour: {value: new Color(1, 1, 1)}, plain_roughness: {value: 1}, plain_metalness: {value: 0}, plain_environment: {value: 1}}),
  // A ghost: roughness 0.7, no metal, the whole environment (`composedGhost`).
  ghost: {plain_roughness: 0.7, plain_metalness: 0, plain_environment: 1},
};

/** Whether `material` is a plain surface (`plainSurfaceMaterial`). */
export function isPlainSurface(material: Material): material is ShaderMaterial {
  return composedParts(material)?.includes(plainSurfacePart) === true;
}

/** Writes `values` into a plain surface's uniforms; the others keep theirs. */
export function setPlainSurface(material: Material, values: Partial<PlainSurface>): void {
  if (!isPlainSurface(material)) throw Error(`Material ${material.name || material.type} is not a plain surface`);
  const u = material.uniforms as Record<'plain_colour' | 'plain_roughness' | 'plain_metalness' | 'plain_environment', IUniform>;
  for (const name of ['roughness', 'metalness', 'environment'] as const) {
    const value = values[name];
    if (value !== undefined && !Number.isFinite(value)) throw Error(`Plain surface ${name} is not finite: ${value}`);
  }
  if (values.colour !== undefined) (u.plain_colour.value as Color).set(values.colour);
  if (values.roughness !== undefined) u.plain_roughness.value = values.roughness;
  if (values.metalness !== undefined) u.plain_metalness.value = values.metalness;
  if (values.environment !== undefined) u.plain_environment.value = values.environment;
}

/**
 * A plain surface under the scene's haze: the lit template with `plainSurfacePart` and `hazePart`. `parameters` are the material's
 * own (transparency, opacity, depth write, side, polygon offset), read by three as on a built-in material.
 */
export function plainSurfaceMaterial(surface: PlainSurface, parameters: ComposedParameters = {}): ShaderMaterial {
  const material = composedMaterial(litTemplate, [plainSurfacePart, hazePart], parameters);
  setPlainSurface(material, surface);
  return material;
}
