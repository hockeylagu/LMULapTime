import { type Color, DataUtils, DepthTexture, FloatType, HalfFloatType, Matrix3, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { SUN_UNIT } from './atmosphere/sunSamples.js';
import { surfaceAlphaCut } from './scenery/materials/shaderContext.js';
import { profilesAt, timeOfDayPosition, weatherWeight } from './atmosphere/timeOfDay.js';
import type { SceneryCamera, SceneryCameraLook, SceneryCameraProfile, SceneryCameraType, SceneryCameraTypeProfile, SceneryToneCurve } from '../../../../shared/types/scenes/scenery.js';

// Exposure, white balance, tone curve and the output encode come from the package's camera (SceneryCamera), one profile per camera
// type; the constants below are the app's own calibration. No screen-space occlusion is drawn: the reference frames, taken at the
// game's settings, have none (docs/local/replay-3d-reference/renderdoc, 2026-11-09).

/** A GLSL float literal (always with a decimal point). */
const glslFloat = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);

/** The white balance that leaves colours unchanged (D65's temperature). */
const NEUTRAL_KELVIN = 6500;
/**
 * The exposure law, exposure = U · clamp(T · B^(1 - s) / (U · L)^s, min, max): T the profile's target, B its light/dark border,
 * min and max its limits, s the type's adaptation scale (all from the package), L the mean luminance of the type's metering window
 * (everything in it, the cockpit included) and U what one unit of the scene's light measures on the camera's own scale. No constant
 * of the app's: twenty captured reference frames across the three camera types and a 150-fold range of L sit 9 % over this law
 * (9.5 % scatter; docs/local/replay-3d-reference/renderdoc/FINDINGS.md 4f, 2026-11-09).
 */
/** U: what one unit of the scene's light measures on a camera of the package's luminance scale. */
export const meterUnit = (sceneLuminanceScale: number): number => 1 / (SUN_UNIT * sceneLuminanceScale);

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

/** Metering grid: METER_PX² cells of SAMPLES² taps each, read back without stalling the frame. */
const METER_PX = 16, SAMPLES = 4, METER_EVERY_FRAMES = 4;
/** Adaptation rate (1/s) in log luminance, and the gap under which exposure counts as settled. */
const ADAPT_PER_S = 2.0, SETTLED_LOG = 0.01;

/**
 * A camera type's time-of-day profile for the direct sun: the two profiles around the sun's position along their knots
 * (atmosphere/timeOfDay.ts), each blended from its clear look toward its overcast one by the weather, then mixed.
 */
export type CameraTimeOfDay = SceneryCameraLook;
/** The direct sun the profiles are chosen by: its RGB in the package's light unit and its elevation. */
export interface ProfileSun { rgb: Color; elevationDeg: number }
export function profileAt(type: SceneryCameraTypeProfile, sun: ProfileSun, cloudCover = 0, sunVisibility?: number): CameraTimeOfDay {
  const look = (p: SceneryCameraProfile): SceneryCameraLook => {
    return mixLooks(p, p.overcast, weatherWeight(cloudCover, p.weatherLerpPower, sunVisibility));
  };
  const position = timeOfDayPosition(type.profiles.map(profile => profile.sunTarget), sun.rgb, sun.elevationDeg);
  const [low, high, t] = profilesAt(type.profiles, position);
  return mixLooks(look(low), look(high), t);
}

/** Every value of a look, a toward b by t. */
function mixLooks(a: SceneryCameraLook, b: SceneryCameraLook, t: number): SceneryCameraLook {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    targetExposure: mix(a.targetExposure, b.targetExposure), lightDarkBorder: mix(a.lightDarkBorder, b.lightDarkBorder),
    minExposure: mix(a.minExposure, b.minExposure), maxExposure: mix(a.maxExposure, b.maxExposure),
    whiteBalanceK: mix(a.whiteBalanceK, b.whiteBalanceK),
    toneCurve: {a: mix(a.toneCurve.a, b.toneCurve.a), b: mix(a.toneCurve.b, b.toneCurve.b)},
  };
}

