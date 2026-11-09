import { BackSide, Color, MathUtils, Matrix3, ShaderMaterial, Vector3 } from 'three';
import type { SceneryDaylight, ScenerySky } from '../../../../../shared/types/scenes/scenery.js';

/**
 * The one module that reads the package's sky (the pipeline's docs/SCENE_PACKAGE.md "Sky and atmosphere" has the formulas).
 *
 * The sky is the analytic daylight sky of Preetham, Shirley and Smits (1999): zenith luminance and chromaticity from the turbidity and
 * the sun's zenith angle, spread over the dome by the Perez distribution (xyY), converted to linear sRGB. The package scales the five
 * distribution coefficients (A horizon darkening, B its gradient, C circumsolar strength, D its width, E backscatter); its
 * multiplier rows by sun elevation scale A–D again, interpolated between the rows around the sun's height. The
 * turbidity, the haze density and the haze colour follow the weather: cloud cover C, precipitation S and the effective pollution p.
 */

/** Sky radiance per kcd/m² of the model's luminance, in the sun's units: the dome reads about as bright as a sunlit surface. */
const SKY_LUMINANCE = 0.04;

/** The weather the sky is drawn for: the layout's air pollution, the cloud cover C and the precipitation term S (0 to 1). */
export interface SkyConditions { airPollution: number; cloudCover: number; precipitation: number }

/** A layout's weather: its air pollution (none without daylight), the replay's cloud cover, dry. */
export function skyConditions(daylight: SceneryDaylight | undefined, cloudCover: number): SkyConditions {
  return {airPollution: daylight?.airPollution ?? 0, cloudCover: MathUtils.clamp(cloudCover, 0, 1), precipitation: 0};
}

/** p: the air pollution, damped by cloud cover. */
const effectivePollution = (sky: ScenerySky, weather: SkyConditions) => weather.airPollution * (1 - sky.pollution.cloudyDamping * weather.cloudCover);

/** The sky's turbidity for the weather, clamped to the package's range. */
export function skyTurbidity(sky: ScenerySky, weather: SkyConditions): number {
  const {base, overcast, storm, pollution, min, max} = sky.turbidity, p = effectivePollution(sky, weather);
  return MathUtils.clamp(base + (overcast + storm) * weather.cloudCover + pollution * p * p, min, max);
}

/** The clear-day haze density (per metre) of a layout's daylight, clamped to the package's range; none without daylight. */
export function hazeDensity(sky: ScenerySky, daylight?: SceneryDaylight): number {
  if (!daylight) return 0;
  const {base, pollution, min, max} = sky.fog.density;
  return MathUtils.clamp(base * daylight.hazeBaseScale + pollution * daylight.airPollution, min, max);
}

/** The height term: haze thins with altitude above the native zero by amount · saturate(y · rate)^exponent. */
export interface HeightHaze { amount: number; rate: number; exponent: number }
export function heightHaze(sky: ScenerySky, daylight: SceneryDaylight | undefined, weather: SkyConditions): HeightHaze {
  const {max, scalar, exponent, scalarMin, scalarMax, exponentMin} = sky.fog.height;
  if (!daylight) return {amount: 0, rate: scalarMin, exponent: Math.max(exponentMin, exponent)};
  return {
    amount: max * (1 - weather.cloudCover),
    rate: MathUtils.clamp(scalar * daylight.fogHeightAltitudeScalar, scalarMin, scalarMax),
    exponent: Math.max(exponentMin, exponent * daylight.fogHeightExponentScalar),
  };
}

/** How far the haze turns toward the sun's light at most, looking straight into the sun. */
export const sunwardHaze = (sky: ScenerySky, weather: SkyConditions): number => sky.fog.sunInfluence * (1 - weather.cloudCover);

/**
 * The five Perez coefficient scales the sky applies at a sun elevation: the package's scales times its multipliers, linear between
 * the two rows around the elevation. A sun outside the table's elevations is a package error.
 */
export function perezScales(sky: ScenerySky, sunElevationDeg: number): [number, number, number, number, number] {
  const rows = sky.perezMultipliers, upper = rows.findIndex(row => row.sunElevationDeg >= sunElevationDeg);
  if (upper < 0 || (upper === 0 && rows[0].sunElevationDeg > sunElevationDeg)) throw Error(`Package sky has no Perez multipliers at ${sunElevationDeg.toFixed(2)}°`);
  const high = rows[upper], low = rows[Math.max(0, upper - 1)];
  const t = high === low ? 0 : (sunElevationDeg - low.sunElevationDeg) / (high.sunElevationDeg - low.sunElevationDeg);
  const multiplier = (i: number) => low.abcd[i] + (high.abcd[i] - low.abcd[i]) * t;
  const [a, b, c, d, e] = sky.perezScale;
  return [a * multiplier(0), b * multiplier(1), c * multiplier(2), d * multiplier(3), e];
}

