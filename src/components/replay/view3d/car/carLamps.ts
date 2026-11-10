import { NormalBlending, ShaderMaterial, type Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import { SUN_UNIT } from '../atmosphere/sunSamples.js';

/**
 * The frame a glow lamp shows by day, or null when it is not drawn: only lamps whose `states.off` is known (headlight and
 * brake glow) are, and not when the game ships no texture for that frame. A lit state is not drawn yet.
 */
export function unlitFrame(lamp: CarLamp): string | null {
  const index = lamp.states?.off;
  return index === null || index === undefined ? null : lamp.frames[index];
}

/**
 * A lamp's glow, unlit: rgb = tex.rgb · scale · tex.a · (1 + gain · (N·V)^power) in the package's light unit, blended with the
 * texture's alpha when `blend` is alpha. Vertex colour and ambient scaling are not supported yet, so a lamp asking for them throws.
 */
export function createLampMaterial(lamp: CarLamp, texture: Texture): ShaderMaterial {
  const {scale, vertexColour, viewBoost, ambientScaled, vertexAlpha} = lamp.emission;
  if (vertexColour || ambientScaled || vertexAlpha) throw Error(`Lamp ${lamp.material}: vertex colour and ambient scaled emission are not supported`);
  const alpha = lamp.blend === 'alpha';
  const material = new ShaderMaterial({
    name: `lamp-${lamp.material}`,
    uniforms: {
      map: {value: texture}, scale: {value: scale * SUN_UNIT},
      boostGain: {value: viewBoost?.gain ?? 0}, boostPower: {value: viewBoost?.power ?? 1},
      // The material's own opacity (a ghost car fades its lamps with its body).
      opacity: {get value() { return material.opacity; }},
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormal, vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float scale, boostGain, boostPower, opacity;
      varying vec2 vUv; varying vec3 vNormal, vView;
      void main() {
        vec4 tex = texture2D(map, vUv);
        float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
        gl_FragColor = vec4(tex.rgb * scale * tex.a * (1.0 + boostGain * pow(facing, boostPower)), ${alpha ? 'tex.a' : '1.0'} * opacity);
      }`,
    transparent: alpha, blending: NormalBlending, depthWrite: !alpha,
  });
  return material;
}
