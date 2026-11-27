import { HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type IUniform, type Texture, type WebGLRenderer } from 'three';
import type { SceneryBloomChain, SceneryBloomLook, SceneryBloomType } from '../../../../shared/packageContract/index.js';

// The camera's bloom, as the package states the chain (the pipeline's docs/SCENE_PACKAGE.md, Bloom): a bright pass of the exposed
// scene at the first level, Gaussian blurs at three levels, their sum times the merge gain, drawn up to the output size; the canvas
// pass adds it after the tone curve as tone + (1 − tone) · saturate(bloom). Every value is the package's.

/** One look's bloom, ready for the passes: the bright pass threshold, knee and weight, and the merge gain. */
export interface BloomParameters { threshold: number; knee: number; weight: number; gain: number }

/**
 * The bright pass and merge values of a look under a camera type: with s = max(remapFactor, 0.001), knee k = 4 / s² − 2 and weight
 * (s² / 2) / (64 · rangeScale); gain = 64 · rangeScale · mergeScale · the low tier's glareLuminance · shapeLuminance · the look's
 * luminance. The low tier is the player's in-game Post Effects quality, which the reference night captures were taken at (user, 2026-11-26).
 */
export function bloomParameters(look: SceneryBloomLook, type: SceneryBloomType, chain: SceneryBloomChain): BloomParameters {
  const s = Math.max(look.remapFactor, 0.001);
  return {
    threshold: look.threshold, knee: 4 / (s * s) - 2, weight: s * s / 2 / (64 * type.rangeScale),
    gain: 64 * type.rangeScale * chain.mergeScale * type.quality.low.glareLuminance * type.shapeLuminance * look.luminance,
  };
}

/** The weights of a Gaussian blur's centre and taps 1..radius on one side, normalised over all 2 · radius + 1 taps. */
export function blurWeights(sigma: number, radius: number): number[] {
  const w = Array.from({length: radius + 1}, (_, i) => Math.exp(-i * i / (2 * sigma * sigma)));
  const total = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  return w.map(v => v / total);
}

/** The largest finite value of the HDR target's half floats: a brighter pixel stores as infinity. */
const HALF_MAX = 65504;

/** What the canvas pass needs of the exposure to expose the scene as it does: its state uniform and the GLSL that reads it. */
export interface BloomExposure { uniform: IUniform<Texture | null>; glsl: string }

export interface Bloom {
  /** Draws the bloom of `source` (the frame's linear HDR colour, `width` × `height`) for this frame and returns it, at the output size. */
  render(renderer: WebGLRenderer, source: Texture, width: number, height: number): Texture;
  /** The active look's values. */
  set(parameters: BloomParameters): void;
  /** Links the programs off the main thread (as the canvas pass does). */
  link(renderer: WebGLRenderer): Promise<void>;
  dispose(): void;
}

const VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
/** The name of the bloom's full-screen scene, which is not the replay scene. */
export const BLOOM_PASS = 'bloom-pass';

