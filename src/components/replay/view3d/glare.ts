import { CustomBlending, HalfFloatType, LinearFilter, Mesh, OneFactor, OrthographicCamera, PlaneGeometry, ShaderMaterial, Vector2, WebGLRenderTarget, type Matrix3, type Texture, type WebGLRenderer } from 'three';

/**
 * Glare: a bloom of what exceeds the camera's glare threshold (SceneryCamera, in exposed luminance), so only what the tone curve
 * shows near white (sun on chrome and glass, white paint and lines in full sun) glows. The exposure pass composites it after the
 * tone curve as tone + (1 − tone)·glare. GLARE_GAIN, the strength, is the app's own, set by eye; no star streaks.
 */
export const GLARE_GAIN = 0.5;
/** Mip levels below the half-resolution bright pass: each halves the size, so the widest glow spans 1/64 of the frame per texel. */
const LEVELS = 5;

const VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
/** Four bilinear taps one source texel off each diagonal: a 4 × 4 texel box, the standard downsample of a bloom chain. */
const BOX = `vec3 box(sampler2D image, vec2 texel) {
  return 0.25 * (texture2D(image, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(image, vUv + texel * vec2(1.0, -1.0)).rgb
    + texture2D(image, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(image, vUv + texel * vec2(1.0, 1.0)).rgb);
}`;

export interface Glare {
  /** The glow at half resolution: every level summed, in exposed linear units. */
  readonly texture: Texture;
  /** The factor that averages the levels and applies GAIN: the composite shows 1 − e^(−scale·texture). */
  readonly scale: number;
  /** Extracts what exceeds the threshold from the HDR frame, exposed and white-balanced as the canvas pass does, and blurs it. */
  render(source: Texture, exposure: number, whiteBalance: Matrix3): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createGlare(renderer: WebGLRenderer, threshold: number): Glare {
  const levels = Array.from({length: LEVELS + 1}, () => new WebGLRenderTarget(1, 1, {type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter}));
  const bright = new ShaderMaterial({
    uniforms: {source: {value: null}, texel: {value: new Vector2()}, exposure: {value: 1}, whiteBalance: {value: null}},
    vertexShader: VERTEX,
    fragmentShader: `
      uniform sampler2D source; uniform vec2 texel; uniform float exposure; uniform mat3 whiteBalance; varying vec2 vUv;
      ${BOX}
      void main() {
        vec3 c = whiteBalance * box(source, texel) * exposure;
        float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(c * max(luminance - ${threshold.toFixed(3)}, 0.0) / max(luminance, 1e-4), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const down = new ShaderMaterial({
    uniforms: {source: {value: null}, texel: {value: new Vector2()}},
    vertexShader: VERTEX,
    fragmentShader: `uniform sampler2D source; uniform vec2 texel; varying vec2 vUv; ${BOX} void main() { gl_FragColor = vec4(box(source, texel), 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  // Upsampling adds each smaller level, through a 3 × 3 tent, onto the next larger one: the first level ends with all of them.
  const up = new ShaderMaterial({
    uniforms: {source: {value: null}, texel: {value: new Vector2()}},
    vertexShader: VERTEX,
    fragmentShader: `
      uniform sampler2D source; uniform vec2 texel; varying vec2 vUv;
      void main() {
        vec3 sum = vec3(0.0);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) sum += texture2D(source, vUv + texel * vec2(i, j)).rgb * float((2 - abs(i)) * (2 - abs(j)));
        gl_FragColor = vec4(sum / 16.0, 1.0);
      }`,
    depthTest: false, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor,
  });
  // Full-screen passes draw the quad on its own, as three's FullScreenQuad does.
  const quad = new Mesh(new PlaneGeometry(2, 2), bright), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (material: ShaderMaterial, source: Texture, sourceSize: Vector2, target: WebGLRenderTarget) => {
    quad.material = material;
    material.uniforms.source.value = source; (material.uniforms.texel.value as Vector2).set(1 / sourceSize.x, 1 / sourceSize.y);
    renderer.setRenderTarget(target); renderer.render(quad, camera);
  };
  const sourceSize = new Vector2(1, 1), levelSize = (target: WebGLRenderTarget) => new Vector2(target.width, target.height);
  return {
    texture: levels[0].texture, scale: GLARE_GAIN / (LEVELS + 1),
    render(source, exposure, whiteBalance) {
      const autoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        bright.uniforms.exposure.value = exposure; bright.uniforms.whiteBalance.value = whiteBalance;
        pass(bright, source, sourceSize, levels[0]);
        for (let i = 1; i <= LEVELS; i++) pass(down, levels[i - 1].texture, levelSize(levels[i - 1]), levels[i]);
        renderer.autoClear = false;
        for (let i = LEVELS - 1; i >= 0; i--) pass(up, levels[i + 1].texture, levelSize(levels[i + 1]), levels[i]);
      } finally { renderer.autoClear = autoClear; }
    },
    setSize(width, height) {
      sourceSize.set(width, height);
      levels.forEach((target, i) => target.setSize(Math.max(1, width >> (i + 1)), Math.max(1, height >> (i + 1))));
    },
    dispose() {
      for (const target of levels) target.dispose();
      quad.geometry.dispose(); bright.dispose(); down.dispose(); up.dispose();
    },
  };
}
