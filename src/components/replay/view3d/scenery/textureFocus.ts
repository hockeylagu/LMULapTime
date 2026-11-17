import type { IUniform, Texture } from 'three';

/**
 * A streamed texture that sharpens (`mipStreaming.ts`) comes into focus over this long instead of in one frame: a car's livery
 * sharpening in a single step popped, and at a race start hundreds of them sharpen one after another.
 */
export const FOCUS_MS = 400;

/** Each texture fading in: the levels it drew without, and when it sharpened (performance.now() milliseconds). */
const fades = new WeakMap<Texture, {levels: number; startMs: number}>();
/** When the last fade begun ends: frames are drawn until then. */
let endMs = -Infinity;

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

/** Whether a texture is still coming into focus: the scene draws another frame. */
export function focusing(nowMs = performance.now()): boolean {
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
const COMMON = '#include <common>';

/**
 * Makes a fragment program's `texture2D` lookups of `samplers` (uniforms of `shader`) fade in as their textures sharpen: each
 * sampler gets a `focus_<name>` uniform read from the texture it holds at each draw. A sampler the program does not read is
 * left as it is; run after the program's own patches, with the lookups written out (not behind an include).
 */
export function patchTextureFocus(shader: {fragmentShader: string; uniforms: Record<string, IUniform>}, samplers: readonly string[]): void {
  const read = new Set<string>();
  const wanted = new Set(samplers.filter(name => shader.uniforms[name] !== undefined));
  shader.fragmentShader = shader.fragmentShader.replace(/texture2D\(\s*(\w+)\s*,/g, (lookup, name: string) => {
    if (!wanted.has(name)) return lookup;
    read.add(name);
    return `focusTexture(${name}, focus_${name},`;
  });
  if (!read.size) return;
  // With three's common declarations, ahead of the program's own functions (a lookup can sit in one of them).
  if (!shader.fragmentShader.includes(COMMON)) throw Error('A program to fade in has no common include');
  const declarations = [...read].map(name => `uniform float focus_${name};`).join('\n');
  shader.fragmentShader = shader.fragmentShader.replace(COMMON, () => `${COMMON}\n${declarations}\n${FOCUS_GLSL}`);
  for (const name of read) {
    const sampler = shader.uniforms[name];
    shader.uniforms[`focus_${name}`] = {get value() { return focusOf(sampler.value); }};
  }
}
