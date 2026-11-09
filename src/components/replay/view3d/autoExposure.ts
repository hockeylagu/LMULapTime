import { DataUtils, DepthTexture, HalfFloatType, Matrix3, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { SceneryCamera, SceneryCameraType, SceneryCameraTypeProfile, SceneryToneCurve } from '../../../../shared/types/scenes/scenery.js';

// Exposure, white balance, tone curve, ambient occlusion and the output encode come from the package's camera (SceneryCamera), one
// profile per camera type; the constants below are the app's own calibration.

/** A GLSL float literal (always with a decimal point). */
const glslFloat = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);

/** The white balance that leaves colours unchanged (D65's temperature). */
const NEUTRAL_KELVIN = 6500;
/**
 * C of the exposure law exposure = C · T / L^s (T the profile's target, L the metered luminance, s the type's adaptation scale): the
 * app's light units against the game's, fitted once on the reference screenshots (docs/local/replay-3d-reference).
 */
export const EXPOSURE_CALIBRATION = 2.59;
/** The package's occlusion scale is strength per unit; the app's occlusion buffer reads four times as strong, so it is scaled down. */
const OCCLUSION_SCALE_FACTOR = 0.25;
/**
 * Metering skips what is nearer than this (m) in perspective views: the cockpit, and the car body in front of car-mounted cameras,
 * would otherwise set the exposure for the outside.
 */
const METER_NEAR_MASK_M = 4;

/** The camera's tone curve for one exposed linear component. */
export function toneCurve(curve: SceneryToneCurve, x: number): number {
  const z = Math.exp(-curve.a * Math.max(0, x));
  return Math.min(1, Math.max(0, (1 - z) * (1 - curve.b * z) ** 2));
}

/** The curve never reaches 1: displayed values above this are drawn at it. */
const TONE_PEAK = 0.995;

/** The exposed component the curve displays as `y` (bisection: the curve rises monotonically from 0). */
export function inverseToneCurve(curve: SceneryToneCurve, y: number): number {
  if (y <= 0) return 0;
  const wanted = Math.min(TONE_PEAK, y);
  let low = 0, high = 8;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (toneCurve(curve, mid) < wanted) low = mid; else high = mid; }
  return (low + high) / 2;
}

/**
 * Occlusion fades out between these view distances (m): a 0.5 m effect is invisible far away, and there the depth buffer is too
 * coarse for normals rebuilt from it, which speckled distant hills and haze.
 */
const OCCLUSION_FADE_M = [50, 150] as const;
/** Metering grid: METER_PX² cells of SAMPLES² taps each, read back without stalling the frame. */
const METER_PX = 16, SAMPLES = 4, METER_EVERY_FRAMES = 4;
/** Adaptation rate (1/s) in log luminance, and the gap under which exposure counts as settled. */
const ADAPT_PER_S = 2.0, SETTLED_LOG = 0.01;

/** A camera type's time-of-day profile at the sun's elevation: each value interpolated between profiles and held past the ends. */
export interface CameraTimeOfDay { targetExposure: number; whiteBalanceK: number; toneCurve: SceneryToneCurve }
export function profileAt(type: SceneryCameraTypeProfile, sunElevationDeg: number): CameraTimeOfDay {
  const table = type.profiles, first = table[0], last = table[table.length - 1];
  const pick = (p: (typeof table)[number]): CameraTimeOfDay => ({targetExposure: p.targetExposure, whiteBalanceK: p.whiteBalanceK, toneCurve: {...p.toneCurve}});
  if (sunElevationDeg <= first.sunElevationDeg) return pick(first);
  if (sunElevationDeg >= last.sunElevationDeg) return pick(last);
  const upper = table.findIndex(profile => profile.sunElevationDeg >= sunElevationDeg), p0 = table[upper - 1], p1 = table[upper];
  const t = (sunElevationDeg - p0.sunElevationDeg) / (p1.sunElevationDeg - p0.sunElevationDeg), mix = (a: number, b: number) => a + (b - a) * t;
  return {
    targetExposure: mix(p0.targetExposure, p1.targetExposure), whiteBalanceK: mix(p0.whiteBalanceK, p1.whiteBalanceK),
    toneCurve: {a: mix(p0.toneCurve.a, p1.toneCurve.a), b: mix(p0.toneCurve.b, p1.toneCurve.b)},
  };
}

