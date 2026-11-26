import { NormalBlending, RepeatWrapping, ShaderMaterial, type Texture } from 'three';
import type { CarLamp, CarMaterialRecipe } from '../../../../../shared/types/scenes/car.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { sceneDayLight, screenStrength } from '../scene/dayLight.js';
import { lampStateFrames, litByEvent, switches, type LampSwitch } from './lampStates.js';

/** How a drawn lamp glows: its lamp emission, or the night and day strengths of the dashboard screen material it is drawn with (`lampGlow`). */
export type LampGlow = NonNullable<CarLamp['emission']> | {displayIntensity: number; displayNight: number};

/**
 * How a lamp glows, or null when it is not drawn. A lamp with a lamp emission glows by it. A lamp without one is drawn with a lit
 * shader: when that is a dashboard screen material, it glows as the screen does, between its night and day strengths
 * (`dashboard.emissiveNight`, `emissiveStrength`) by the scene's day share, over its texture and vertex colour (the lit light the
 * screen also takes is left out: the glow is far brighter). Other lit lamps are not drawn.
 */
export function lampGlow(lamp: CarLamp, recipes: readonly CarMaterialRecipe[]): LampGlow | null {
  if (lamp.emission) return lamp.emission;
  const surface = recipes.find(recipe => recipe.name === lamp.material)?.surface;
  if (surface?.kind !== 'dashboard') return null;
  const screen = surface.parameters?.dashboard as {emissiveStrength?: unknown; emissiveNight?: unknown} | undefined;
  const strength = (value: unknown, which: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error(`Lamp ${lamp.material}: the screen material has no ${which} strength`);
    return value;
  };
  return {displayIntensity: strength(screen?.emissiveStrength, 'day'), displayNight: strength(screen?.emissiveNight, 'night')};
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
 * The lamp's texture coordinate, read at the multisample centroid: a pixel that a thin glow strip (a badge outline) only partly
 * covers is otherwise shaded at its centre, outside the triangle, and the extrapolated coordinate reads a neighbouring lamp's
 * texels on the atlas (a tail lamp's red on a white outline seen from afar).
 */
const LAMP_UV = 'centroid varying vec2 vUv';

/**
 * A lamp's glow, unlit, in the package's light unit and blended with its alpha when `blend` is alpha. A lamp emission gives
 * rgb = tex.rgb · scale · tex.a · (1 + gain · (N·V)^power), alpha tex.a; a display glow gives rgb = tex.rgb · colour.rgb · intensity,
 * alpha tex.a · colour.a (colour: the vertex colour, white without `vertexColour`). A lamp with states takes `switching`, its own texture per frame, which its car
 * swaps in. A lamp emission with vertex colour or ambient scaling is not supported yet, so it throws.
 */
export function createLampMaterial(lamp: CarLamp, glow: LampGlow, texture: Texture, switching?: LampSwitch, vertexColour = true): ShaderMaterial {
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
      // A display glow follows the scene's day share as its screen does.
      map: {value: texture}, scale: display ? {get value() { return screenStrength(glow.displayNight, glow.displayIntensity, sceneDayLight.value) * GAME_LIGHT_UNIT; }} : {value: scale * GAME_LIGHT_UNIT},
      boostGain: {value: viewBoost?.gain ?? 0}, boostPower: {value: viewBoost?.power ?? 1},
      // The material's own opacity (a ghost car fades its lamps with its body).
      opacity: {get value() { return material.opacity; }},
    },
    vertexShader: `
      ${display ? `${vertexColour ? 'attribute vec4 _lmu_colour;' : 'const vec4 _lmu_colour = vec4(1.0);'} varying vec4 vColour;` : ''}
      ${LAMP_UV}; varying vec3 vNormal, vView;
      void main() {
        // An instanced lamp (a far car's glow, \`farGlows\`) places each car's copy by its instance matrix.
        vec4 local = vec4(position, 1.0); vec3 facing = normal;
        #ifdef USE_INSTANCING
        local = instanceMatrix * local; facing = mat3(instanceMatrix) * facing;
        #endif
        vec4 world = modelMatrix * local;
        vUv = uv; vNormal = normalize(mat3(modelMatrix) * facing); vView = normalize(cameraPosition - world.xyz);
        ${display ? 'vColour = _lmu_colour;' : ''}
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float scale, boostGain, boostPower, opacity;
      ${display ? 'varying vec4 vColour;' : ''}
      ${LAMP_UV}; varying vec3 vNormal, vView;
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