export function createBloom(chain: SceneryBloomChain, exposure: BloomExposure): Bloom {
  const level = () => new WebGLRenderTarget(1, 1, {type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false});
  const t = {
    half: level(), quarter: level(), bright: level(), temp0: level(), a: level(), b: level(),
    down1: level(), temp1: level(), c: level(), down2: level(), temp2: level(), d: level(), sum: level(), out: level(),
  };
  const quad = new PlaneGeometry(2, 2), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new Scene(), mesh = new Mesh(quad);
  scene.name = BLOOM_PASS; scene.add(mesh);
  const pass =(fragmentShader: string, uniforms: Record<string, IUniform>) =>
    new ShaderMaterial({vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false});
  // A reduction: four bilinear taps half a source texel off the centre, which on a 2:1 step is the 2 × 2 block's mean. One tap
  // skipped source texels on the uneven steps (an odd size, the quarter to the first level), so a distant lamp a pixel wide went in
  // and out of the bloom from frame to frame as it moved.
  const REDUCE = `uniform sampler2D source; uniform vec2 texel; varying vec2 vUv;
    vec3 reduced() {
      return 0.25 * (texture2D(source, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(source, vUv + texel * vec2(0.5, -0.5)).rgb
        + texture2D(source, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(source, vUv + texel * vec2(0.5, 0.5)).rgb);
    }`;
  const copy = pass(`${REDUCE}\nvoid main() { gl_FragColor = vec4(reduced(), 1.0); }`, {source: {value: null}, texel: {value: new Vector2()}});
  // The first reduction (four texels to one) weighs each texel by 1 / (1 + its exposed brightness): a lone bright texel (a distant
  // bulb smaller than a pixel, which the raster catches on some frames and misses on others) no longer outweighs its block, so its
  // halo does not pop in and out; a block bright all over keeps its full value.
  const first = pass(`
    uniform sampler2D source; uniform vec2 texel; varying vec2 vUv;
    ${exposure.glsl}
    void main() {
      float e = displayExposure(); vec3 sum = vec3(0.0); float total = 0.0;
      for (int i = 0; i < 4; i++) {
        // Clamped at the half float's largest value: a texel that overflowed to infinity would weigh 0 and make inf · 0, NaN, which the
        // blurs would spread.
        vec3 c = clamp(texture2D(source, vUv + texel * vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5)).rgb, 0.0, ${HALF_MAX.toFixed(1)});
        float w = 1.0 / (1.0 + e * (c.r + c.g + c.b) / 3.0);
        sum += c * w; total += w;
      }
      gl_FragColor = vec4(sum / total, 1.0);
    }`, {source: {value: null}, texel: {value: new Vector2()}, exposure_state: exposure.uniform});
  // The bright pass of an exposed colour (the white balance comes after the composite): 0 at or under the threshold.
  const bright = pass(`
    ${REDUCE}
    uniform vec3 shape;
    ${exposure.glsl}
    void main() {
      vec3 c = max(reduced() * displayExposure(), 0.0);
      float L = (c.r + c.g + c.b) / 3.0, t = max(L - shape.x, 0.0);
      gl_FragColor = vec4(t > 0.0 ? c / L * (t + sqrt(t * (t + shape.y) + 1.0) - 1.0) * shape.z : vec3(0.0), 1.0);
    }`, {source: {value: null}, texel: {value: new Vector2()}, exposure_state: exposure.uniform, shape: {value: new Vector3()}});
  const weights = (scale: number) => {
    const channels = chain.blurSigma.map(sigma => blurWeights(sigma * scale, chain.blurRadius));
    return channels[0].map((_, i) => new Vector3(channels[0][i], channels[1][i], channels[2][i]));
  };
  const blurShader = `
    uniform sampler2D source; uniform vec2 step; uniform vec3 weights[${chain.blurRadius + 1}]; varying vec2 vUv;
    void main() {
      vec3 sum = texture2D(source, vUv).rgb * weights[0];
      for (int i = 1; i <= ${chain.blurRadius}; i++) sum += (texture2D(source, vUv + step * float(i)).rgb + texture2D(source, vUv - step * float(i)).rgb) * weights[i];
      gl_FragColor = vec4(sum, 1.0);
    }`;
  const narrow = pass(blurShader, {source: {value: null}, step: {value: new Vector2()}, weights: {value: weights(1)}});
  const wide = pass(blurShader, {source: {value: null}, step: {value: new Vector2()}, weights: {value: weights(chain.wideBlurScale)}});
  const sum = pass(`
    uniform sampler2D a, b, c, d; uniform float gain; varying vec2 vUv;
    void main() { gl_FragColor = vec4(gain * (texture2D(a, vUv).rgb + texture2D(b, vUv).rgb + texture2D(c, vUv).rgb + texture2D(d, vUv).rgb), 1.0); }`,
  {a: {value: t.a.texture}, b: {value: t.b.texture}, c: {value: t.c.texture}, d: {value: t.d.texture}, gain: {value: 0}});
  // Up to the output size: four bilinear taps half a destination texel off the centre.
  const up = pass(`
    uniform sampler2D source; uniform vec2 texel; varying vec2 vUv;
    void main() {
      vec3 s = texture2D(source, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(source, vUv + texel * vec2(0.5, -0.5)).rgb
        + texture2D(source, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(source, vUv + texel * vec2(0.5, 0.5)).rgb;
      gl_FragColor = vec4(s * 0.25, 1.0);
    }`, {source: {value: t.sum.texture}, texel: {value: new Vector2()}});
  const materials = [copy, first, bright, narrow, wide, sum, up];

  let width = 0, height = 0;
  const resize = (w: number, h: number) => {
    width = w; height = h;
    const at = (f: number): [number, number] => [Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f))];
    const [first, second, third] = chain.levelScales;
    t.half.setSize(...at(1 / 2)); t.quarter.setSize(...at(1 / 4));
    for (const r of [t.bright, t.temp0, t.a, t.b, t.sum]) r.setSize(...at(first));
    for (const r of [t.down1, t.temp1, t.c]) r.setSize(...at(second));
    for (const r of [t.down2, t.temp2, t.d]) r.setSize(...at(third));
    t.out.setSize(...at(chain.outputScale));
    (up.uniforms.texel.value as Vector2).set(1 / t.out.width, 1 / t.out.height);
  };
  const draw = (renderer: WebGLRenderer, material: ShaderMaterial, to: WebGLRenderTarget, source?: Texture) => {
    if (source) material.uniforms.source.value = source;
    mesh.material = material; renderer.setRenderTarget(to); renderer.render(scene, camera);
  };
  /** A reduction of `source` (`sourceWidth` × `sourceHeight`) into `to`. */
  const reduce = (renderer: WebGLRenderer, material: ShaderMaterial, to: WebGLRenderTarget, source: Texture, sourceWidth: number, sourceHeight: number) => {
    (material.uniforms.texel.value as Vector2).set(1 / sourceWidth, 1 / sourceHeight);
    draw(renderer, material, to, source);
  };
  const reduceTarget = (renderer: WebGLRenderer, material: ShaderMaterial, to: WebGLRenderTarget, from: WebGLRenderTarget) =>
    reduce(renderer, material, to, from.texture, from.width, from.height);
  const blur = (renderer: WebGLRenderer, material: ShaderMaterial, from: WebGLRenderTarget, temp: WebGLRenderTarget, to: WebGLRenderTarget) => {
    const step = material.uniforms.step.value as Vector2;
    step.set(1 / from.width, 0); draw(renderer, material, temp, from.texture);
    step.set(0, 1 / from.height); draw(renderer, material, to, temp.texture);
  };

  return {
    render(renderer, source, w, h) {
      if (w !== width || h !== height) resize(w, h);
      reduce(renderer, first, t.half, source, w, h); reduceTarget(renderer, copy, t.quarter, t.half);
      reduceTarget(renderer, bright, t.bright, t.quarter);
      blur(renderer, narrow, t.bright, t.temp0, t.a);
      blur(renderer, wide, t.a, t.temp0, t.b);
      reduceTarget(renderer, copy, t.down1, t.b); blur(renderer, wide, t.down1, t.temp1, t.c);
      reduceTarget(renderer, copy, t.down2, t.c); blur(renderer, wide, t.down2, t.temp2, t.d);
      draw(renderer, sum, t.sum); draw(renderer, up, t.out);
      return t.out.texture;
    },
    set(p) {
      (bright.uniforms.shape.value as Vector3).set(p.threshold, p.knee, p.weight);
      sum.uniforms.gain.value = p.gain;
    },
    link(renderer) {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(t.bright);
      const linking = materials.map(material => { mesh.material = material; return renderer.compileAsync(scene, camera); });
      renderer.setRenderTarget(previous);
      return Promise.all(linking).then(() => {});
    },
    dispose() { for (const r of Object.values(t)) r.dispose(); for (const m of materials) m.dispose(); quad.dispose(); },
  };
}
