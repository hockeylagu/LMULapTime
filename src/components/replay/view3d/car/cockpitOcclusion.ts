import { ClampToEdgeWrapping, Data3DTexture, LinearFilter, RedFormat, UnsignedByteType, Vector3, type IUniform } from 'three';
import type { CarReflectionOcclusion, VehicleBodyVolume } from '../../../../../shared/types/scenes/car.js';
import type { ShaderPart } from '../shaders/composer.js';

/**
 * Cockpit reflection occlusion, as the package states it (`reflectionOcclusion` in shared/packageContract/bodyDescriptor.ts): a material
 * inside the cockpit reflects the car's cube only where its reflected ray leaves the cabin. The ray is marched through the body's
 * signed-distance volume of the cabin from the vertex, in the object space of the part that draws it; the cube reflection is then
 * scaled by mix(blank, 1, occlusion), blank fading from 0.2 for rays pointing up to 0 for rays pointing down.
 */

/** A body volume as the package stores it: one unsigned byte a voxel, x fastest, read linearly and clamped at the box. */
export function cockpitVolumeTexture(bytes: ArrayBuffer, row: VehicleBodyVolume): Data3DTexture {
  if (bytes.byteLength !== row.width * row.height * row.depth) throw Error(`Cockpit volume ${row.sha256}: ${bytes.byteLength} bytes for ${row.width}×${row.height}×${row.depth}`);
  const texture = new Data3DTexture(new Uint8Array(bytes), row.width, row.height, row.depth);
  texture.format = RedFormat; texture.type = UnsignedByteType;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = ClampToEdgeWrapping;
  texture.generateMipmaps = false; texture.unpackAlignment = 1; texture.needsUpdate = true;
  return texture;
}

/** A material's occlusion: its box in the part's object space and the loaded volume. */
export interface CockpitOcclusion { volume: Data3DTexture; box: CarReflectionOcclusion }

const VERTEX = `
  #ifdef USE_BATCHING
    mat4 cockpitNode = modelMatrix * batchingMatrix;
  #else
    mat4 cockpitNode = modelMatrix;
  #endif
  vCockpitPosition = transformed; vCockpitNormal = objectNormal;
  vCockpitEye = (inverse(cockpitNode) * vec4(cameraPosition, 1.0)).xyz;`;

/** The march, with the package's constants: distances are in units of the box's longest edge; the cone widens with roughness. */
const FRAGMENT = `
  #define COCKPIT_OCCLUSION
  uniform highp sampler3D cockpit_volume; uniform vec3 cockpit_size, cockpit_offset;
  varying vec3 vCockpitPosition, vCockpitNormal, vCockpitEye;
  float cockpitOcclusion(float roughness) {
    vec3 ray = normalize(reflect(vCockpitPosition - vCockpitEye, normalize(vCockpitNormal)));
    float longest = max(cockpit_size.x, max(cockpit_size.y, cockpit_size.z));
    vec3 at = (vCockpitPosition - cockpit_offset) / cockpit_size + 0.5, dir = normalize(ray / cockpit_size);
    float coneTan = mix(0.2, 0.5, roughness), minStep = 0.08 / longest, distOffset = 0.05 / longest;
    float maxShell = 0.25 / longest - 1.1 * minStep - distOffset;
    at += dir * minStep;
    float total = minStep, minTan = coneTan;
    for (int i = 0; i < 16; i++) {
      if (any(lessThan(at, vec3(0.0))) || any(greaterThan(at, vec3(1.0)))) break;
      float distance = texture(cockpit_volume, at).r * 2.0 - 1.0 + distOffset;
      minTan = min(distance / total, minTan);
      if (minTan < -coneTan) { minTan = -coneTan; break; }
      float step = max(distance, minStep);
      at += dir * step; total = min(maxShell / coneTan, total + step);
    }
    float open = (1.0 + minTan / coneTan) * 0.5;
    return open * open;
  }
  /** The cube reflection's scale along world direction \`r\`. */
  float cockpitReflectionScale(vec3 r, float occlusion) { return mix(mix(0.2, 0.0, saturate(-r.y)), 1.0, occlusion); }`;

/**
 * Occludes the cube reflection of a car material: one drawn by the scenery's reflection rule (`surface`: the rule's own read, after
 * the rule's inputs are filled), or by three's environment lookup (`standard`: the environment's reflection once read, after a
 * car's correction of it). The volume is the material's own texture.
 */
export function cockpitOcclusionPart(occlusion: CockpitOcclusion, program: 'surface' | 'standard'): ShaderPart {
  const uniforms: Record<string, IUniform> = {
    cockpit_volume: {value: occlusion.volume},
    cockpit_size: {value: new Vector3(...occlusion.box.size)}, cockpit_offset: {value: new Vector3(...occlusion.box.offset)},
  };
  return {
    name: 'cockpitOcclusion',
    slots: {
      vertexPars: {at: 30, glsl: 'varying vec3 vCockpitPosition, vCockpitNormal, vCockpitEye;'},
      vertexProjected: {at: 10, glsl: VERTEX},
      // Before the reflection rule, which reads the define.
      fragmentPars: {at: 25, glsl: FRAGMENT},
      ...(program === 'surface'
        ? {fragmentMaterial: {at: 60, glsl: '  surfaceReflectionOcclusion=cockpitOcclusion(surfaceReflectionRoughness);'}}
        : {fragmentReflection: {at: 10, glsl: '  radiance *= cockpitReflectionScale(inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix), cockpitOcclusion(material.roughness));'}}),
    },
    uniforms: () => uniforms,
    ownTextures: ['cockpit_volume'],
  };
}