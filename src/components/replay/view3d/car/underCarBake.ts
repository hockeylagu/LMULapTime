import {
  Box3, Color, DoubleSide, HalfFloatType, LinearFilter, Matrix4, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector3, Vector4,
  WebGLRenderTarget, type BufferGeometry, type Camera, type Object3D,
} from 'three';

/** Texels per side of the baked maps, and how much of the car's frame the maps cover beyond its length (half on each end). */
export const BAKE_TEXELS = 512, BAKE_MARGIN_M = 1;
/** Heights above SKY_LIMIT_M are open sky (the height map clears to SKY_HEIGHT_M); a sample counts at most HEIGHT_CAP_M high, less HEIGHT_BIAS_M. */
export const SKY_LIMIT_M = 5, SKY_HEIGHT_M = 100, HEIGHT_CAP_M = 0.5, HEIGHT_BIAS_M = 0.1;
/** Each texel looks along AZIMUTHS directions, turned together by up to AZIMUTH_JITTER_RAD, out to REACH_M. */
export const AZIMUTHS = 32, AZIMUTH_JITTER_RAD = 0.2, REACH_M = 1;
/** The edge fade: nothing within FADE_START_M of the footprint, full strength FADE_SPAN_M further out; the output floor and gain. */
export const FADE_START_M = 0.1, FADE_SPAN_M = 0.4, OUTPUT_FLOOR = 0.05, OUTPUT_GAIN = 1.15;
/** The name of the quad this bake feeds; the height pass leaves it out. */
export const CONTACT_SHADOW_NAME = 'contact-shadow';

const HALF_PI = Math.PI / 2;

/** What a bake uses of the renderer (a `WebGLRenderer` satisfies it). */
export interface BakeRenderer {
  autoClear: boolean;
  getRenderTarget(): WebGLRenderTarget | null;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  getClearColor(target: Color): Color;
  getClearAlpha(): number;
  setClearColor(color: Color, alpha?: number): void;
  getViewport(target: Vector4): Vector4;
  setViewport(viewport: Vector4): void;
  render(scene: Object3D, camera: Camera): void;
}

/** The square the maps cover: the footprint's centre, its lowest height, and a side one margin longer than the car. */
export function bakeArea(bounds: Box3): {centreX: number; centreZ: number; minY: number; size: number} {
  return {
    centreX: (bounds.min.x + bounds.max.x) / 2, centreZ: (bounds.min.z + bounds.max.z) / 2, minY: bounds.min.y,
    size: Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + BAKE_MARGIN_M,
  };
}

/**
 * The camera of the height pass, in the car's frame (`local`): one metre under the footprint, looking straight up, right = +X and
 * up = +Z, so a texel's column grows with x and its row with z (no mirroring). Depth grows upward, so the lowest surface wins.
 */
export function bakeCamera(bounds: Box3): {camera: OrthographicCamera; local: Matrix4} {
  const {centreX, centreZ, minY, size} = bakeArea(bounds);
  const camera = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.01, 2 + bounds.max.y - minY);
  const local = new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)).setPosition(centreX, minY - 1, centreZ);
  return {camera, local};
}

/** The flat quad over the maps (normal up, `size` metres square, about the origin) whose UVs read each point's own texel. */
export function underCarQuadGeometry(size: number): PlaneGeometry {
  const geometry = new PlaneGeometry(size, size).rotateX(-Math.PI / 2), position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / size + 0.5, position.getZ(i) / size + 0.5);
  return geometry;
}

