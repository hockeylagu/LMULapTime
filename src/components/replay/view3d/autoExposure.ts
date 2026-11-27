import { type Color, DepthTexture, FloatType, HalfFloatType, Matrix3, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget, type Camera, type IUniform, type Object3D, type Texture, type WebGLRenderer } from 'three';
import { GAME_LIGHT_UNIT } from './atmosphere/sunSamples.js';
import { withPass } from './shaders/sceneBlock.js';
import { profilesAt, timeOfDayPosition, weatherWeight } from './atmosphere/timeOfDay.js';
import { bloomParameters, createBloom, type BloomParameters } from './bloom.js';
import type { SceneryCamera, SceneryCameraLook, SceneryCameraProfile, SceneryCameraType, SceneryCameraTypeProfile, SceneryToneCurve } from '../../../../shared/types/scenes/scenery.js';

// Exposure, white balance, tone curve and the output encode come from the package's camera (SceneryCamera), one profile per camera
// type; the constants below are the app's own calibration. No screen-space occlusion is drawn: the reference frames have none
// (2026-11-09).

/** A GLSL float literal (always with a decimal point). */
const glslFloat = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);

/** The white balance that leaves colours unchanged (D65's temperature). */
const NEUTRAL_KELVIN = 6500;
/**
 * The exposure law, exposure = U · clamp((B · T)^(1 - s) · (G / (U · L))^s, min, max): T the profile's target, B its light/dark
 * border, min and max its limits, s the type's adaptation scale (all from the package), L the metered luminance of the type's
 * metering window (everything in it, the cockpit included; `ADAPT_SHADER`), G the target on the meter's scale
 * (−ln(1 − T), `meterGrey`) and U what one unit of the scene's light measures on the camera's own scale. No constant of the app's.
 */
/** U: what one unit of the scene's light measures on a camera of the package's luminance scale. */
export const meterUnit = (sceneLuminanceScale: number): number => 1 / (GAME_LIGHT_UNIT * sceneLuminanceScale);

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
 * Metering grid: METER_W × METER_H cells of SAMPLES² taps each, 128 × 72 taps over the window as the reference meters, once a
 * METER_PERIOD_MS: four frames at 60 Hz (adaptation runs on the wall clock; metering every frame cost a race start a third more slow
 * frames, 2026-11-17). The meter, the law and the adaptation run on the GPU into a 1 × 1 state the canvas pass reads, as the reference's luminance chain
 * does: a reading brought back to the CPU waits for the GPU process to finish what was issued before it, a median 5 ms and up to
 * 24 ms a reading at a race start where the GPU sets the pace (2026-11-17), the slowest tenth of its frames. The state comes back only
 * on quiet frames (nothing else asked for them), at most once a SETTLE_PERIOD_MS, to tell when the exposure has settled.
 */
const METER_W = 32, METER_H = 18, SAMPLES = 4, METER_PERIOD_MS = 4000 / 60, SETTLE_PERIOD_MS = 250;
/** The gap (stops) under which exposure counts as settled, and the period the adaptation's sensitivity is a blend fraction of. */
const SETTLED_STOPS = 0.01, ADAPT_PERIOD_S = 0.15;

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
    toneCurve: {a: mix(a.toneCurve.a, b.toneCurve.a), b: mix(a.toneCurve.b, b.toneCurve.b)}, sunGlareScalar: mix(a.sunGlareScalar, b.sunGlareScalar),
    bloom: {threshold: mix(a.bloom.threshold, b.bloom.threshold), remapFactor: mix(a.bloom.remapFactor, b.bloom.remapFactor), luminance: mix(a.bloom.luminance, b.bloom.luminance)},
  };
}

/** The meter's inverse of the curve: only its exponential, −ln(1 − y), for a displayed value y (0 to 1). */
const meterInverse = (y: number) => -Math.log(1 - Math.min(METER_TOP, Math.max(0, y)));
/** The meter's inverse is unbounded at 1: a displayed value is read at most at this. */
const METER_TOP = 1 - 1e-6;
/** A profile's target (middle grey, a displayed value) on the meter's scale, as the metered luminance is read. */
export const meterGrey = (target: number): number => meterInverse(Math.max(1e-4, target));