/** The exposure law, with the metered mean luminance given as its natural log. */
export function lawExposure(look: SceneryCameraLook, adaptationScale: number, meteredLog: number, unit: number): number {
  const free = look.targetExposure * look.lightDarkBorder ** (1 - adaptationScale) / (unit * Math.exp(meteredLog)) ** adaptationScale;
  return unit * Math.min(look.maxExposure, Math.max(look.minExposure, free));
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

/** One adaptation step toward the log of the metered luminance, in log space (Pattanaik); the first reading is taken as is. */
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
  /** Switches to a camera type's metering, exposure law, white balance and curve; exposure re-adapts from the next reading. */
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
  display: DisplayTransform;
}

function resolveType(profile: SceneryCameraTypeProfile, sun: ProfileSun, weather: {cloudCover: number; sunVisibility?: number}, outputGamma: number): ResolvedType {
  const time = profileAt(profile, sun, weather.cloudCover, weather.sunVisibility), w = profile.meteringWindow;
  return {
    ...time, window: [w.x, 1 - w.y - w.height, w.width, w.height], adaptationScale: profile.adaptationScale,
    balance: whiteBalance(time.whiteBalanceK), display: {toneCurve: time.toneCurve, outputGamma},
  };
}

const METER_SHADER = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D source; uniform vec4 window; varying vec2 vUv;
    void main() {
      vec2 cell = window.zw / ${METER_PX}.0, corner = window.xy + floor(vUv * ${METER_PX}.0) * cell;
      float sum = 0.0;
      for (int i = 0; i < ${SAMPLES}; i++) for (int j = 0; j < ${SAMPLES}; j++)
        sum += max(dot(texture2D(source, corner + (vec2(i, j) + 0.5) / ${SAMPLES}.0 * cell).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0);
      gl_FragColor = vec4(sum / ${SAMPLES * SAMPLES}.0, 0.0, 0.0, 1.0);
    }`,
};
/** The metered mean never reads below this, so a black frame keeps a finite log. */
const METER_FLOOR = 1e-4;

/**
 * Metered auto-exposure: the frame renders to a half-float target, a small pass averages the luminance of the active camera
 * type's metering window, the GPU reads it back asynchronously every few frames, and the exposure adapts toward the law's value.
 * Rendering is on demand, so `invalidate` keeps frames coming until the exposure settles. `cloudCover` (0 to 1) blends each
 * type's profile toward its overcast look, by how much of the sun the clouds hide (`sunVisibility`, when the replay has a cloud field).
 */
export function createAutoExposure(renderer: WebGLRenderer, camera: SceneryCamera, sun: ProfileSun, invalidate: () => void, type: SceneryCameraType = 'external', cloudCover = 0, sunVisibility?: number): AutoExposure {
  const unit = meterUnit(camera.sceneLuminanceScale), weather = {cloudCover, sunVisibility};
  const types = {
    external: resolveType(camera.types.external, sun, weather, camera.outputGamma),
    onboard: resolveType(camera.types.onboard, sun, weather, camera.outputGamma),
    tv: resolveType(camera.types.tv, sun, weather, camera.outputGamma),
  } satisfies Record<SceneryCameraType, ResolvedType>;
  let active = types[type];
  const size = new Vector2();
  const hdr = new WebGLRenderTarget(1, 1, {type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1, FloatType)});
  const meter = new WebGLRenderTarget(METER_PX, METER_PX, {type: HalfFloatType, depthBuffer: false});
  const quad = new PlaneGeometry(2, 2), quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const output = new Scene(), meterScene = new Scene();
  output.name = meterScene.name = EXPOSURE_PASS;
  // The canvas pass: white balance in linear light, then the exposure and the type's tone curve, then the
  // output encode. Last, a triangular dither of one 8-bit step (interleaved gradient noise, two taps) breaks the banding of smooth
  // sky and shade gradients; its mean is zero, so flat colours (the racing line) keep their value.
  const outputMaterial = new ShaderMaterial({
    uniforms: {source: {value: hdr.texture}, exposure: {value: 1}, whiteBalance: {value: active.balance}, curve: {value: new Vector2()}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D source; uniform float exposure; uniform vec2 curve; uniform mat3 whiteBalance; varying vec2 vUv;
      float gradientNoise(vec2 pixel) { return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))); }
      void main() {
        vec3 z = exp(-curve.x * max(whiteBalance * texture2D(source, vUv).rgb * exposure, 0.0));
        vec3 tone = clamp((1.0 - z) * (1.0 - curve.y * z) * (1.0 - curve.y * z), 0.0, 1.0);
        gl_FragColor = vec4(pow(tone, vec3(${glslFloat(1 / camera.outputGamma)})), 1.0);
        gl_FragColor.rgb += (gradientNoise(gl_FragCoord.xy) + gradientNoise(gl_FragCoord.xy + 5.588238) - 1.0) / 255.0;
      }`,
    depthTest: false, depthWrite: false,
  });
  const meterMaterial = new ShaderMaterial({
    ...METER_SHADER, depthTest: false, depthWrite: false,
    uniforms: {source: {value: hdr.texture}, window: {value: active.window}},
  });
  output.add(new Mesh(quad, outputMaterial)); meterScene.add(new Mesh(quad, meterMaterial));
  const readback = new Uint16Array(METER_PX * METER_PX * 4);
  let adapted: number | null = null, metered: number | null = null, reading = false, frames = 0, last = 0, disposed = false, generation = 0;

  const apply = (next: ResolvedType) => {
    active = next;
    const u = outputMaterial.uniforms;
    u.whiteBalance.value = next.balance; (u.curve.value as Vector2).set(next.toneCurve.a, next.toneCurve.b);
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
      let sum = 0;
      for (let i = 0; i < METER_PX * METER_PX; i++) sum += DataUtils.fromHalfFloat(readback[i * 4]);
      metered = Math.log(Math.max(METER_FLOOR, sum / (METER_PX * METER_PX)));
      if (metered !== null && (adapted === null || Math.abs(metered - adapted) > SETTLED_LOG)) invalidate();
    } finally { reading = false; }
  };

  return {
    target: hdr,
    setType(requested) {
      const next = requested;
      if (types[next] === active) return;
      // The adapted level carries over, so the new type's law starts from it instead of an unexposed frame; the next reading moves it.
      apply(types[next]); generation++; metered = null; invalidate();
    },
    display: () => active.display,
    render(scene, camera) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== hdr.width || size.y !== hdr.height) { hdr.setSize(size.x, size.y); }
      const now = performance.now();
      if (metered !== null) {
        adapted = adaptLogLuminance(adapted, metered, last ? Math.min(0.25, (now - last) / 1000) : 0);
        if (Math.abs(metered - adapted) > SETTLED_LOG) invalidate();
      }
      last = now;
      // Set on the renderer before the scene pass, so overlays that must not follow exposure (the racing line) can divide it out as they draw.
      renderer.toneMappingExposure = adapted === null ? 1 : lawExposure(active, active.adaptationScale, adapted, unit);
      outputMaterial.uniforms.exposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(hdr);
      surfaceAlphaCut.value = 0; renderer.render(scene, camera); surfaceAlphaCut.value = 1;
      renderer.setRenderTarget(null);
      renderer.render(output, quadCamera);
      if (!reading && frames++ % METER_EVERY_FRAMES === 0) {
        renderer.setRenderTarget(meter); renderer.render(meterScene, quadCamera); renderer.setRenderTarget(null);
        read().catch(() => {}); // A lost context or a disposed target ends metering; the last exposure stays.
      }
    },
    dispose() {
      disposed = true;
      hdr.dispose(); meter.dispose(); quad.dispose(); outputMaterial.dispose(); meterMaterial.dispose();
    },
  };
}