/** The texel's pseudo-random turn of the azimuth set (0 to AZIMUTH_JITTER_RAD); the shader hashes the same way. */
export function azimuthJitter(column: number, row: number): number {
  const s = Math.sin(column * 12.9898 + row * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * AZIMUTH_JITTER_RAD;
}

/**
 * Reference of the occlusion pass for one texel of a `texels`-square height map `heights` (metres above the contact plane, row
 * major, SKY_HEIGHT_M for open sky) covering `size` metres: the stored value, 1 = open sky (no shadow) down to OUTPUT_FLOOR.
 * `halfX` / `halfZ` are the footprint's half extents about the map's centre. The shader mirrors it step by step.
 */
export function underCarStored(heights: ArrayLike<number>, texels: number, size: number, column: number, row: number, halfX: number, halfZ: number): number {
  const metresPerTexel = size / texels, steps = Math.ceil(REACH_M / metresPerTexel), jitter = azimuthJitter(column, row);
  const heightAt = (c: number, r: number) => c < 0 || r < 0 || c >= texels || r >= texels ? SKY_HEIGHT_M : heights[r * texels + c];
  const selfSky = heightAt(column, row) - HEIGHT_BIAS_M > SKY_LIMIT_M;
  let occlusion = 0;
  for (let a = 0; a < AZIMUTHS; a++) {
    const azimuth = a / AZIMUTHS * 2 * Math.PI + jitter, dx = Math.cos(azimuth), dy = Math.sin(azimuth);
    let maxCar = 0, open = selfSky, start = 0, sum = 0;
    for (let k = 1; k <= steps; k++) {
      let h = Math.max(0, heightAt(Math.floor(column + 0.5 + dx * k), Math.floor(row + 0.5 + dy * k)) - HEIGHT_BIAS_M);
      const sky = h > SKY_LIMIT_M;
      h = sky ? HEIGHT_CAP_M : Math.min(h, HEIGHT_CAP_M);
      const angle = Math.atan2(k * metresPerTexel, h); // From straight up (0) to the horizon (a quarter turn).
      if (sky && angle > maxCar) { if (!open) { open = true; start = angle; } }
      else {
        if (!sky) maxCar = Math.max(maxCar, angle);
        if (open) { sum += Math.max(0, angle - start); open = false; }
      }
    }
    if (open) sum += HALF_PI - start;
    occlusion += Math.min(Math.max(sum / HALF_PI, 0), 1);
  }
  occlusion /= AZIMUTHS;
  const x = Math.abs(((column + 0.5) / texels - 0.5) * size), z = Math.abs(((row + 0.5) / texels - 0.5) * size);
  const outside = Math.hypot(Math.max(x - halfX, 0), Math.max(z - halfZ, 0));
  const fade = (Math.min(Math.max(outside - FADE_START_M, 0), 1) / FADE_SPAN_M) ** 2;
  return Math.min(1, OUTPUT_FLOOR + OUTPUT_GAIN * Math.min(Math.max(occlusion + fade, 0), 1));
}

/** The height pass: each fragment writes its height above the contact plane (parts are placed in the car's frame, which is the camera's world). */
export const HEIGHT_VERTEX = /* glsl */ `
uniform float uMinY;
varying float vHeight;
void main() {
  vHeight = (modelMatrix * vec4(position, 1.0)).y - uMinY;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const HEIGHT_FRAGMENT = /* glsl */ `
varying float vHeight;
void main() { gl_FragColor = vec4(vHeight, 0.0, 0.0, 1.0); }`;

/** The occlusion pass (mirrors `underCarStored`); writes the shadow's darkness, 1 - stored, to every channel. */
export const OCCLUSION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const OCCLUSION_FRAGMENT = /* glsl */ `
uniform sampler2D uHeights;
uniform float uTexels, uSize, uHalfX, uHalfZ;
varying vec2 vUv;
const int AZIMUTHS = ${AZIMUTHS};
const float SKY_LIMIT = ${SKY_LIMIT_M.toFixed(1)}, SKY_HEIGHT = ${SKY_HEIGHT_M.toFixed(1)}, HEIGHT_CAP = ${HEIGHT_CAP_M.toFixed(1)}, HEIGHT_BIAS = ${HEIGHT_BIAS_M.toFixed(1)};
const float HALF_PI = 1.5707963, JITTER = ${AZIMUTH_JITTER_RAD.toFixed(1)}, REACH = ${REACH_M.toFixed(1)};
float heightAt(vec2 texel) {
  if (texel.x < 0.0 || texel.y < 0.0 || texel.x >= uTexels || texel.y >= uTexels) return SKY_HEIGHT;
  return texture2D(uHeights, (texel + 0.5) / uTexels).r;
}
void main() {
  vec2 texel = floor(vUv * uTexels);
  float metresPerTexel = uSize / uTexels;
  int steps = int(ceil(REACH / metresPerTexel));
  float jitter = fract(sin(texel.x * 12.9898 + texel.y * 78.233) * 43758.5453) * JITTER;
  bool selfSky = heightAt(texel) - HEIGHT_BIAS > SKY_LIMIT;
  float occlusion = 0.0;
  for (int a = 0; a < AZIMUTHS; a++) {
    float azimuth = float(a) / float(AZIMUTHS) * 6.2831853 + jitter;
    vec2 direction = vec2(cos(azimuth), sin(azimuth));
    float maxCar = 0.0, start = 0.0, sum = 0.0;
    bool open = selfSky;
    for (int k = 1; k <= 256; k++) {
      if (k > steps) break;
      float h = max(0.0, heightAt(floor(texel + 0.5 + direction * float(k))) - HEIGHT_BIAS);
      bool sky = h > SKY_LIMIT;
      h = sky ? HEIGHT_CAP : min(h, HEIGHT_CAP);
      float angle = atan(float(k) * metresPerTexel, h);
      if (sky && angle > maxCar) { if (!open) { open = true; start = angle; } }
      else {
        if (!sky) maxCar = max(maxCar, angle);
        if (open) { sum += max(0.0, angle - start); open = false; }
      }
    }
    if (open) sum += HALF_PI - start;
    occlusion += clamp(sum / HALF_PI, 0.0, 1.0);
  }
  occlusion /= float(AZIMUTHS);
  vec2 p = abs((texel + 0.5) / uTexels - 0.5) * uSize;
  float outside = length(max(p - vec2(uHalfX, uHalfZ), 0.0));
  float fade = pow(clamp(outside - ${FADE_START_M.toFixed(1)}, 0.0, 1.0) / ${FADE_SPAN_M.toFixed(1)}, 2.0);
  float stored = min(1.0, ${OUTPUT_FLOOR} + ${OUTPUT_GAIN} * clamp(occlusion + fade, 0.0, 1.0));
  gl_FragColor = vec4(vec3(1.0 - stored), 1.0);
}`;

/** Whether a mesh belongs to the exterior seen up close: not a driver-view part and drawn from 0 m, on itself or any ancestor below `model`. */
function isCloseExterior(mesh: Object3D, model: Object3D): boolean {
  for (let node: Object3D | null = mesh; node && node !== model; node = node.parent) {
    if (node.userData.cockpitView === 'in') return false;
    const range = node.userData.lod as {inM?: number} | undefined;
    if (range && (range.inM ?? 0) > 0) return false;
  }
  return true;
}

/** The mesh's transform in the car's frame, from the local matrices of its chain (whatever is visible or shown now). */
function frameMatrix(mesh: Object3D, model: Object3D): Matrix4 {
  const matrix = new Matrix4();
  for (let node: Object3D | null = mesh; node && node !== model; node = node.parent) { node.updateMatrix(); matrix.premultiply(node.matrix); }
  return matrix;
}

/**
 * Bakes the shade under a car: the exterior parts seen up close, drawn from below into a height map (the lowest surface wins),
 * then an occlusion pass over it. `model` is the car in its own frame and `bounds` its footprint there. The parts are drawn as
 * proxy meshes (shared geometry, placed from their local matrices) so no current visibility or per-frame state matters. Returns
 * the darkness map (the caller owns it); the renderer's target, clear colour, auto clear and viewport are put back.
 */
export function bakeUnderCar(renderer: BakeRenderer, model: Object3D, bounds: Box3): WebGLRenderTarget {
  const {camera, local} = bakeCamera(bounds), {minY, size} = bakeArea(bounds);
  camera.matrixWorldAutoUpdate = false; // The camera lives in the car's frame, which is the proxy scene's world.
  camera.matrixWorld.copy(local); camera.matrixWorldInverse.copy(local).invert();
  const heights = new WebGLRenderTarget(BAKE_TEXELS, BAKE_TEXELS, {type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true});
  const darkness = new WebGLRenderTarget(BAKE_TEXELS, BAKE_TEXELS, {type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false});
  const heightMaterial = new ShaderMaterial({vertexShader: HEIGHT_VERTEX, fragmentShader: HEIGHT_FRAGMENT, side: DoubleSide, uniforms: {uMinY: {value: minY}}});
  const occlusionMaterial = new ShaderMaterial({
    vertexShader: OCCLUSION_VERTEX, fragmentShader: OCCLUSION_FRAGMENT, depthTest: false, depthWrite: false,
    uniforms: {uHeights: {value: heights.texture}, uTexels: {value: BAKE_TEXELS}, uSize: {value: size}, uHalfX: {value: (bounds.max.x - bounds.min.x) / 2}, uHalfZ: {value: (bounds.max.z - bounds.min.z) / 2}},
  });
  const pass = new Mesh(new PlaneGeometry(2, 2), occlusionMaterial); pass.frustumCulled = false;
  const screen = new OrthographicCamera(-1, 1, 1, -1, 0, 1), proxies = new Scene();
  model.traverse(object => {
    if (!(object instanceof Mesh) || object.name === CONTACT_SHADOW_NAME || !isCloseExterior(object, model)) return;
    const proxy = new Mesh(object.geometry as BufferGeometry, heightMaterial);
    proxy.matrixAutoUpdate = false; proxy.matrix.copy(frameMatrix(object, model)); proxy.matrixWorldNeedsUpdate = true;
    proxies.add(proxy);
  });
  const target = renderer.getRenderTarget(), clearColor = renderer.getClearColor(new Color()), clearAlpha = renderer.getClearAlpha(), autoClear = renderer.autoClear, viewport = renderer.getViewport(new Vector4());
  try {
    renderer.autoClear = true;
    renderer.setRenderTarget(heights); renderer.setClearColor(new Color(SKY_HEIGHT_M, 0, 0), 1); renderer.render(proxies, camera);
    renderer.setRenderTarget(darkness); renderer.render(pass, screen);
  } finally {
    renderer.setRenderTarget(target); renderer.setClearColor(clearColor, clearAlpha); renderer.autoClear = autoClear; renderer.setViewport(viewport);
    proxies.clear(); heights.dispose(); heightMaterial.dispose(); occlusionMaterial.dispose(); pass.geometry.dispose(); // The parts' geometry is shared: never disposed here.
  }
  return darkness;
}