/** The exposure law, with the metered mean luminance given as its natural log. */
export function lawExposure(look: SceneryCameraLook, adaptationScale: number, meteredLog: number, unit: number): number {
  const border = look.lightDarkBorder * look.targetExposure, ratio = meterGrey(look.targetExposure) / (unit * Math.exp(meteredLog));
  const free = border ** (1 - adaptationScale) * ratio ** adaptationScale;
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
 * White balance as a linear-sRGB matrix for the toned colour: a Bradford adaptation from the neutral 6500 K white to the profile's
 * (on the daylight locus), scaled so white keeps its green. A 6500 K profile gives the identity; a bluer one cools the image.
 */
export function whiteBalance(kelvin: number): Matrix3 {
  const cone = (k: number) => {
    const [x, y] = daylightChromaticity(k);
    return new Vector3(x / y, 1, (1 - x - y) / y).applyMatrix3(BRADFORD);
  };
  const from = cone(NEUTRAL_KELVIN), to = cone(kelvin);
  const scale = new Matrix3().set(to.x / from.x, 0, 0, 0, to.y / from.y, 0, 0, 0, to.z / from.z);
  const toCone = BRADFORD.clone().multiply(SRGB_TO_XYZ), fromCone = toCone.clone().invert();
  const m = fromCone.multiply(scale).multiply(toCone), e = m.elements;
  return m.multiplyScalar(1 / (e[1] + e[4] + e[7]));
}

/** The name of the full-screen exposure and metering scenes, which are not the replay scene. */
export const EXPOSURE_PASS = 'exposure-pass';
/** The meterings a `reset` lands on (METER_PERIOD_MS apart): enough for a frame exposed for night to read day unclipped. Ours. */
export const RESET_METERINGS = 4;

/** How exposed linear light becomes a displayed value: the active type's tone curve, then the output encode. */
export interface DisplayTransform { readonly toneCurve: SceneryToneCurve; readonly outputGamma: number }

export interface AutoExposure {
  /** The HDR target scenes render into: programs compile against it (no tone mapping, linear output). */
  readonly target: WebGLRenderTarget;
  /**
   * Renders `scene` into the HDR target, then exposes and tone-maps it onto the canvas with the GPU's adapted exposure
   * (`exposureUniforms`), meters when due and adapts. `quiet`: nothing but the exposure asked for this frame, so its state may be read
   * back to tell whether it has settled (a frame that draws motion never waits on a readback).
   */
  render(scene: Object3D, camera: Camera, quiet?: boolean): void;
  /**
   * Links the canvas and metering programs off the main thread, for their own targets: otherwise each links on its first draw,
   * a few hundred milliseconds of the first frame. Call once the renderer's tone mapping is set (a program depends on it).
   */
  link(): Promise<void>;
  /**
   * Fetches a state reading whose fence has signalled. Call at the top of a frame, before its passes issue draws: the fetch is a round
   * trip to the GPU process, which waits for every command issued before it. A frame poll fetches it too when no frame comes.
   */
  collect(): void;
  /** Switches to a camera type's metering, exposure law, white balance and curve; exposure re-adapts from the next frame. */
  setType(type: SceneryCameraType): void;
  /** Chooses every type's profile by another moment's sun and weather; the adapted level carries over. */
  setSun(sun: ProfileSun, cloudCover: number, sunVisibility?: number): void;
  /**
   * Lands on the law's exposure at the next `RESET_METERINGS` meterings instead of adapting toward it: the viewer's jump between night
   * and day is no change of light an eye would adapt to. A first metering of a frame exposed for the other light may clip, so the
   * next ones land again on a frame closer to right.
   */
  reset(): void;
  /** The active type's display transform; the same object until the type or the sun changes. */
  display(): DisplayTransform;
  dispose(): void;
}

/** One camera type resolved for the session's sun. */
interface ResolvedType extends CameraTimeOfDay {
  /** Metering window as [x, y, width, height] in texture space (y up). */
  window: [number, number, number, number];
  adaptationScale: number;
  adaptation: SceneryCameraTypeProfile['adaptation'];
  balance: Matrix3;
  display: DisplayTransform;
  glare: BloomParameters;
}

function resolveType(profile: SceneryCameraTypeProfile, sun: ProfileSun, weather: {cloudCover: number; sunVisibility?: number}, camera: SceneryCamera): ResolvedType {
  const time = profileAt(profile, sun, weather.cloudCover, weather.sunVisibility), w = profile.meteringWindow;
  return {
    ...time, window: [w.x, 1 - w.y - w.height, w.width, w.height], adaptationScale: profile.adaptationScale, adaptation: profile.adaptation,
    balance: whiteBalance(time.whiteBalanceK), display: {toneCurve: time.toneCurve, outputGamma: camera.outputGamma},
    glare: bloomParameters(time.bloom, profile.bloom, camera.bloom),
  };
}

/** The metered luminance never reads below this, so a black frame keeps a finite log. */
const METER_FLOOR = 1e-4;
/**
 * The adapted exposure as the GPU keeps it, a 1 × 1 float target: red the exposure's log2 (stops), green the adaptation's smoothed
 * step, blue the metered luminance (natural log), alpha 0 before the first metering, 1 after. The canvas pass applies it and
 * materials that divide it out (the racing line) read it: `EXPOSURE_GLSL`.
 */
export const exposureUniforms: {exposure_state: IUniform<Texture | null>} = {exposure_state: {value: null}};
/** The exposure (linear) the canvas pass applies this frame, from `exposureUniforms`; 1 before the first metering. */
export const EXPOSURE_GLSL = 'uniform sampler2D exposure_state;\nfloat displayExposure() { return exp2(texelFetch(exposure_state, ivec2(0), 0).r); }';
/**
 * The meter, as the reference meters: each tap is exposed and put through the type's tone curve per channel (no white balance), so a
 * tap counts at most 1 however bright (a sun glint on glass moves the mean by its share of the window); the pass writes each cell's
 * mean, and `ADAPT_SHADER` reads the window's mean as a luminance.
 */
const METER_SHADER = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D source; uniform vec4 window; uniform vec2 curve; varying vec2 vUv;
    ${EXPOSURE_GLSL}
    void main() {
      float exposure = displayExposure();
      vec2 cell = window.zw / vec2(${METER_W}.0, ${METER_H}.0), corner = window.xy + floor(vUv * vec2(${METER_W}.0, ${METER_H}.0)) * cell;
      vec3 sum = vec3(0.0);
      for (int i = 0; i < ${SAMPLES}; i++) for (int j = 0; j < ${SAMPLES}; j++) {
        vec3 z = exp(-curve.x * max(texture2D(source, corner + (vec2(i, j) + 0.5) / ${SAMPLES}.0 * cell).rgb * exposure, 0.0));
        sum += clamp((1.0 - z) * (1.0 - curve.y * z) * (1.0 - curve.y * z), 0.0, 1.0);
      }
      gl_FragColor = vec4(sum / ${SAMPLES * SAMPLES}.0, 1.0);
    }`,
};

/**
 * One frame of the exposure on the GPU, from the state (`exposureUniforms`) into the other state target: a metering this frame
 * (`fresh`), else the state's; then the law's target (`lawExposure` in stops: logUnit + clamp((1 − s) · log2(B · T) + s · (log2 G −
 * logUnit − L / ln 2), log2 min, log2 max)), landed on at the first metering and adapted toward after.
 *
 * The metering, as the reference reads it: the luminance (natural log) of the Rec. 709 luminance of the window's mean displayed
 * colour, through the curve's exponential alone (−ln(1 − y), the curve's own gain and shoulder left out) and over the exposure the
 * taps were taken at. The law's middle grey is read the same way (`meterGrey`).
 *
 * The eye adaptation, in stops of exposure after the law, as the reference adapts: with k = 1 − (1 − sensitivity)^(dt / 0.15), the
 * step toward the law's target is (target − current) · k capped at speedLimit stops a second, then smoothed again by k and kept
 * between 0 and that step; reaching or passing the target lands on it. A rising exposure (the scene darkening) takes the dark set,
 * whose negative values stand for the light ones. The delay is 0 in every published type and is not applied.
 */
const ADAPT_SHADER = {
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D meter; uniform float fresh, snap, seconds, logUnit, logBorder, logGrey, scale, logMin, logMax;
    uniform vec4 adaptation; // sensitivity, speed limit, dark sensitivity, dark speed limit (a negative dark value takes the light one)
    ${EXPOSURE_GLSL}
    void main() {
      vec4 state = texelFetch(exposure_state, ivec2(0), 0);
      float metering = state.b;
      if (fresh > 0.5) {
        vec3 sum = vec3(0.0);
        for (int y = 0; y < ${METER_H}; y++) for (int x = 0; x < ${METER_W}; x++) sum += texelFetch(meter, ivec2(x, y), 0).rgb;
        float shown = clamp(dot(sum / ${METER_W * METER_H}.0, vec3(0.2126, 0.7152, 0.0722)), 0.0, ${glslFloat(METER_TOP)});
        metering = log(max(${glslFloat(METER_FLOOR)}, -log(1.0 - shown) / exp2(state.r)));
      }
      float target = logUnit + clamp((1.0 - scale) * logBorder + scale * (logGrey - logUnit - metering / log(2.0)), logMin, logMax);
      if (state.a < 0.5 || snap > 0.5) { gl_FragColor = vec4(target, 0.0, metering, 1.0); return; }
      bool dark = target > state.r;
      float sensitivity = dark && adaptation.z >= 0.0 ? adaptation.z : adaptation.x;
      float speedLimit = dark && adaptation.w >= 0.0 ? adaptation.w : adaptation.y;
      float k = seconds > 0.0 ? 1.0 - pow(1.0 - clamp(sensitivity, 0.0, 1.0), seconds / ${glslFloat(ADAPT_PERIOD_S)}) : 0.0;
      float cap = speedLimit * seconds;
      float move = clamp((target - state.r) * k, -cap, cap);
      float smoothed = state.g + (move - state.g) * k;
      float kept = move >= 0.0 ? min(move, max(0.0, smoothed)) : max(move, min(0.0, smoothed));
      float next = state.r + kept;
      gl_FragColor = (target - next) * (target - state.r) <= 0.0 ? vec4(target, 0.0, metering, 1.0) : vec4(next, kept, metering, 1.0);
    }`,
};