/** The sky for one sun: per channel (Y, x, y) its zenith value divided by the distribution at the zenith, and the scaled A–E. */
interface SkyModel { zenith: [number, number, number]; coefficients: number[][]; sun: Vector3 }

const perez = (k: number[], cosTheta: number, gamma: number, cosGamma: number) =>
  (1 + k[0] * Math.exp(k[1] / Math.max(cosTheta, 0.01))) * (1 + k[2] * Math.exp(k[3] * gamma) + k[4] * cosGamma * cosGamma);

function skyModel(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions): SkyModel {
  const sun = sunDirection.clone().normalize(), thetaS = Math.acos(Math.min(1, Math.max(-1, sun.y))), t2 = thetaS ** 2, t3 = thetaS ** 3;
  const T = skyTurbidity(sky, weather), scales = perezScales(sky, 90 - MathUtils.radToDeg(thetaS));
  const chi = (4 / 9 - T / 120) * (Math.PI - 2 * thetaS);
  const zenith = [
    (4.0453 * T - 4.9710) * Math.tan(chi) - 0.2155 * T + 2.4192,
    T * T * (0.00166 * t3 - 0.00375 * t2 + 0.00209 * thetaS) + T * (-0.02903 * t3 + 0.06377 * t2 - 0.03202 * thetaS + 0.00394) + (0.11693 * t3 - 0.21196 * t2 + 0.06052 * thetaS + 0.25886),
    T * T * (0.00275 * t3 - 0.00610 * t2 + 0.00317 * thetaS) + T * (-0.04214 * t3 + 0.08970 * t2 - 0.04153 * thetaS + 0.00516) + (0.15346 * t3 - 0.26756 * t2 + 0.06670 * thetaS + 0.26688),
  ];
  const coefficients = [
    [0.1787 * T - 1.4630, -0.3554 * T + 0.4275, -0.0227 * T + 5.3251, 0.1206 * T - 2.5771, -0.0670 * T + 0.3703],
    [-0.0193 * T - 0.2592, -0.0665 * T + 0.0008, -0.0004 * T + 0.2125, -0.0641 * T - 0.8989, -0.0033 * T + 0.0452],
    [-0.0167 * T - 0.2608, -0.0950 * T + 0.0092, -0.0079 * T + 0.2102, -0.0441 * T - 1.6537, -0.0109 * T + 0.0529],
  ].map(row => row.map((value, i) => value * scales[i]));
  const atZenith = coefficients.map(k => perez(k, 1, thetaS, Math.cos(thetaS)));
  return {zenith: [zenith[0] / atZenith[0], zenith[1] / atZenith[1], zenith[2] / atZenith[2]], coefficients, sun};
}

/** CIE XYZ to linear sRGB (column-major, as GLSL reads it). */
const XYZ_TO_RGB = [3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570];

