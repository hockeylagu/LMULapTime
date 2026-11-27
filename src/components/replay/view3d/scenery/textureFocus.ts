import type { IUniform, Texture } from 'three';
import type { ShaderPart } from '../shaders/composer.js';

/**
 * A streamed texture that sharpens (`mipStreaming.ts`) comes into focus over this long instead of in one frame: a car's livery
 * sharpening in a single step popped, and at a race start hundreds of them sharpen one after another.
 */
export const FOCUS_MS = 400;

/** Each texture fading in: the levels it drew without, and when it sharpened (performance.now() milliseconds). */
const fades = new WeakMap<Texture, {levels: number; startMs: number}>();
/** When the last fade begun ends: frames are drawn until then. */
let endMs = -Infinity;
/** The frame being drawn's time (`focusing`): every draw of the frame reads its focus at it, not the clock per draw. */
let frameMs = -Infinity;

/** The texture just sharpened, `levels` levels above those it drew from: it fades in from how it looked. */
export function startFocus(texture: Texture, levels: number, nowMs = performance.now()): void {
  if (levels <= 0) return;
  fades.set(texture, {levels, startMs: nowMs});
  endMs = Math.max(endMs, nowMs + FOCUS_MS);
}

/** How many levels the texture still holds back (fractional, eased): its levels at first, 0 once in focus or for another texture. */
export function focusOf(texture: unknown, nowMs = performance.now()): number {
  const fade = texture ? fades.get(texture as Texture) : undefined;
  if (!fade) return 0;
  const t = (nowMs - fade.startMs) / FOCUS_MS;
  if (t >= 1) { fades.delete(texture as Texture); return 0; }
  return fade.levels * (1 - Math.max(0, t) ** 2 * (3 - 2 * Math.max(0, t)));
}

/** Whether a texture is still coming into focus: the scene draws another frame. Called once per frame, before it draws: its time. */
export function focusing(nowMs = performance.now()): boolean {
  frameMs = nowMs;
  return nowMs < endMs;
}

/**
 * Sampling at a level no finer than `focus` levels below the top: the gradients scaled up so that the level picked is the coarser of
 * the footprint's and `focus` (the level the reduced texture's top stood for), anisotropic filtering kept. At 0, plain sampling.
 */
const FOCUS_GLSL = `
vec4 focusTexture(sampler2D map2D, float focus, vec2 uv) {
  // One return, the result set on both branches: a return inside the branch drew a warning from the D3D shader compiler.
  vec4 sampled = vec4(0.0);
  if (focus <= 0.0) {
    sampled = texture(map2D, uv);
  } else {
    vec2 size = vec2(textureSize(map2D, 0)), dx = dFdx(uv), dy = dFdy(uv);
    float level = 0.5 * log2(max(max(dot(dx * size, dx * size), dot(dy * size, dy * size)), 1e-12));
    float scale = exp2(max(0.0, focus - level));
    sampled = textureGrad(map2D, uv, dx * scale, dy * scale);
  }
  return sampled;
}`;

/** A lookup of sampler `name` at `uv` that fades in as its texture sharpens (its `focus_<name>`, `textureFocusUniforms`). */
export const focusedLookup = (name: string, uv: string): string => `focusTexture(${name}, focus_${name}, ${uv})`;

/** The declarations the lookups of `names` read: each sampler's focus and the sampling function. */
export function textureFocusDeclarations(names: readonly string[]): string {
  return `${names.map(name => `uniform float focus_${name};`).join('\n')}\n${FOCUS_GLSL}`;
}

/** Each sampler's `focus_<name>`, read from the texture it holds at each draw, at the time of the frame (`focusing`). */
export function textureFocusUniforms(samplers: Readonly<Record<string, IUniform>>): Record<string, IUniform<number>> {
  return Object.fromEntries(Object.entries(samplers).map(([name, sampler]) =>
    [`focus_${name}`, {get value() { return frameMs < endMs ? focusOf(sampler.value, frameMs) : 0; }}]));
}

/**
 * The fade-in of a composed program's lookups written with `focusedLookup`: the sampling function and each sampler's focus, for the
 * samplers given (the material's own uniforms), declared ahead of the parts' own functions.
 */
export function textureFocusPart(samplers: Readonly<Record<string, IUniform>>): ShaderPart {
  const names = Object.keys(samplers).sort();
  return {
    name: 'textureFocus',
    slots: {fragmentPars: {at: -100, glsl: textureFocusDeclarations(names)}},
    uniforms: () => textureFocusUniforms(samplers),
  };
}
