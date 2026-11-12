import { NormalBlending, RepeatWrapping, ShaderMaterial, type Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import { SUN_UNIT } from '../atmosphere/sunSamples.js';
import { flashes, lampStateFrames, switches, type LampSwitch } from './lampStates.js';

/**
 * The frame a lamp draws by default, or null when it is not drawn: only lamps whose `states.off` is known (or a flashing lamp's lit
 * frame) are, and not when the package has no texture for that frame or the game draws the lamp with a lit shader (no emission).
 * `rainFlashes`: the body's rain lamps take the pit-lane flash (`rainLampsFlash`).
 */
export function lampFrame(lamp: CarLamp, rainFlashes: boolean): string | null {
  // A flashing lamp without a dark frame is drawn from its lit frame and hidden while dark.
  const index = flashes(lamp, rainFlashes) ? lamp.states.off ?? lamp.states.on : lamp.states?.off;
  return !lamp.emission || index === null || index === undefined ? null : lamp.frames[index];
}

/** The texture files a drawn lamp loads: every state's frame that has a texture for a switching lamp, else the one frame it shows. */
export function lampTexturePaths(lamp: CarLamp, rainFlashes: boolean): string[] {
  if (!switches(lamp, rainFlashes)) return [lampFrame(lamp, rainFlashes)!];
  return lampStateFrames(lamp.states).flatMap(index => lamp.frames[index] ?? []);
}

/**
 * A lamp's glow, unlit: rgb = tex.rgb · scale · tex.a · (1 + gain · (N·V)^power) in the package's light unit, blended with the
 * texture's alpha when `blend` is alpha. A lamp with states takes `switching`, its own texture per frame, which its car swaps in.
 * Vertex colour and ambient scaling are not supported yet, so a lamp asking for them throws.
 */
export function createLampMaterial(lamp: CarLamp, texture: Texture, switching?: LampSwitch): ShaderMaterial {
  if (!lamp.emission) throw Error(`Lamp ${lamp.material} has no lamp emission`);
  const {scale, vertexColour, viewBoost, ambientScaled, vertexAlpha} = lamp.emission;
  if (vertexColour || ambientScaled || vertexAlpha) throw Error(`Lamp ${lamp.material}: vertex colour and ambient scaled emission are not supported`);
  const alpha = lamp.blend === 'alpha';
  // `texture` is this material's own copy. Lamp UVs run outside 0..1 (a glow quad's v from 0 to -1), so the texture repeats as
  // car textures do; clamped, the whole glow would sample the texture's transparent edge.
  for (const map of [texture, ...switching?.maps.values() ?? []]) { map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; }
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
  if (switching) material.userData.lampSwitch = switching;
  return material;
}