/**
 * Metered auto-exposure: the frame renders to a half-float target; a small pass meters the active camera type's window a few times a
 * second and every frame a 1 × 1 pass adapts the exposure toward the law's value, both on the GPU (`ADAPT_SHADER`), which the canvas pass applies. Rendering is on demand, so `invalidate` keeps frames coming until a state read back on a quiet frame shows the
 * exposure settled. `cloudCover` (0 to 1) blends each type's profile toward its overcast look, by how much of the sun the clouds hide
 * (`sunVisibility`, when the replay has a cloud field).
 */
export function createAutoExposure(renderer: WebGLRenderer, camera: SceneryCamera, sun: ProfileSun, invalidate: () => void, type: SceneryCameraType = 'external', cloudCover = 0, sunVisibility?: number): AutoExposure {
  const unit = meterUnit(camera.sceneLuminanceScale);
  const resolve = (at: ProfileSun, weather: {cloudCover: number; sunVisibility?: number}): Record<SceneryCameraType, ResolvedType> => ({
    external: resolveType(camera.types.external, at, weather, camera),
    onboard: resolveType(camera.types.onboard, at, weather, camera),
    tv: resolveType(camera.types.tv, at, weather, camera),
  });
  let types = resolve(sun, {cloudCover, sunVisibility}), activeType = type, active = types[type];
  const size = new Vector2();
  // Depth testing still uses the float attachment. The display and meter only sample the resolved colour.
  const hdr = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1, FloatType), resolveDepthBuffer: false,
  });
  const meter = new WebGLRenderTarget(METER_W, METER_H, {type: HalfFloatType, depthBuffer: false});
  // The exposure state, two targets in turn: each frame's adaptation reads one and writes the other.
  const states = [0, 1].map(() => new WebGLRenderTarget(1, 1, {type: FloatType, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter}));
  let current = 0;
  const quad = new PlaneGeometry(2, 2), quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const output = new Scene(), meterScene = new Scene(), adaptScene = new Scene();
  output.name = meterScene.name = adaptScene.name = EXPOSURE_PASS;
  const bloom = createBloom(camera.bloom, {uniform: exposureUniforms.exposure_state, glsl: EXPOSURE_GLSL});
  // The canvas pass: the exposure and the type's tone curve, the bloom added after the curve (`bloom.ts`), then the white balance
  // on the toned colour (the night capture 21459's whites show red at 0.957 of green and blue, and its red lamp cores keep blue),
  // then the output encode. Last, a triangular dither of one 8-bit step (interleaved gradient noise, two taps) breaks
  // the banding of smooth sky and shade gradients; its mean is zero, so flat colours (the racing line) keep their value.
  const outputMaterial = new ShaderMaterial({
    uniforms: {source: {value: hdr.texture}, glare: {value: null}, exposure_state: exposureUniforms.exposure_state, whiteBalance: {value: active.balance}, curve: {value: new Vector2()}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D source, glare; uniform vec2 curve; uniform mat3 whiteBalance; varying vec2 vUv;
      ${EXPOSURE_GLSL}
      float gradientNoise(vec2 pixel) { return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))); }
      void main() {
        vec3 z = exp(-curve.x * max(texture2D(source, vUv).rgb * displayExposure(), 0.0));
        vec3 tone = clamp((1.0 - z) * (1.0 - curve.y * z) * (1.0 - curve.y * z), 0.0, 1.0);
        tone += (1.0 - tone) * clamp(texture2D(glare, vUv).rgb, 0.0, 1.0);
        tone = clamp(whiteBalance * tone, 0.0, 1.0);
        gl_FragColor = vec4(pow(tone, vec3(${glslFloat(1 / camera.outputGamma)})), 1.0);
        gl_FragColor.rgb += (gradientNoise(gl_FragCoord.xy) + gradientNoise(gl_FragCoord.xy + 5.588238) - 1.0) / 255.0;
      }`,
    depthTest: false, depthWrite: false,
  });
  const meterMaterial = new ShaderMaterial({
    ...METER_SHADER, depthTest: false, depthWrite: false,
    uniforms: {source: {value: hdr.texture}, window: {value: active.window}, exposure_state: exposureUniforms.exposure_state, curve: {value: new Vector2()}},
  });
  const adaptMaterial = new ShaderMaterial({
    ...ADAPT_SHADER, depthTest: false, depthWrite: false,
    uniforms: {
      meter: {value: meter.texture}, exposure_state: exposureUniforms.exposure_state, fresh: {value: 0}, snap: {value: 0}, seconds: {value: 0},
      logUnit: {value: Math.log2(unit)}, logBorder: {value: 0}, logGrey: {value: 0}, scale: {value: 0}, logMin: {value: 0}, logMax: {value: 0},
      adaptation: {value: new Vector4()},
    },
  });
  output.add(new Mesh(quad, outputMaterial)); meterScene.add(new Mesh(quad, meterMaterial)); adaptScene.add(new Mesh(quad, adaptMaterial));
  const readback = new Float32Array(4);
  let reading = false, meteredAt = -Infinity, readAt = -Infinity, last = 0, disposed = false, made = false;
  /** Meterings left that land on the law's target instead of adapting toward it (`reset`). */
  let snaps = 0;
  /** Settled: a state read on a quiet frame landed within SETTLED_STOPS of its target, and nothing has moved since (`epoch`). */
  let settled = false, epoch = 0;
  /** The law's exposure (stops) for the metered luminance under the active type. */
  const targetOf = (log: number) => Math.log2(lawExposure(active, active.adaptationScale, log, unit));

  const apply = (next: ResolvedType) => {
    active = next;
    const u = outputMaterial.uniforms;
    u.whiteBalance.value = next.balance; (u.curve.value as Vector2).set(next.toneCurve.a, next.toneCurve.b);
    bloom.set(next.glare);
    meterMaterial.uniforms.window.value = next.window; (meterMaterial.uniforms.curve.value as Vector2).set(next.toneCurve.a, next.toneCurve.b);
    const a = adaptMaterial.uniforms, {sensitivity, speedLimit, darkAdaptation: dark} = next.adaptation;
    a.logBorder.value = Math.log2(next.lightDarkBorder * next.targetExposure); a.logGrey.value = Math.log2(meterGrey(next.targetExposure));
    a.scale.value = next.adaptationScale; a.logMin.value = Math.log2(Math.max(next.minExposure, 1e-30)); a.logMax.value = Math.log2(next.maxExposure);
    (a.adaptation.value as Vector4).set(sensitivity, speedLimit, dark.sensitivity, dark.speedLimit);
  };
  apply(active);
  const unsettle = () => { settled = false; epoch++; invalidate(); };

  /** The pending reading's fetch, while one waits on its fence. */
  let collect: (() => void) | null = null;
  /**
   * Reads the state just written back without stalling the frame, called right after its pass while its framebuffer is still bound,
   * to tell whether the exposure has settled. three's `readRenderTargetPixelsAsync` does the same, but polls the fence on a 4 ms
   * timer; here the data is fetched once the fence has signalled, with no timers: at the top of the next frame (`collect`), else from
   * a frame poll. Each reading has a pack buffer of its own, written once: a pack buffer written again for the next reading makes the
   * browser discard the readback copy it keeps of it, with a performance warning each time.
   */
  const read = () => {
    const started = epoch, gl = renderer.getContext() as WebGL2RenderingContext;
    const pack = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack); gl.bufferData(gl.PIXEL_PACK_BUFFER, readback.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) { gl.deleteBuffer(pack); throw Error('The exposure fence could not be created'); }
    gl.flush();
    reading = true;
    const fetch = () => {
      if (collect !== fetch) return;
      // A failed fence (a lost context) ends this reading; the next quiet frame tries again.
      const status = disposed ? gl.WAIT_FAILED : gl.clientWaitSync(fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return;
      collect = null; reading = false;
      try {
        // A reading from before a frame that moved, or a type or sun change, says nothing of now.
        if (status === gl.WAIT_FAILED || started !== epoch) return;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, readback); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        const [log2, , metering, phase] = readback;
        if (phase > 0.5 && Math.abs(targetOf(metering) - log2) <= SETTLED_STOPS) settled = true;
        else invalidate();
      } finally { gl.deleteSync(fence); gl.deleteBuffer(pack); }
    };
    collect = fetch;
    const poll = () => { fetch(); if (collect === fetch) requestAnimationFrame(poll); };
    requestAnimationFrame(poll);
  };

  return {
    target: hdr,
    setType(requested) {
      const next = requested;
      if (next === activeType) return;
      // The adapted exposure carries over, so the new type starts from it instead of an unexposed frame; it meters at the next frame.
      activeType = next; apply(types[next]); meteredAt = -Infinity; unsettle();
    },
    setSun(at, cover, visibility) {
      types = resolve(at, {cloudCover: cover, sunVisibility: visibility}); apply(types[activeType]); unsettle();
    },
    reset() { snaps = RESET_METERINGS; meteredAt = -Infinity; unsettle(); },
    display: () => active.display,
    collect: () => collect?.(),
    link() {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(null); const canvas = renderer.compileAsync(output, quadCamera);
      renderer.setRenderTarget(meter); const metering = renderer.compileAsync(meterScene, quadCamera);
      renderer.setRenderTarget(states[0]); const adapting = renderer.compileAsync(adaptScene, quadCamera);
      renderer.setRenderTarget(previous);
      return Promise.all([canvas, metering, adapting, bloom.link(renderer)]).then(() => {});
    },
    render(scene, camera, quiet = false) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== hdr.width || size.y !== hdr.height) { hdr.setSize(size.x, size.y); }
      // WebGL clears new storage: both states start at 0, before any metering (an exposure of 1).
      if (!made) { made = true; for (const state of states) renderer.initRenderTarget(state); }
      // Adaptation runs on the wall clock, as the reference's does: on while the replay is paused, at one rate whatever its speed.
      const now = performance.now(), seconds = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      if (!quiet) { settled = false; epoch++; }
      exposureUniforms.exposure_state.value = states[current].texture;
      renderer.setRenderTarget(hdr);
      // Multisampled: the cut-outs cut by their coverage (the pass block's alpha cut).
      withPass({surface_alphaCut: 0}, () => renderer.render(scene, camera));
      outputMaterial.uniforms.glare.value = bloom.render(renderer, hdr.texture, hdr.width, hdr.height);
      renderer.setRenderTarget(null);
      renderer.render(output, quadCamera);
      // The first frame always meters, so the state is metered before any frame reads it as such.
      const fresh = now - meteredAt >= METER_PERIOD_MS;
      if (fresh) { meteredAt = now; renderer.setRenderTarget(meter); renderer.render(meterScene, quadCamera); }
      adaptMaterial.uniforms.fresh.value = fresh ? 1 : 0; adaptMaterial.uniforms.seconds.value = seconds;
      adaptMaterial.uniforms.snap.value = fresh && snaps > 0 ? 1 : 0;
      if (fresh && snaps > 0) snaps--;
      current = 1 - current;
      renderer.setRenderTarget(states[current]); renderer.render(adaptScene, quadCamera);
      // Not while a reset's meterings are still landing: a state snapped to a metering sits on that metering's target, settled or not.
      if (quiet && !settled && !reading && snaps === 0 && now - readAt >= SETTLE_PERIOD_MS) {
        readAt = now;
        // A lost context leaves the exposure unsettled; the next quiet frame tries again.
        try { read(); } catch { /* frames keep coming */ }
      }
      renderer.setRenderTarget(null);
      exposureUniforms.exposure_state.value = states[current].texture;
      if (!settled) invalidate();
    },
    dispose() {
      disposed = true;
      collect?.();
      if (states.some(state => state.texture === exposureUniforms.exposure_state.value)) exposureUniforms.exposure_state.value = null;
      hdr.dispose(); meter.dispose(); for (const state of states) state.dispose();
      quad.dispose(); outputMaterial.dispose(); meterMaterial.dispose(); adaptMaterial.dispose(); bloom.dispose();
    },
  };
}
