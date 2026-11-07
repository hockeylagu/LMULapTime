import { DataUtils, DepthTexture, HalfFloatType, Matrix3, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { DAYLIGHT } from './sceneEnvironment.js';

/**
 * The game's exposure (Core/Shared/AE.mas, pplib presets; docs/plans/proposed/REPLAY_3D_FIDELITY.md): YEBIS auto-exposure meters
 * the scene and aims its log-average luminance at a target that falls as the sun rises. Targets are the VehicleExternal preset
 * (chase-style views), keyed by sun elevation in degrees. The game's min/max exposure clamps are in its own light units, which
 * the app's lights do not share, so they are not applied.
 */
const TARGET_BY_SUN: readonly (readonly [number, number])[] = [[-5, 0.5], [0, 0.5], [5, 0.5], [30, 0.325], [60, 0.24], [90, 0.2], [100, 0.15]];
/** The same profiles' white balance in kelvin: the camera's assumed light colour, warming the image as the sun drops. */
const WHITE_BALANCE_BY_SUN: readonly (readonly [number, number])[] = [[-5, 7500], [0, 7000], [5, 6800], [30, 6600], [60, 6500], [90, 6500], [100, 6500]];
/** The white balance that leaves colours unchanged (the profiles' midday value, and D65's temperature). */
const NEUTRAL_KELVIN = 6500;
/**
 * The game's tone curve: YEBIS sensitometric (ToneMapping.Type 2, shader ps_TonemapHDR_Exposure_Gamma), recovered from the
 * executable (LMUTrackPipeline pipeline-data/review/yebis-camera/native/runtime-findings.md). Per colour component of the exposed
 * linear colour x: z = e^(-A·x), tone = saturate((1 - z)·(1 - B·z)²). A and B come from the time-of-day profiles' curve
 * control 0.5 (A = 1 + 2.0891273·0.5^(1/3); B from the game's 21-entry table at the same point).
 */
export const TONE_CURVE = {a: 2.65814143, b: 0.6649931} as const;
/**
 * The app's one calibration: at the game's targets the replay reads a little too bright, with Neutral and with the game's own
 * curve alike (user, 2026-11-05), so every target is lowered by a third of a stop. The game's metering statistic and its
 * scene luminance scale (2.2) are not fully recovered; this stands in for them.
 */
const TARGET_SCALE = 0.8;

/** The game's tone curve for one exposed linear component (TONE_CURVE). */
export function toneCurve(x: number): number {
  const z = Math.exp(-TONE_CURVE.a * Math.max(0, x));
  return Math.min(1, Math.max(0, (1 - z) * (1 - TONE_CURVE.b * z) ** 2));
}

/** The curve never reaches 1: displayed values above this are drawn at it. */
const TONE_PEAK = 0.995;

/** The exposed component the game's curve displays as `y` (bisection: the curve rises monotonically from 0). */
export function inverseToneCurve(y: number): number {
  if (y <= 0) return 0;
  const wanted = Math.min(TONE_PEAK, y);
  let low = 0, high = 8;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (toneCurve(mid) < wanted) low = mid; else high = mid; }
  return (low + high) / 2;
}

/**
 * The game's screen-space ambient occlusion (YEBIS base preset: 16 samples over 0.5 m, occlusion scale 4, occlusion colour 0.5,
 * so a fully occluded spot darkens to half), through three's GTAO pass. Normals come from the depth, so the occlusion costs two
 * full-screen passes and no extra scene draw (the frame's cost is per draw).
 */
const AMBIENT_OCCLUSION = {radius: 0.5, samples: 16}, OCCLUSION_SCALE = 4, OCCLUSION_COLOUR = 0.5;
/**
 * Occlusion fades out between these view distances (m): a 0.5 m effect is invisible far away, and there the depth buffer is too
 * coarse for normals rebuilt from it, which speckled distant hills and haze.
 */
const OCCLUSION_FADE_M = [50, 150] as const;
/**
 * The darkest scene exposure is metered for: a mid-grey (18 %) ground lit by the sun, in the app's light units
 * (Lambert: albedo · sun intensity · sin(elevation) / π). A view that is mostly dark (the cockpit, whose interior fills the
 * metering window) would otherwise raise exposure by several stops and burn out the sunlit track outside; the game bounds its
 * exposure too (its own clamps are in its light units, which the app does not share). Sunlit views meter above it.
 */
