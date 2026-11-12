import { NormalBlending, RepeatWrapping, ShaderMaterial, type Texture } from 'three';
import type { CarLamp, CarMaterialRecipe } from '../../../../../shared/types/scenes/car.js';
import { SUN_UNIT } from '../atmosphere/sunSamples.js';
import { lampStateFrames, litByEvent, switches, type LampSwitch } from './lampStates.js';

/** How a drawn lamp glows: its lamp emission, or the day intensity of the display material it is drawn with (`lampGlow`). */
export type LampGlow = NonNullable<CarLamp['emission']> | {displayIntensity: number};

/**
 * How a lamp glows, or null when it is not drawn. A lamp with a lamp emission glows by it. A lamp without one is drawn with a lit
 * shader: when that is the display material, it glows with the material's day intensity over its texture and vertex colour (the
 * lit light the display also takes is left out: the glow is far brighter). App assumption: replays are daytime only for now (the
 * sun stays above the horizon), so the night intensity is not used. Other lit lamps are not drawn.
 */
export function lampGlow(lamp: CarLamp, recipes: readonly CarMaterialRecipe[]): LampGlow | null {
  if (lamp.emission) return lamp.emission;
  const surface = recipes.find(recipe => recipe.name === lamp.material)?.surface;
  if (surface?.kind !== 'display') return null;
  const day = surface.parameters?.EmissiveDayIntensity;
  if (typeof day !== 'number' || !Number.isFinite(day) || day < 0) throw Error(`Lamp ${lamp.material}: the display material has no day intensity`);
  return {displayIntensity: day};
}

/**
 * Whether a lamp without a lamp emission is drawn as its own surface: a standard material that glows always (a daytime running
 * light). It draws with the car's other parts, lit whatever the lap's lamp state, rather than through a lamp frame.
 */
export function surfaceLamp(lamp: CarLamp, recipes: readonly CarMaterialRecipe[]): boolean {
  if (lamp.emission) return false;
  const surface = recipes.find(recipe => recipe.name === lamp.material)?.surface;
  return (surface?.kind === 'standard' || surface?.kind === 'standardBlend') && surface.flags?.emissive === 'always';
}

/**
 * The frame a lamp draws by default, or null when it is not drawn: only lamps whose `states.off` is known (or the lit frame of a
 * lamp lit by an event, `litByEvent`) are, and not when the package has no texture for that frame or the lamp has no glow (`lampGlow`).
 * `rainFlashes`: the body's rain lamps take the pit-lane flash (`rainLampsFlash`).
 */
export function lampFrame(lamp: CarLamp, rainFlashes: boolean, glow: LampGlow | null): string | null {
  // A lamp lit by an event without a dark frame is drawn from its lit frame and hidden while dark.
  const index = litByEvent(lamp, rainFlashes) ? lamp.states.off ?? lamp.states.on : lamp.states?.off;
  return !glow || index === null || index === undefined ? null : lamp.frames[index];
}

/** The texture files a drawn lamp loads: every state's frame that has a texture for a switching lamp, else the one frame it shows. */
export function lampTexturePaths(lamp: CarLamp, rainFlashes: boolean, glow: LampGlow): string[] {
  if (!switches(lamp, rainFlashes)) return [lampFrame(lamp, rainFlashes, glow)!];
  return lampStateFrames(lamp.states).flatMap(index => lamp.frames[index] ?? []);
}

/**
 * A lamp's glow, unlit, in the package's light unit and blended with its alpha when `blend` is alpha. A lamp emission gives
 * rgb = tex.rgb · scale · tex.a · (1 + gain · (N·V)^power), alpha tex.a; a display glow gives rgb = tex.rgb · colour.rgb · intensity,
 * alpha tex.a · colour.a (colour: the vertex colour). A lamp with states takes `switching`, its own texture per frame, which its car
 * swaps in. A lamp emission with vertex colour or ambient scaling is not supported yet, so it throws.
 */
export function createLampMaterial(lamp: CarLamp, glow: LampGlow, texture: Texture, switching?: LampSwitch): ShaderMaterial {
  const display = 'displayIntensity' in glow;
  const {scale, viewBoost} = display ? {scale: glow.displayIntensity, viewBoost: null} : glow;
  if (!display && (glow.vertexColour || glow.ambientScaled || glow.vertexAlpha)) throw Error(`Lamp ${lamp.material}: vertex colour and ambient scaled emission are not supported`);
  const alpha = lamp.blend === 'alpha';
  // `texture` is this material's own copy. Lamp UVs run outside 0..1 (a glow quad's v from 0 to -1), so the texture repeats as
  // car textures do; clamped, the whole glow would sample the texture's transparent edge.
  const frames = new Set([texture, ...switching?.maps.values() ?? []]);
  for (const map of frames) { map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; }
  const material = new ShaderMaterial({
    name: `lamp-${lamp.material}`,
    uniforms: {
      map: {value: texture}, scale: {value: scale * SUN_UNIT},
      boostGain: {value: viewBoost?.gain ?? 0}, boostPower: {value: viewBoost?.power ?? 1},
      // The material's own opacity (a ghost car fades its lamps with its body).
      opacity: {get value() { return material.opacity; }},
    },
    vertexShader: `
      ${display ? 'attribute vec4 _lmu_colour; varying vec4 vColour;' : ''}
      varying vec2 vUv; varying vec3 vNormal, vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - world.xyz);
        ${display ? 'vColour = _lmu_colour;' : ''}
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float scale, boostGain, boostPower, opacity;
      ${display ? 'varying vec4 vColour;' : ''}
      varying vec2 vUv; varying vec3 vNormal, vView;
      void main() {
        vec4 tex = texture2D(map, vUv);
        ${display
    ? `gl_FragColor = vec4(tex.rgb * vColour.rgb * scale, ${alpha ? 'tex.a * vColour.a' : '1.0'} * opacity);`
    : `float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
        gl_FragColor = vec4(tex.rgb * scale * tex.a * (1.0 + boostGain * pow(facing, boostPower)), ${alpha ? 'tex.a' : '1.0'} * opacity);`}
      }`,
    transparent: alpha, blending: NormalBlending, depthWrite: !alpha,
  });
  material.addEventListener('dispose', () => { for (const frame of frames) frame.dispose(); });
  if (switching) material.userData.lampSwitch = switching;
  return material;
}
