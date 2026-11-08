import type { ParameterGroup } from './surfaceConfig.js';

/** GLSL pieces one surface family contributes to the patched `MeshStandardMaterial` program. */
export interface SurfaceParts {
  albedo: string;
  normals: string;
  emissive: string;
  physical: string;
  occlusion: string;
}

/** Pieces some families add on top: clearcoat normals/absorption and the glass output. */
export interface ExtendedParts extends SurfaceParts { coatNormals?: string; finish?: string; absorption?: string }

/** What every family builder receives from `shaderParts`. */
export interface ShaderContext {
  /** `texture2D(surface_<key>, uv)` for a bound map, else `fallback`. */
  sample: (key: string, fallback?: string, scale?: readonly number[]) => string;
  /** The map's UV expression times its scale (a uniform when `uniforms`). */
  uv: (key: string, alternateScale?: readonly number[]) => string;
  /** A GLSL float literal; throws for a non-finite value. */
  number: (n: number) => string;
  vec: (a: readonly number[]) => string;
  /** Tunables are shader uniforms (shared program) instead of baked literals. */
  uniforms: boolean;
}

export function glslNumber(n: number): string {
  if (!Number.isFinite(n)) throw Error('Invalid shader constant');
  return Number(n).toFixed(8);
}

export function glslVec(a: readonly number[]): string {
  return `vec${a.length}(${a.map(glslNumber).join(',')})`;
}

/** A number from a parameter group. The exporter writes every value a surface reads: a missing one is malformed, never defaulted. */
export function value(group: ParameterGroup | undefined, key: string): number {
  const v = group?.[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`Missing surface value: ${key}`);
  return v;
}

/** A number list from a parameter group; a missing one is malformed, never defaulted. */
export function list(group: ParameterGroup | undefined, key: string): readonly number[] {
  const v = group?.[key];
  if (!Array.isArray(v)) throw Error(`Missing surface value: ${key}`);
  return v;
}

export const HELPERS = `
varying vec2 vSurfaceXZ;
varying float vSurfaceRandom;
varying vec4 vSurfaceUV01, vSurfaceUV23, vSurfaceColour;
float surfaceLeafMask = 0.0;
vec3 surfaceOverlay(vec3 base, vec3 detail) {
  return mix(2.0 * base * detail, 1.0 - 2.0 * (1.0 - base) * (1.0 - detail), step(vec3(0.5), base));
}
float surfaceOverlay1(float base, float detail) {
  return base < 0.5 ? 2.0 * base * detail : 1.0 - 2.0 * (1.0 - base) * (1.0 - detail);
}
float surfaceBlend(float inputValue, float noise, float bias) {
  return clamp((inputValue - noise) / max(bias, 0.0001), 0.0, 1.0);
}
float surfaceAdjust(float inputValue,float control) {
  float scaled=inputValue*clamp(control*2.0,0.0,1.0);
  return mix(scaled,1.0,clamp(control*2.0-1.0,0.0,1.0));
}
vec3 surfaceDecodeNormal(vec2 encoded,float strength,float ySign) {
  vec2 xy = (encoded * 2.0 - 254.0/255.0) * vec2(1.0, ySign) * strength;
  return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
}
vec3 surfaceNormalVector(vec3 base,vec2 coordinate,vec3 mapN) {
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(coordinate), st1 = dFdy(coordinate);
  vec3 T = cross(q1, base) * st0.x + cross(base, q0) * st1.x;
  vec3 B = cross(q1, base) * st0.y + cross(base, q0) * st1.y;
  float determinant = max(dot(T, T), dot(B, B));
  if (determinant < 1e-16) return base;
  return normalize(mat3(T * inversesqrt(determinant), B * inversesqrt(determinant), base) * mapN);
}
vec3 surfaceNormal(vec3 base,vec2 coordinate,vec2 encoded,float strength,float ySign) {
  return surfaceNormalVector(base,coordinate,surfaceDecodeNormal(encoded,strength,ySign));
}
`;

export const UNIFORM_DECLARATIONS = `
uniform float surface_specular;
uniform float surface_specularTinting;
uniform float surface_mixBias;
uniform float surface_splatterOverlayFactor;
uniform float surface_patternStrength;
uniform float surface_decalStrength;
uniform float surface_decalThickness;
uniform float surface_decalSoftness;
uniform float surface_decalDetail;
uniform float surface_detailStrength;
uniform float surface_kerbMixBias;
uniform float surface_kerbDefaultBlend;
uniform float surface_noOverlayRoughness;
uniform float surface_noOverlaySpecular;
uniform float surface_singleRoughness;
uniform float surface_baseRoughness;
uniform float surface_coatRoughness;
uniform float surface_coatStrength;
uniform float surface_singleIOR;
uniform float surface_baseIOR;
uniform float surface_coatIOR;
uniform float surface_singleSpecular;
uniform float surface_baseSpecular;
uniform float surface_singleNormalStrength;
uniform float surface_baseNormalStrength;
uniform float surface_coatNormalStrength;
uniform vec3 surface_coatLacquerColour;
uniform float surface_coatLacquerThickness;
uniform vec2 surface_normalScale;
`;