const GREY_CARD = 0.18;
export function darkestMeteredLog(sunElevationDeg: number): number {
  return Math.log(GREY_CARD * DAYLIGHT.sunIntensity * Math.sin(sunElevationDeg * Math.PI / 180) / Math.PI);
}
/** The game's metering window: 60 % of the width, 80 % of the height, from 20 % in and 20 % down. */
const METER = {x: 0.2, y: 0.2, width: 0.6, height: 0.8};
/** Metering grid: METER_PX² cells of SAMPLES² taps each, read back without stalling the frame. */
const METER_PX = 16, SAMPLES = 4, METER_EVERY_FRAMES = 4;
/** Adaptation rate (1/s) in log luminance, and the gap under which exposure counts as settled. */
const ADAPT_PER_S = 2.0, SETTLED_LOG = 0.01;

/** A profile value for the sun's elevation, interpolated between the game's profiles and held past the ends. */
function byElevation(table: readonly (readonly [number, number])[], sunElevationDeg: number): number {
  const first = table[0], last = table[table.length - 1];
  if (sunElevationDeg <= first[0]) return first[1];
  if (sunElevationDeg >= last[0]) return last[1];
  const upper = table.findIndex(([elevation]) => elevation >= sunElevationDeg), [e0, v0] = table[upper - 1], [e1, v1] = table[upper];
  return v0 + (v1 - v0) * (sunElevationDeg - e0) / (e1 - e0);
}

