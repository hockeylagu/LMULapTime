import { ClampToEdgeWrapping, Data3DTexture, LinearFilter, RedFormat, UnsignedByteType, Vector3, type IUniform, type MeshStandardMaterial } from 'three';
import type { CarReflectionOcclusion, VehicleBodyVolume } from '../../../../../shared/types/scenes/car.js';

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

/** Where the scenery's surface program sets its reflection roughness: the occlusion is computed right after. */
const SURFACE_ROUGHNESS = 'surfaceReflectionRoughness=clamp(surfaceRoughness,0.0,1.0);', LIGHTS_END = '#include <lights_fragment_end>';

/**
 * Occludes the cube reflection of a car material drawn by the scenery's surface program (`surface`) or by three's standard
 * program with the car's prefiltered cube as its environment (`standard`).
 */
export function bindCockpitOcclusion(material: MeshStandardMaterial, occlusion: CockpitOcclusion, program: 'surface' | 'standard'): void {
  const uniforms: Record<string, IUniform> = {
    cockpit_volume: {value: occlusion.volume},
    cockpit_size: {value: new Vector3(...occlusion.box.size)}, cockpit_offset: {value: new Vector3(...occlusion.box.offset)},
  };
  const own = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    own(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    // After three's common chunk, which declares saturate; before the lights, which call the occlusion.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCockpitPosition, vCockpitNormal, vCockpitEye;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT}`);
    if (program === 'surface') {
      if (!shader.fragmentShader.includes(SURFACE_ROUGHNESS)) throw Error(`Car material ${material.name}: the surface program has no reflection to occlude`);
      shader.fragmentShader = shader.fragmentShader.replace(SURFACE_ROUGHNESS, `${SURFACE_ROUGHNESS} surfaceReflectionOcclusion=cockpitOcclusion(surfaceReflectionRoughness);`);
    } else {
      // The environment's radiance, read by the lights' end (the ambient lookup inlines the chunk that reads it).
      if (!shader.fragmentShader.includes(LIGHTS_END)) throw Error(`Car material ${material.name}: the program has no reflection to occlude`);
      shader.fragmentShader = shader.fragmentShader.replace(LIGHTS_END, `#if defined( RE_IndirectSpecular )
          radiance *= cockpitReflectionScale(inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix), cockpitOcclusion(material.roughness));
        #endif
        ${LIGHTS_END}`);
    }
  };
  material.customProgramCacheKey = () => `${key()}|cockpitOcclusion`;
}