/** The exposure law: C · T / L^s, with the metered luminance given as its natural log. */
export function lawExposure(targetExposure: number, adaptationScale: number, meteredLog: number): number {
  return EXPOSURE_CALIBRATION * targetExposure / Math.exp(adaptationScale * meteredLog);
}

/** CIE daylight locus chromaticity (x, y) of a correlated colour temperature, 4000–25000 K. */
function daylightChromaticity(kelvin: number): [number, number] {
  const t = Math.min(25000, Math.max(4000, kelvin));
  const x = t <= 7000
    ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + 99.11 / t + 0.244063
    : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 247.48 / t + 0.23704;
  return [x, -3 * x * x + 2.87 * x - 0.275];
}

const SRGB_TO_XYZ = new Matrix3().set(0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041);
const BRADFORD = new Matrix3().set(0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296);

/**
 * White balance as a linear-sRGB matrix: a Bradford adaptation from the profile's white (on the daylight locus) to the neutral
 * 6500 K one. A 6500 K profile gives the identity; a bluer one warms the image.
 */
export function whiteBalance(kelvin: number): Matrix3 {
  const cone = (k: number) => {
    const [x, y] = daylightChromaticity(k);
    return new Vector3(x / y, 1, (1 - x - y) / y).applyMatrix3(BRADFORD);
  };
  const from = cone(kelvin), to = cone(NEUTRAL_KELVIN);
  const scale = new Matrix3().set(to.x / from.x, 0, 0, 0, to.y / from.y, 0, 0, 0, to.z / from.z);
  const toCone = BRADFORD.clone().multiply(SRGB_TO_XYZ), fromCone = toCone.clone().invert();
  return fromCone.multiply(scale).multiply(toCone);
}

/** One adaptation step toward the metered log luminance, in log space (Pattanaik); the first reading is taken as is. */
export function adaptLogLuminance(current: number | null, metered: number, seconds: number): number {
  return current === null ? metered : current + (metered - current) * (1 - Math.exp(-seconds * ADAPT_PER_S));
}

/** The name of the full-screen exposure and metering scenes, which are not the replay scene. */
export const EXPOSURE_PASS = 'exposure-pass';

/** How exposed linear light becomes a displayed value: the active type's tone curve, then the output encode. */
export interface DisplayTransform { readonly toneCurve: SceneryToneCurve; readonly outputGamma: number }

export interface AutoExposure {
  /** The HDR target scenes render into: programs compile against it (no tone mapping, linear output). */
  readonly target: WebGLRenderTarget;
  /** Renders `scene` into the HDR target, then exposes and tone-maps it onto the canvas (renderer.toneMappingExposure carries the exposure). */
  render(scene: Object3D, camera: Camera): void;
  /** Switches to a camera type's metering, exposure law, white balance, curve and occlusion; exposure re-adapts from the next reading. */
  setType(type: SceneryCameraType): void;
  /** The active type's display transform; the same object until the type changes. */
  display(): DisplayTransform;
  dispose(): void;
}

/** One camera type resolved for the session's sun. */
interface ResolvedType extends CameraTimeOfDay {
  /** Metering window as [x, y, width, height] in texture space (y up). */
  window: [number, number, number, number];
  adaptationScale: number;
  balance: Matrix3;
  ambientOcclusion: SceneryCameraTypeProfile['ambientOcclusion'];
  display: DisplayTransform;
}

function resolveType(profile: SceneryCameraTypeProfile, sunElevationDeg: number, outputGamma: number): ResolvedType {
  const time = profileAt(profile, sunElevationDeg), w = profile.meteringWindow;
  return {
    ...time, window: [w.x, 1 - w.y - w.height, w.width, w.height], adaptationScale: profile.adaptationScale,
    balance: whiteBalance(time.whiteBalanceK), ambientOcclusion: profile.ambientOcclusion, display: {toneCurve: time.toneCurve, outputGamma},
  };
}