/** Target exposure for the sun's elevation. */
export function targetExposure(sunElevationDeg: number): number {
  return byElevation(TARGET_BY_SUN, sunElevationDeg);
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
 * White balance for the sun's elevation, as a linear-sRGB matrix: a Bradford adaptation from the profile's white (on the
 * daylight locus) to the neutral 6500 K one. The midday profiles give the identity; a low sun warms the image.
 */
export function whiteBalance(sunElevationDeg: number): Matrix3 {
  const cone = (kelvin: number) => {
    const [x, y] = daylightChromaticity(kelvin);
    return new Vector3(x / y, 1, (1 - x - y) / y).applyMatrix3(BRADFORD);
  };
  const from = cone(byElevation(WHITE_BALANCE_BY_SUN, sunElevationDeg)), to = cone(NEUTRAL_KELVIN);
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

export interface AutoExposure {
  /** The HDR target scenes render into: programs compile against it (no tone mapping, linear output). */
  readonly target: WebGLRenderTarget;
  /** Renders `scene` into the HDR target, then exposes and tone-maps it onto the canvas (renderer.toneMappingExposure carries the exposure). */
  render(scene: Object3D, camera: Camera): void;
  dispose(): void;
}

const meterShader = {
  uniforms: {source: {value: null}, window: {value: [METER.x, 1 - METER.y - METER.height, METER.width, METER.height]}},
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D source; uniform vec4 window; varying vec2 vUv;
    void main() {
      vec2 cell = window.zw / ${METER_PX}.0, corner = window.xy + floor(vUv * ${METER_PX}.0) * cell;
      float sum = 0.0;
      for (int i = 0; i < ${SAMPLES}; i++) for (int j = 0; j < ${SAMPLES}; j++) {
        vec3 c = texture2D(source, corner + (vec2(i, j) + 0.5) / ${SAMPLES}.0 * cell).rgb;
        sum += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
      }
      gl_FragColor = vec4(sum / ${SAMPLES * SAMPLES}.0, 0.0, 0.0, 1.0);
    }`,
};

/**
 * Metered auto-exposure as the game does it: the frame renders to a half-float target, a small pass averages the log luminance
 * of the metering window, the GPU reads it back asynchronously every few frames, and the exposure adapts toward
 * target ÷ average. Rendering is on demand, so `invalidate` keeps frames coming until the exposure settles.
 */
export function createAutoExposure(renderer: WebGLRenderer, sunElevationDeg: number, invalidate: () => void): AutoExposure {
  const target = targetExposure(sunElevationDeg) * TARGET_SCALE, darkest = darkestMeteredLog(sunElevationDeg), size = new Vector2();
  // The scene's resolved depth feeds the ambient occlusion: no second scene pass for a normal buffer.
  const hdr = new WebGLRenderTarget(1, 1, {type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1)});
  const occlusion = new GTAOPass(new Scene(), new PerspectiveCamera(), 1, 1);
  // After construction: three 0.186 reads its own normal target when given a depth texture in the constructor.
  occlusion.setGBuffer(hdr.depthTexture ?? undefined);
  occlusion.updateGtaoMaterial(AMBIENT_OCCLUSION);
  occlusion.output = GTAOPass.OUTPUT.Off;
  const meter = new WebGLRenderTarget(METER_PX, METER_PX, {type: HalfFloatType, depthBuffer: false});
  const quad = new PlaneGeometry(2, 2), quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const output = new Scene(), meterScene = new Scene();
  output.name = meterScene.name = EXPOSURE_PASS;
  // The canvas pass: ambient occlusion and white balance in linear light, then the exposure and the game's tone curve, then the output colour space.
  const outputMaterial = new ShaderMaterial({
    uniforms: {source: {value: hdr.texture}, occlusion: {value: occlusion.gtaoMap}, depth: {value: hdr.depthTexture}, cameraNear: {value: 0.1}, cameraFar: {value: 1000}, occluded: {value: 0}, exposure: {value: 1},
      whiteBalance: {value: whiteBalance(sunElevationDeg)}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D source, occlusion, depth; uniform float occluded, exposure, cameraNear, cameraFar; uniform mat3 whiteBalance; varying vec2 vUv;
      #include <packing>
      void main() {
        float distance = -perspectiveDepthToViewZ(texture2D(depth, vUv).r, cameraNear, cameraFar);
        float near = 1.0 - smoothstep(${OCCLUSION_FADE_M[0].toFixed(1)}, ${OCCLUSION_FADE_M[1].toFixed(1)}, distance);
        float ao = mix(1.0, ${OCCLUSION_COLOUR.toFixed(3)}, clamp((1.0 - texture2D(occlusion, vUv).r) * ${OCCLUSION_SCALE.toFixed(1)}, 0.0, 1.0) * occluded * near);
        vec3 z = exp(-${TONE_CURVE.a} * max(whiteBalance * texture2D(source, vUv).rgb * ao * exposure, 0.0));
        gl_FragColor = vec4(clamp((1.0 - z) * (1.0 - ${TONE_CURVE.b} * z) * (1.0 - ${TONE_CURVE.b} * z), 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const meterMaterial = new ShaderMaterial({...meterShader, depthTest: false, depthWrite: false});
  meterMaterial.uniforms.source.value = hdr.texture;
  output.add(new Mesh(quad, outputMaterial)); meterScene.add(new Mesh(quad, meterMaterial));
  const readback = new Uint16Array(METER_PX * METER_PX * 4);
  let adapted: number | null = null, metered: number | null = null, reading = false, frames = 0, last = 0, disposed = false;

  const read = async () => {
    reading = true;
    try {
      await renderer.readRenderTargetPixelsAsync(meter, 0, 0, METER_PX, METER_PX, readback);
      if (disposed) return;
      let sum = 0;
      for (let i = 0; i < METER_PX * METER_PX; i++) sum += DataUtils.fromHalfFloat(readback[i * 4]);
      metered = Math.max(darkest, sum / (METER_PX * METER_PX));
      if (adapted === null || Math.abs(metered - adapted) > SETTLED_LOG) invalidate();
    } finally { reading = false; }
  };

  return {
    target: hdr,
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
      renderer.toneMappingExposure = adapted === null ? 1 : target / Math.exp(adapted);
      outputMaterial.uniforms.exposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(hdr); renderer.render(scene, camera);
      // The overhead map view is orthographic: occlusion is for the perspective views the game has it in.
      const perspective = camera instanceof PerspectiveCamera;
      outputMaterial.uniforms.occluded.value = perspective ? 1 : 0;
      if (perspective) {
        occlusion.camera = camera; occlusion.render(renderer, hdr, hdr, 0, false);
        outputMaterial.uniforms.cameraNear.value = camera.near; outputMaterial.uniforms.cameraFar.value = camera.far;
      }
      renderer.setRenderTarget(null);
      renderer.render(output, quadCamera);
      if (!reading && frames++ % METER_EVERY_FRAMES === 0) {
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