/** The sky dome's material: radiance toward each view direction, drawn at infinity. */
export function createPerezSkyMaterial(sunDirection: Vector3, sky: ScenerySky, weather: SkyConditions): ShaderMaterial {
  const model = skyModel(sky, sunDirection, weather), [ky, kx, kz] = model.coefficients;
  return new ShaderMaterial({
    name: 'perez-sky',
    uniforms: {
      sunDirection: {value: model.sun}, zenith: {value: new Vector3(...model.zenith)}, skyLuminance: {value: SKY_LUMINANCE},
      coefficientsY: {value: ky}, coefficientsX: {value: kx}, coefficientsZ: {value: kz}, xyzToRgb: {value: new Matrix3().fromArray(XYZ_TO_RGB)},
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 sunDirection, zenith; uniform float skyLuminance, coefficientsY[5], coefficientsX[5], coefficientsZ[5]; uniform mat3 xyzToRgb;
      varying vec3 vWorld;
      float perez(float k[5], float cosTheta, float gamma, float cosGamma) {
        return (1.0 + k[0] * exp(k[1] / max(cosTheta, 0.01))) * (1.0 + k[2] * exp(k[3] * gamma) + k[4] * cosGamma * cosGamma);
      }
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float cosTheta = max(dir.y, 0.0) + 0.001, cosGamma = clamp(dot(dir, sunDirection), -1.0, 1.0), gamma = acos(cosGamma);
        float Y = zenith.x * perez(coefficientsY, cosTheta, gamma, cosGamma);
        float x = zenith.y * perez(coefficientsX, cosTheta, gamma, cosGamma), y = zenith.z * perez(coefficientsZ, cosTheta, gamma, cosGamma);
        vec3 rgb = xyzToRgb * vec3(x * Y / y, Y, (1.0 - x - y) * Y / y);
        gl_FragColor = vec4((rgb - min(0.0, min(rgb.r, min(rgb.g, rgb.b)))) * skyLuminance, 1.0);
      }`,
    side: BackSide, depthWrite: false,
  });
}

function radiance(model: SkyModel, direction: Vector3, target: Color): Color {
  const cosTheta = Math.max(direction.y, 0) + 0.001, cosGamma = Math.min(1, Math.max(-1, direction.dot(model.sun))), gamma = Math.acos(cosGamma);
  const [ky, kx, kz] = model.coefficients, [zy, zx, zz] = model.zenith;
  const Y = zy * perez(ky, cosTheta, gamma, cosGamma), x = zx * perez(kx, cosTheta, gamma, cosGamma), y = zz * perez(kz, cosTheta, gamma, cosGamma);
  const X = x * Y / y, Z = (1 - x - y) * Y / y, m = XYZ_TO_RGB;
  const rgb = [m[0] * X + m[3] * Y + m[6] * Z, m[1] * X + m[4] * Y + m[7] * Z, m[2] * X + m[5] * Y + m[8] * Z], lift = Math.min(0, ...rgb);
  return target.setRGB((rgb[0] - lift) * SKY_LUMINANCE, (rgb[1] - lift) * SKY_LUMINANCE, (rgb[2] - lift) * SKY_LUMINANCE);
}

/** The sky's radiance toward a unit direction, as the dome draws it. */
export function skyRadiance(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions, direction: Vector3, target = new Color()): Color {
  return radiance(skyModel(sky, sunDirection, weather), direction, target);
}

/**
 * The haze colour toward a heading (radians from +x toward +z), for one sun and weather: the sky's mean colour just above the
 * horizon across the package's field around the heading, pulled toward a pollution-tinted white by the weather, then dimmed by
 * the sun's height and the weather.
 */
export function hazeColour(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions): (heading: number, target: Color) => Color {
  const model = skyModel(sky, sunDirection, weather), sample = new Color(), direction = new Vector3();
  const {horizonSampleElevationDeg, horizonSampleCount: count, horizonFovDeg, pollutionOffset, override, luminance, sunElevationRampDeg, sunElevationRampOffset} = sky.fog.colour;
  const elevation = MathUtils.degToRad(horizonSampleElevationDeg), spread = MathUtils.degToRad(horizonFovDeg);
  const {cloudCover: C, precipitation: S} = weather, p = effectivePollution(sky, weather);
  const white = pollutionOffset.map(offset => 1 + p * offset), toward = MathUtils.clamp(p * p + override.base + override.overcast * C + override.storm * S, 0, 1);
  const sunElevationDeg = MathUtils.radToDeg(Math.asin(MathUtils.clamp(model.sun.y, -1, 1)));
  const day = Math.min(1, Math.abs(sunElevationDeg / sunElevationRampDeg - sunElevationRampOffset));
  const dim = MathUtils.clamp(MathUtils.lerp(luminance.sunrise, luminance.base, day) * MathUtils.lerp(1, luminance.overcast, C) * MathUtils.lerp(1, luminance.storm, S), 0, 1);
  return (heading, target) => {
    target.setRGB(0, 0, 0);
    for (let i = 0; i < count; i++) {
      const yaw = heading + (count > 1 ? i / (count - 1) - 0.5 : 0) * spread;
      direction.set(Math.cos(elevation) * Math.cos(yaw), Math.sin(elevation), Math.cos(elevation) * Math.sin(yaw));
      target.add(radiance(model, direction, sample));
    }
    target.multiplyScalar(1 / count);
    const length = Math.hypot(target.r, target.g, target.b);
    if (length === 0) return target;
    const channel = (value: number, i: number) => Math.max(0, length * MathUtils.lerp(value / length, white[i], toward)) * dim;
    return target.setRGB(channel(target.r, 0), channel(target.g, 1), channel(target.b, 2));
  };
}