const METER_SHADER = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D source, depth; uniform float cameraNear, cameraFar, maskNear; uniform vec4 window; varying vec2 vUv;
    #include <packing>
    void main() {
      vec2 cell = window.zw / ${METER_PX}.0, corner = window.xy + floor(vUv * ${METER_PX}.0) * cell;
      float sum = 0.0, count = 0.0;
      for (int i = 0; i < ${SAMPLES}; i++) for (int j = 0; j < ${SAMPLES}; j++) {
        vec2 at = corner + (vec2(i, j) + 0.5) / ${SAMPLES}.0 * cell;
        if (maskNear > 0.0 && -perspectiveDepthToViewZ(texture2D(depth, at).r, cameraNear, cameraFar) < maskNear) continue;
        vec3 c = texture2D(source, at).rgb;
        sum += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4)); count += 1.0;
      }
      gl_FragColor = vec4(sum, count, 0.0, 1.0);
    }`,
};

/**
 * Metered auto-exposure: the frame renders to a half-float target, a small pass averages the log luminance of the active camera
 * type's metering window, the GPU reads it back asynchronously every few frames, and the exposure adapts toward the law's value.
 * Rendering is on demand, so `invalidate` keeps frames coming until the exposure settles.
 */
export function createAutoExposure(renderer: WebGLRenderer, camera: SceneryCamera, sunElevationDeg: number, invalidate: () => void, type: SceneryCameraType = 'external'): AutoExposure {
  const types = {
    external: resolveType(camera.types.external, sunElevationDeg, camera.outputGamma),
    onboard: resolveType(camera.types.onboard, sunElevationDeg, camera.outputGamma),
    tv: resolveType(camera.types.tv, sunElevationDeg, camera.outputGamma),
  } satisfies Record<SceneryCameraType, ResolvedType>;
  let active = types[type];
  const size = new Vector2();
  // The scene's resolved depth feeds the ambient occlusion: no second scene pass for a normal buffer.
  const hdr = new WebGLRenderTarget(1, 1, {type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1)});
  const occlusion = new GTAOPass(new Scene(), new PerspectiveCamera(), 1, 1);
  // After construction: three 0.186 reads its own normal target when given a depth texture in the constructor.
  occlusion.setGBuffer(hdr.depthTexture ?? undefined);
  occlusion.output = GTAOPass.OUTPUT.Off;
  const meter = new WebGLRenderTarget(METER_PX, METER_PX, {type: HalfFloatType, depthBuffer: false});
  const quad = new PlaneGeometry(2, 2), quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const output = new Scene(), meterScene = new Scene();
  output.name = meterScene.name = EXPOSURE_PASS;
  // The canvas pass: ambient occlusion and white balance in linear light, then the exposure and the type's tone curve, then the
  // output encode. Last, a triangular dither of one 8-bit step (interleaved gradient noise, two taps) breaks the banding of smooth
  // sky and shade gradients; its mean is zero, so flat colours (the racing line) keep their value.
  const outputMaterial = new ShaderMaterial({
    uniforms: {source: {value: hdr.texture}, occlusion: {value: occlusion.gtaoMap}, depth: {value: hdr.depthTexture}, cameraNear: {value: 0.1}, cameraFar: {value: 1000}, occluded: {value: 0}, exposure: {value: 1},
      whiteBalance: {value: active.balance}, curve: {value: new Vector2()}, occlusionScale: {value: 0}, occlusionColour: {value: 0}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D source, occlusion, depth; uniform float occluded, exposure, cameraNear, cameraFar, occlusionScale, occlusionColour; uniform vec2 curve; uniform mat3 whiteBalance; varying vec2 vUv;
      #include <packing>
      float gradientNoise(vec2 pixel) { return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))); }
      void main() {
        float distance = -perspectiveDepthToViewZ(texture2D(depth, vUv).r, cameraNear, cameraFar);
        float near = 1.0 - smoothstep(${OCCLUSION_FADE_M[0].toFixed(1)}, ${OCCLUSION_FADE_M[1].toFixed(1)}, distance);
        float ao = mix(1.0, occlusionColour, clamp((1.0 - texture2D(occlusion, vUv).r) * occlusionScale, 0.0, 1.0) * occluded * near);
        vec3 z = exp(-curve.x * max(whiteBalance * texture2D(source, vUv).rgb * ao * exposure, 0.0));
        vec3 tone = clamp((1.0 - z) * (1.0 - curve.y * z) * (1.0 - curve.y * z), 0.0, 1.0);
        gl_FragColor = vec4(pow(tone, vec3(${glslFloat(1 / camera.outputGamma)})), 1.0);
        gl_FragColor.rgb += (gradientNoise(gl_FragCoord.xy) + gradientNoise(gl_FragCoord.xy + 5.588238) - 1.0) / 255.0;
      }`,
    depthTest: false, depthWrite: false,
  });
  const meterMaterial = new ShaderMaterial({
    ...METER_SHADER, depthTest: false, depthWrite: false,
    uniforms: {source: {value: hdr.texture}, depth: {value: hdr.depthTexture}, cameraNear: {value: 0.1}, cameraFar: {value: 1000}, maskNear: {value: 0}, window: {value: active.window}},
  });
  output.add(new Mesh(quad, outputMaterial)); meterScene.add(new Mesh(quad, meterMaterial));
  const readback = new Uint16Array(METER_PX * METER_PX * 4);
  let adapted: number | null = null, metered: number | null = null, reading = false, frames = 0, last = 0, disposed = false, generation = 0;

  const apply = (next: ResolvedType) => {
    active = next;
    const ao = next.ambientOcclusion, u = outputMaterial.uniforms;
    occlusion.updateGtaoMaterial({radius: ao.radiusM, samples: ao.samples});
    u.whiteBalance.value = next.balance; (u.curve.value as Vector2).set(next.toneCurve.a, next.toneCurve.b);
    u.occlusionScale.value = ao.scale * OCCLUSION_SCALE_FACTOR; u.occlusionColour.value = ao.colour;
    meterMaterial.uniforms.window.value = next.window;
  };
  apply(active);

  const read = async () => {
    reading = true;
    const started = generation;
    try {
      await renderer.readRenderTargetPixelsAsync(meter, 0, 0, METER_PX, METER_PX, readback);
      // A reading from before a type switch metered the old window.
      if (disposed || started !== generation) return;
      let sum = 0, count = 0;
      for (let i = 0; i < METER_PX * METER_PX; i++) { sum += DataUtils.fromHalfFloat(readback[i * 4]); count += DataUtils.fromHalfFloat(readback[i * 4 + 1]); }
      // Every tap masked (a view filled by the near car): keep the last reading.
      if (count > 0) metered = sum / count;
      if (metered !== null && (adapted === null || Math.abs(metered - adapted) > SETTLED_LOG)) invalidate();
    } finally { reading = false; }
  };

  return {
    target: hdr,
    setType(requested) {
      if (types[requested] === active) return;
      apply(types[requested]); generation++; metered = null; adapted = null; invalidate();
    },
    display: () => active.display,
    render(scene, camera) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== hdr.width || size.y !== hdr.height) { hdr.setSize(size.x, size.y); occlusion.setSize(size.x, size.y); }
      const now = performance.now();
      if (metered !== null) {
        adapted = adaptLogLuminance(adapted, metered, last ? Math.min(0.25, (now - last) / 1000) : 0);
        if (Math.abs(metered - adapted) > SETTLED_LOG) invalidate();
      }
      last = now;
      // Set on the renderer before the scene pass, so overlays that must not follow exposure (the racing line) can divide it out as they draw.
      renderer.toneMappingExposure = adapted === null ? 1 : lawExposure(active.targetExposure, active.adaptationScale, adapted);
      outputMaterial.uniforms.exposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(hdr); renderer.render(scene, camera);
      // The overhead map view is orthographic: occlusion and the near mask are for the perspective views.
      const perspective = camera instanceof PerspectiveCamera;
      outputMaterial.uniforms.occluded.value = perspective ? 1 : 0;
      if (perspective) {
        occlusion.camera = camera; occlusion.render(renderer, hdr, hdr, 0, false);
        outputMaterial.uniforms.cameraNear.value = camera.near; outputMaterial.uniforms.cameraFar.value = camera.far;
      }
      renderer.setRenderTarget(null);
      renderer.render(output, quadCamera);
      if (!reading && frames++ % METER_EVERY_FRAMES === 0) {
        const mu = meterMaterial.uniforms;
        mu.maskNear.value = perspective ? METER_NEAR_MASK_M : 0;
        if (perspective) { mu.cameraNear.value = camera.near; mu.cameraFar.value = camera.far; }
        renderer.setRenderTarget(meter); renderer.render(meterScene, quadCamera); renderer.setRenderTarget(null);
        read().catch(() => {}); // A lost context or a disposed target ends metering; the last exposure stays.
      }
    },
    dispose() {
      disposed = true;
      hdr.depthTexture?.dispose(); hdr.dispose(); occlusion.dispose(); meter.dispose(); quad.dispose(); outputMaterial.dispose(); meterMaterial.dispose();
    },
  };
}
