import { DataUtils, DepthTexture, HalfFloatType, Matrix3, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { DAYLIGHT } from './sceneEnvironment.js';
import type { SceneryCamera } from '../../../../shared/types/scenes/scenery.js';
import { createGlare } from './glare.js';

/** A GLSL float literal (always with a decimal point). */
const glslFloat = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);

// The camera's exposure targets, white balance, tone curve, glare threshold and ambient occlusion come from the package's camera
// profile (SceneryCamera).
type ToneCurve = SceneryCamera['toneCurve'];
/** The white balance that leaves colours unchanged (D65's temperature). */
const NEUTRAL_KELVIN = 6500;
/**
 * The app's one calibration: at the profile's targets the replay reads a little too bright, with Neutral and with the profile's
 * curve alike (user, 2026-11-05), so every target is lowered by a third of a stop.
 */
const TARGET_SCALE = 0.8;

/** The camera's tone curve for one exposed linear component. */
export function toneCurve(curve: ToneCurve, x: number): number {
  const z = Math.exp(-curve.a * Math.max(0, x));
  return Math.min(1, Math.max(0, (1 - z) * (1 - curve.b * z) ** 2));
}

/** The curve never reaches 1: displayed values above this are drawn at it. */
const TONE_PEAK = 0.995;

/** The exposed component the curve displays as `y` (bisection: the curve rises monotonically from 0). */
export function inverseToneCurve(curve: ToneCurve, y: number): number {
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
/**
 * The darkest scene exposure is metered for: a mid-grey (18 %) ground lit by the sun, in the app's light units
 * (Lambert: albedo · sun intensity · `sunStrength` · sin(elevation) / π; `sunStrength` is the share of the calibrated sun that gets
 * through the air and cloud, sceneEnvironment.ts `sunTransmittance`). A view that is mostly dark (the cockpit, whose interior fills the
 * metering window) would otherwise raise exposure by several stops and burn out the sunlit track outside. Sunlit views meter above it.
 */
const GREY_CARD = 0.18;
export function darkestMeteredLog(sunElevationDeg: number, sunStrength = 1): number {
  return Math.log(GREY_CARD * DAYLIGHT.sunIntensity * sunStrength * Math.sin(sunElevationDeg * Math.PI / 180) / Math.PI);
}
/** Metering grid: METER_PX² cells of SAMPLES² taps each, read back without stalling the frame. */
const METER_PX = 16, SAMPLES = 4, METER_EVERY_FRAMES = 4;
/** Adaptation rate (1/s) in log luminance, and the gap under which exposure counts as settled. */
const ADAPT_PER_S = 2.0, SETTLED_LOG = 0.01;

/** A profile value for the sun's elevation, interpolated between the camera's profiles and held past the ends. */
function byElevation(camera: SceneryCamera, key: 'targetExposure' | 'whiteBalanceK', sunElevationDeg: number): number {
  const table = camera.profiles, first = table[0], last = table[table.length - 1];
  if (sunElevationDeg <= first.sunElevationDeg) return first[key];
  if (sunElevationDeg >= last.sunElevationDeg) return last[key];
  const upper = table.findIndex(profile => profile.sunElevationDeg >= sunElevationDeg), p0 = table[upper - 1], p1 = table[upper];
  return p0[key] + (p1[key] - p0[key]) * (sunElevationDeg - p0.sunElevationDeg) / (p1.sunElevationDeg - p0.sunElevationDeg);
}

/** Target exposure for the sun's elevation. */
export function targetExposure(camera: SceneryCamera, sunElevationDeg: number): number {
  return byElevation(camera, 'targetExposure', sunElevationDeg);
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
 * daylight locus) to the neutral 6500 K one. A 6500 K profile gives the identity; a bluer one warms the image.
 */
export function whiteBalance(camera: SceneryCamera, sunElevationDeg: number): Matrix3 {
  const cone = (kelvin: number) => {
    const [x, y] = daylightChromaticity(kelvin);
    return new Vector3(x / y, 1, (1 - x - y) / y).applyMatrix3(BRADFORD);
  };
  const from = cone(byElevation(camera, 'whiteBalanceK', sunElevationDeg)), to = cone(NEUTRAL_KELVIN);
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

const meterShader = (window: SceneryCamera['meteringWindow']) => ({
  uniforms: {source: {value: null}, window: {value: [window.x, 1 - window.y - window.height, window.width, window.height]}},
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
});

/**
 * Metered auto-exposure: the frame renders to a half-float target, a small pass averages the log luminance
 * of the metering window, the GPU reads it back asynchronously every few frames, and the exposure adapts toward
 * target ÷ average. Rendering is on demand, so `invalidate` keeps frames coming until the exposure settles.
 */
export function createAutoExposure(renderer: WebGLRenderer, camera: SceneryCamera, sunElevationDeg: number, invalidate: () => void, sunStrength = 1): AutoExposure {
  const target = targetExposure(camera, sunElevationDeg) * TARGET_SCALE, {toneCurve: curve, ambientOcclusion: ao} = camera, darkest = darkestMeteredLog(sunElevationDeg, sunStrength), size = new Vector2();
  // The scene's resolved depth feeds the ambient occlusion: no second scene pass for a normal buffer.
  const hdr = new WebGLRenderTarget(1, 1, {type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1)});
  const occlusion = new GTAOPass(new Scene(), new PerspectiveCamera(), 1, 1);
  // After construction: three 0.186 reads its own normal target when given a depth texture in the constructor.
  occlusion.setGBuffer(hdr.depthTexture ?? undefined);
  occlusion.updateGtaoMaterial({radius: ao.radiusM, samples: ao.samples});
  occlusion.output = GTAOPass.OUTPUT.Off;
  const meter = new WebGLRenderTarget(METER_PX, METER_PX, {type: HalfFloatType, depthBuffer: false});
  const glare = createGlare(renderer, camera.glareThreshold), balance = whiteBalance(camera, sunElevationDeg);
  const quad = new PlaneGeometry(2, 2), quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const output = new Scene(), meterScene = new Scene();
  output.name = meterScene.name = EXPOSURE_PASS;
  // The canvas pass: ambient occlusion and white balance in linear light, then the exposure and the camera's tone curve, the glare
  // composited over it (glare.ts), then the output colour space.
  // Last, a triangular dither of one 8-bit step (interleaved gradient noise, two taps) breaks the banding of smooth sky and shade
  // gradients; its mean is zero, so flat colours (the racing line) keep their value.
  const outputMaterial = new ShaderMaterial({
    uniforms: {source: {value: hdr.texture}, occlusion: {value: occlusion.gtaoMap}, depth: {value: hdr.depthTexture}, cameraNear: {value: 0.1}, cameraFar: {value: 1000}, occluded: {value: 0}, exposure: {value: 1},
      whiteBalance: {value: balance}, glare: {value: glare.texture}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D source, occlusion, depth, glare; uniform float occluded, exposure, cameraNear, cameraFar; uniform mat3 whiteBalance; varying vec2 vUv;
      #include <packing>
      float gradientNoise(vec2 pixel) { return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))); }
      void main() {
        float distance = -perspectiveDepthToViewZ(texture2D(depth, vUv).r, cameraNear, cameraFar);
        float near = 1.0 - smoothstep(${OCCLUSION_FADE_M[0].toFixed(1)}, ${OCCLUSION_FADE_M[1].toFixed(1)}, distance);
        float ao = mix(1.0, ${glslFloat(ao.colour)}, clamp((1.0 - texture2D(occlusion, vUv).r) * ${glslFloat(ao.scale)}, 0.0, 1.0) * occluded * near);
        vec3 z = exp(-${glslFloat(curve.a)} * max(whiteBalance * texture2D(source, vUv).rgb * ao * exposure, 0.0));
        vec3 tone = clamp((1.0 - z) * (1.0 - ${glslFloat(curve.b)} * z) * (1.0 - ${glslFloat(curve.b)} * z), 0.0, 1.0);
        gl_FragColor = vec4(tone + (1.0 - tone) * (1.0 - exp(-${glare.scale.toFixed(5)} * texture2D(glare, vUv).rgb)), 1.0);
        #include <colorspace_fragment>
        gl_FragColor.rgb += (gradientNoise(gl_FragCoord.xy) + gradientNoise(gl_FragCoord.xy + 5.588238) - 1.0) / 255.0;
      }`,
    depthTest: false, depthWrite: false,
  });
  const meterMaterial = new ShaderMaterial({...meterShader(camera.meteringWindow), depthTest: false, depthWrite: false});
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
      if (size.x !== hdr.width || size.y !== hdr.height) { hdr.setSize(size.x, size.y); occlusion.setSize(size.x, size.y); glare.setSize(size.x, size.y); }
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
      // The overhead map view is orthographic: occlusion is for the perspective views.
      const perspective = camera instanceof PerspectiveCamera;
      outputMaterial.uniforms.occluded.value = perspective ? 1 : 0;
      if (perspective) {
        occlusion.camera = camera; occlusion.render(renderer, hdr, hdr, 0, false);
        outputMaterial.uniforms.cameraNear.value = camera.near; outputMaterial.uniforms.cameraFar.value = camera.far;
      }
      glare.render(hdr.texture, renderer.toneMappingExposure, balance);
      renderer.setRenderTarget(null);
      renderer.render(output, quadCamera);
      if (!reading && frames++ % METER_EVERY_FRAMES === 0) {
        renderer.setRenderTarget(meter); renderer.render(meterScene, quadCamera); renderer.setRenderTarget(null);
        read().catch(() => {}); // A lost context or a disposed target ends metering; the last exposure stays.
      }
    },
    dispose() {
      disposed = true;
      hdr.depthTexture?.dispose(); hdr.dispose(); occlusion.dispose(); glare.dispose(); meter.dispose(); quad.dispose(); outputMaterial.dispose(); meterMaterial.dispose();
    },
  };
}
