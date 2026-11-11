import { BackSide, Color, MathUtils, Matrix3, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { SceneryDaylight, ScenerySky, ScenerySkyColourProfiles } from '../../../../../shared/types/scenes/scenery.js';
import { HOSEK_GLSL, hosekSkyState, hosekXyz, type HosekSkyState } from './hosekSky.js';
import { SUN_UNIT, sunRadiance } from './sunSamples.js';
import { profilesAt, timeOfDayPosition, weatherWeight } from './timeOfDay.js';

/**
 * The one module that reads the package's sky (the pipeline's docs/SCENE_PACKAGE.md "Sky and atmosphere" and "Sky dome" have the
 * formulas).
 *
 * The dome is the Hosek-Wilkie clear sky (hosekSky.ts) cooked from the package's datasets at its ground albedo and the weather's
 * turbidity, dimmed by the layout's altitude, in the same light unit as the package's sun (SUN_UNIT): the dome, the sun and the
 * ambient they feed keep the ratios they have in the source. The time-of-day colour look, chosen by the direct sun's strength like
 * the camera's profiles, scales cos γ from the sun and tints the saturated sky; the package's matrix takes XYZ to the scene's RGB.
 * The dome then hazes toward its own haze colour over the package's sky haze depth, divided by the view's height above the horizon.
 * The turbidity, the haze and the haze colours follow the weather: cloud cover C, precipitation S and the effective pollution p.
 */

/** The weather the sky is drawn for: the layout's air pollution, the cloud cover C and the precipitation term S (0 to 1). */
export interface SkyConditions { airPollution: number; cloudCover: number; precipitation: number; /** How much of the sun passes the clouds, 0 to 1; absent without a cloud field. */ sunVisibility?: number }

/** A layout's weather: its air pollution (none without daylight), the replay's cloud cover, dry. */
export function skyConditions(daylight: SceneryDaylight | undefined, cloudCover: number, sunVisibility?: number): SkyConditions {
  return {airPollution: daylight?.airPollution ?? 0, cloudCover: MathUtils.clamp(cloudCover, 0, 1), precipitation: 0, sunVisibility};
}

/** p: the air pollution, damped by cloud cover. */
const effectivePollution = (sky: ScenerySky, weather: SkyConditions) => weather.airPollution * (1 - sky.pollution.cloudyDamping * weather.cloudCover);

/** The sky's turbidity for the weather, clamped to the package's range. */
export function skyTurbidity(sky: ScenerySky, weather: SkyConditions): number {
  const {base, overcast, storm, pollution, min, max} = sky.turbidity, p = effectivePollution(sky, weather);
  return MathUtils.clamp(base + (overcast + storm) * weather.cloudCover + pollution * p * p, min, max);
}

/** The fog colour's day ramp: 0 at the ramp's sunrise, 1 by day, from the sun's elevation. */
const dayRamp = (sky: ScenerySky, sunElevationDeg: number) => Math.min(1, Math.abs(sunElevationDeg / sky.fog.colour.sunElevationRampDeg - sky.fog.colour.sunElevationRampOffset));

/**
 * The dry haze density (per metre) of a layout's daylight, clamped to the package's range; none without daylight. The base term
 * mixes from the dawn density to the day density along the fog colour's ramp, cloud cover adds its term and the damped pollution
 * its own (the package's dry formula; the storm term is not applied, every replay is dry).
 */
export function hazeDensity(sky: ScenerySky, daylight: SceneryDaylight | undefined, weather: SkyConditions, sunElevationDeg: number): number {
  if (!daylight) return 0;
  const {base, overcast, sunrise, pollution, min, max} = sky.fog.density, C = weather.cloudCover;
  const clearDay = MathUtils.lerp(sunrise * daylight.hazeDawnScale, base * daylight.hazeBaseScale, dayRamp(sky, sunElevationDeg));
  return MathUtils.clamp(clearDay + overcast * C * daylight.hazeCloudyScale + pollution * effectivePollution(sky, weather), min, max);
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

/** A sky colour look: the per-channel gains on the saturated sky and the scale of cos γ from the sun. */
export interface SkyColourLook { gain: [number, number, number]; sunProximity: number }

/**
 * The sky's colour look for the direct sun (its RGB in the package's light unit) under the weather: the two profiles around the
 * sun's position along their knots (timeOfDay.ts), each blended from its clear look toward its overcast one, then mixed.
 */
export function skyColourLook(sky: ScenerySky, sun: Color, sunElevationDeg: number, weather: SkyConditions): SkyColourLook {
  const {profiles} = sky.colourProfiles;
  const look = (profile: ScenerySkyColourProfiles['profiles'][number]): SkyColourLook => {
    const w = weatherWeight(weather.cloudCover, profile.weatherLerpPower, weather.sunVisibility), {clear, overcast} = profile;
    return {gain: [0, 1, 2].map(i => MathUtils.lerp(clear.gain[i], overcast.gain[i], w)) as [number, number, number], sunProximity: MathUtils.lerp(clear.sunProximity, overcast.sunProximity, w)};
  };
  const [low, high, t] = profilesAt(profiles, timeOfDayPosition(profiles.map(profile => profile.sunTarget), sun, sunElevationDeg));
  const a = look(low), b = look(high);
  return {gain: [0, 1, 2].map(i => MathUtils.lerp(a.gain[i], b.gain[i], t)) as [number, number, number], sunProximity: MathUtils.lerp(a.sunProximity, b.sunProximity, t)};
}

/**
 * The dome's haze optical depth at the zenith, depth·intensity, divided by the view's height above the horizon: depth = base +
 * overcast·C + pollution·p and intensity = lerp(dawn·hazeDawnScale, base·hazeBaseScale, D) + overcast·C·hazeCloudyScale, with D the
 * fog colour's day ramp. None without daylight, as the scene's haze.
 */
export function skyHazeDepth(sky: ScenerySky, daylight: SceneryDaylight | undefined, weather: SkyConditions, sunElevationDeg: number): number {
  if (!daylight) return 0;
  const {depth, intensity} = sky.haze, C = weather.cloudCover;
  const thickness = depth.base + depth.overcast * C + depth.pollution * effectivePollution(sky, weather);
  const strength = MathUtils.lerp(intensity.dawn * daylight.hazeDawnScale, intensity.base * daylight.hazeBaseScale, dayRamp(sky, sunElevationDeg)) + intensity.overcast * C * daylight.hazeCloudyScale;
  return thickness * strength;
}

/** The sky for one sun: the cooked Hosek-Wilkie state and everything the dome applies after it. */
interface SkyModel {
  state: HosekSkyState; sun: Vector3; isothermal: number;
  xyzToRgb: ScenerySky['hosek']['xyzToRgb']; look: SkyColourLook; sunElevationDeg: number;
}

function skyModel(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions): SkyModel {
  const sun = sunDirection.clone().normalize(), elevation = Math.asin(MathUtils.clamp(sun.y, -1, 1)), sunElevationDeg = MathUtils.radToDeg(elevation);
  const {hosek} = sky, state = hosekSkyState(hosek, skyTurbidity(sky, weather), hosek.albedo, elevation);
  const look = skyColourLook(sky, sunRadiance(sky.sun, sunElevationDeg, weather.cloudCover), sunElevationDeg, weather);
  const isothermal = Math.exp(-hosek.altitudeM / hosek.scaleHeightM);
  return {state, sun, isothermal, xyzToRgb: hosek.xyzToRgb, look, sunElevationDeg};
}

/**
 * The dome's radiance toward a view direction (GLSL): the Hosek-Wilkie XYZ with cos γ from the sun scaled by the look's sun
 * proximity, its luminance dimmed by the altitude, to RGB through the package's matrix, lifted out of a negative channel, then each channel scaled toward the look's
 * gain by the saturation, in scene units.
 */
const SKY_RGB_GLSL = `${HOSEK_GLSL}
      vec3 skyRgb(vec3 dir) {
        float cosTheta = max(dir.y, 0.0) + 0.001, cosGamma = clamp(dot(dir, sunDirection) * sunProximity, -1.0, 1.0), gamma = acos(cosGamma);
        vec3 XYZ = vec3(hosek(coefficientsX, cosTheta, gamma, cosGamma), hosek(coefficientsY, cosTheta, gamma, cosGamma), hosek(coefficientsZ, cosTheta, gamma, cosGamma)) * radiances;
        vec3 xyY = vec3(XYZ.xy / (XYZ.x + XYZ.y + XYZ.z), XYZ.y * isothermal);
        vec3 rgb = xyzToRgb * vec3(xyY.x * xyY.z / xyY.y, xyY.z, (1.0 - xyY.x - xyY.y) * xyY.z / xyY.y);
        rgb -= min(0.0, min(rgb.r, min(rgb.g, rgb.b)));
        float high = max(max(rgb.r, max(rgb.g, rgb.b)), 1e-5), saturation = (high - min(rgb.r, min(rgb.g, rgb.b))) / high;
        return rgb * mix(vec3(1.0), gain, saturation) * ${SUN_UNIT.toFixed(6)};
      }`;

/**
 * The direction the sky is coloured for along a view direction. The sky is a cube of `size` around the eye, moved by `yOffset`
 * along y, and each of its points has the colour of its direction from the cube's own centre: with the cube hanging below the eye,
 * the eye's horizon gets the colour of a direction a little above the model's horizon.
 */
export function skyBoxDirection(box: ScenerySky['hosek']['box'], view: Vector3, target = new Vector3()): Vector3 {
  const half = box.size / 2, t = Math.min(half / Math.abs(view.x), half / Math.abs(view.z), (view.y > 0 ? half + box.yOffset : half - box.yOffset) / Math.abs(view.y));
  return target.copy(view).multiplyScalar(t).setY(view.y * t - box.yOffset).normalize();
}

const SKY_BOX_GLSL = `
      vec3 skyBoxDirection(vec3 view) {
        vec3 size = abs(view);
        float reach = 0.5 * skyBox.x, t = min(min(reach / max(size.x, 1e-6), reach / max(size.z, 1e-6)), (view.y > 0.0 ? reach + skyBox.y : reach - skyBox.y) / max(size.y, 1e-6));
        return normalize(view * t - vec3(0.0, skyBox.y, 0.0));
      }`;

/**
 * The sky dome's material: radiance toward each view direction as the sky box turns it (`skyBoxDirection`), drawn at infinity,
 * hazed toward `hazeColour` (the sky haze colour toward the view, sceneEnvironment.ts keeps it current; black until then) by
 * exp(−depth / cos θ).
 */
export function createSkyDomeMaterial(sunDirection: Vector3, sky: ScenerySky, daylight: SceneryDaylight | undefined, weather: SkyConditions): ShaderMaterial {
  const model = skyModel(sky, sunDirection, weather), [kx, ky, kz] = model.state.coefficients;
  return new ShaderMaterial({
    name: 'sky-dome',
    uniforms: {
      hazeColour: {value: new Color(0, 0, 0)}, hazeDepth: {value: skyHazeDepth(sky, daylight, weather, model.sunElevationDeg)},
      skyBox: {value: new Vector2(sky.hosek.box.size, sky.hosek.box.yOffset)},
      sunDirection: {value: model.sun}, coefficientsX: {value: kx}, coefficientsY: {value: ky}, coefficientsZ: {value: kz},
      radiances: {value: new Vector3(...model.state.radiances)}, isothermal: {value: model.isothermal},
      sunProximity: {value: model.look.sunProximity}, gain: {value: new Vector3(...model.look.gain)},
      xyzToRgb: {value: new Matrix3().set(...model.xyzToRgb[0], ...model.xyzToRgb[1], ...model.xyzToRgb[2])},
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;\n#ifdef USE_REVERSED_DEPTH_BUFFER\ngl_Position.z = 0.0;\n#else\ngl_Position.z = gl_Position.w;\n#endif\n}`,
    fragmentShader: `
      uniform vec3 sunDirection, radiances, gain, hazeColour; uniform float isothermal, sunProximity, hazeDepth;
      uniform float coefficientsX[9], coefficientsY[9], coefficientsZ[9]; uniform mat3 xyzToRgb; uniform vec2 skyBox;
      varying vec3 vWorld;${SKY_RGB_GLSL}${SKY_BOX_GLSL}
      void main() {
        vec3 dir = skyBoxDirection(normalize(vWorld - cameraPosition));
        gl_FragColor = vec4(mix(hazeColour, skyRgb(dir), exp(-hazeDepth / (max(dir.y, 0.0) + 0.001))), 1.0);
      }`,
    side: BackSide, depthWrite: false,
  });
}

/** The dome's radiance without haze, as skyRgb draws it (the haze colours are sampled from it). */
function radiance(model: SkyModel, direction: Vector3, target: Color): Color {
  const cosTheta = Math.max(direction.y, 0) + 0.001, cosGamma = MathUtils.clamp(direction.dot(model.sun) * model.look.sunProximity, -1, 1);
  const [X0, Y0, Z0] = hosekXyz(model.state, cosTheta, cosGamma), sum = X0 + Y0 + Z0;
  const x = X0 / sum, y = Y0 / sum, Y = Y0 * model.isothermal;
  const xyz = [x * Y / y, Y, (1 - x - y) * Y / y], rgb = model.xyzToRgb.map(row => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]);
  const lift = Math.min(0, ...rgb), lifted = rgb.map(value => value - lift), high = Math.max(...lifted, 1e-5), saturation = (high - Math.min(...lifted)) / high;
  const channel = (i: number) => lifted[i] * MathUtils.lerp(1, model.look.gain[i], saturation) * SUN_UNIT;
  return target.setRGB(channel(0), channel(1), channel(2));
}

/** The sky's radiance toward a unit direction, as the dome draws it before its haze. */
export function skyRadiance(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions, direction: Vector3, target = new Color()): Color {
  return radiance(skyModel(sky, sunDirection, weather), direction, target);
}

/**
 * The haze colours toward a heading (radians from +x toward +z), for one sun and weather. Both start from the sky's mean colour
 * just above the horizon across the package's field around the heading, pulled toward a pollution-tinted white by the weather. The
 * scene's fog colour is that dimmed by the fog luminance (sun height and weather); the dome's own haze colour, written to
 * `skyTarget` when given, by the sky haze luminance (which also falls with pollution).
 */
export function hazeColour(sky: ScenerySky, sunDirection: Vector3, weather: SkyConditions): (heading: number, target: Color, skyTarget?: Color) => Color {
  const model = skyModel(sky, sunDirection, weather), sample = new Color(), direction = new Vector3();
  const {horizonSampleElevationDeg, horizonSampleCount: count, horizonFovDeg, pollutionOffset, override, luminance} = sky.fog.colour;
  const elevation = MathUtils.degToRad(horizonSampleElevationDeg), spread = MathUtils.degToRad(horizonFovDeg);
  const {cloudCover: C, precipitation: S} = weather, p = effectivePollution(sky, weather);
  const white = pollutionOffset.map(offset => 1 + p * offset), toward = MathUtils.clamp(p * p + override.base + override.overcast * C + override.storm * S, 0, 1);
  const day = dayRamp(sky, model.sunElevationDeg), skyLuminance = sky.haze.luminance;
  const dim = MathUtils.clamp(MathUtils.lerp(luminance.sunrise, luminance.base, day) * MathUtils.lerp(1, luminance.overcast, C) * MathUtils.lerp(1, luminance.storm, S), 0, 1);
  const skyDim = MathUtils.clamp(MathUtils.lerp(skyLuminance.sunrise, skyLuminance.base, day) * MathUtils.lerp(1, skyLuminance.pollution, p)
    * MathUtils.lerp(1, skyLuminance.overcast, C) * MathUtils.lerp(1, skyLuminance.storm, S), 0, 1);
  return (heading, target, skyTarget) => {
    target.setRGB(0, 0, 0);
    for (let i = 0; i < count; i++) {
      const yaw = heading + (count > 1 ? i / (count - 1) - 0.5 : 0) * spread;
      direction.set(Math.cos(elevation) * Math.cos(yaw), Math.sin(elevation), Math.cos(elevation) * Math.sin(yaw));
      target.add(radiance(model, direction, sample));
    }
    target.multiplyScalar(1 / count);
    const length = Math.hypot(target.r, target.g, target.b);
    if (length > 0) {
      const channel = (value: number, i: number) => Math.max(0, length * MathUtils.lerp(value / length, white[i], toward));
      target.setRGB(channel(target.r, 0), channel(target.g, 1), channel(target.b, 2));
    }
    skyTarget?.copy(target).multiplyScalar(skyDim);
    return target.multiplyScalar(dim);
  };
}
