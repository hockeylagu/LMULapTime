import { expect, it } from 'vitest';
import { Color, MathUtils, type Matrix3, Vector3 } from 'three';
import { createSkyDomeMaterial, hazeColour, hazeDensity, heightHaze, setSkyDome, skyColourLook, skyConditions, skyHazeDepth, skyTurbidity, sunwardHaze, type SkyConditions } from '../../../../../src/components/replay/view3d/atmosphere/skyDome.js';
import { hosekSkyState, hosekXyz } from '../../../../../src/components/replay/view3d/atmosphere/hosekSky.js';
import { GAME_LIGHT_UNIT, sunRadiance } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { TEST_HAZE_WEIGHTS, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';
import type { ScenerySky } from '../../../../../shared/types/scenes/scenery.js';

const daylight = {date: '2023-09-10', sessions: [], airPollution: 0.5, hazeBaseScale: 2, ...TEST_HAZE_WEIGHTS, fogHeightAltitudeScalar: 3, fogHeightExponentScalar: 0.5, latitudeDeg: 0, longitudeDeg: 0, utcOffsetHours: 0};
/** The same daylight without air pollution: the sky at the package's base turbidity. */
const clean = {...daylight, airPollution: 0};
const sun = new Vector3(1, 1, 0).normalize(), clear = skyConditions(clean, 0);
const atAltitude = (altitudeM: number) => { const sky = testSky(); sky.hosek.altitudeM = altitudeM; return sky; };

/**
 * The dome's radiance toward a direction for the 45° sun, worked out here from the model: the Hosek-Wilkie XYZ at the weather's
 * turbidity with cos γ scaled by the look's sun proximity, dimmed by the altitude, to RGB, lifted out of a negative channel and
 * tinted by the look's gain in proportion to its saturation, in the light unit.
 */
function expectedRadiance(sky: ScenerySky, weather: SkyConditions, direction: Vector3): number[] {
  const state = hosekSkyState(sky.hosek, skyTurbidity(sky, weather), sky.hosek.albedo, Math.PI / 4), look = skyColourLook(sky, sunRadiance(sky.sun, 45, weather.cloudCover), 45, weather);
  const isothermal = Math.exp(-sky.hosek.altitudeM / sky.hosek.scaleHeightM);
  const [X, Y, Z] = hosekXyz(state, Math.max(direction.y, 0) + 0.001, MathUtils.clamp(direction.dot(sun) * look.sunProximity, -1, 1)).map(v => v * isothermal);
  const rgb = sky.hosek.xyzToRgb.map(row => row[0] * X + row[1] * Y + row[2] * Z);
  const lift = Math.min(0, ...rgb), lifted = rgb.map(v => v - lift), saturation = (Math.max(...lifted) - Math.min(...lifted)) / Math.max(...lifted);
  return lifted.map((v, i) => v * (1 + saturation * (look.gain[i] - 1)) * GAME_LIGHT_UNIT);
}

it("draws the Hosek-Wilkie sky at the weather's turbidity and the package's albedo, dimmed by the altitude, hazed toward its haze colour", () => {
  const sky = atAltitude(400), material = createSkyDomeMaterial(sun, sky, daylight, clear), state = hosekSkyState(sky.hosek, 2, 0.2, Math.PI / 4);
  expect(material.name).toBe('sky-dome');
  expect((material.uniforms.sunDirection.value as Vector3).distanceTo(sun)).toBeLessThan(1e-12);
  expect(material.uniforms.coefficientsY.value).toEqual(state.coefficients[1]);
  expect((material.uniforms.radiances.value as Vector3).toArray()).toEqual(state.radiances);
  expect(material.uniforms.isothermal.value).toBeCloseTo(Math.exp(-400 / 8000), 12);
  // The matrix is the package's rows (three keeps columns).
  expect((material.uniforms.xyzToRgb.value as Matrix3).elements[1]).toBe(-0.9689);
  // Hazed toward its own haze colour (black until the scene sets it) over the sky haze depth divided by the view's height.
  expect((material.uniforms.hazeColour.value as Color).toArray()).toEqual([0, 0, 0]);
  expect(material.uniforms.hazeDepth.value).toBe(skyHazeDepth(sky, daylight, clear, 45));
  expect(material.fragmentShader).toContain('gl_FragColor = vec4(mix(hazeColour, skyRgb(dir), exp(-hazeDepth / (max(dir.y, 0.0) + 0.001))), 1.0);');
  // The altitude dims every channel of the sky alike, so the haze colours sampled from it too.
  const low = hazeColour(atAltitude(0), sun, clear)(0, new Color()), high = hazeColour(sky, sun, clear)(0, new Color());
  for (const channel of ['r', 'g', 'b'] as const) expect(high[channel] / low[channel]).toBeCloseTo(Math.exp(-400 / 8000), 9);
});

it('moves the sky in its own uniforms, keeping its program and its haze colour', () => {
  const sky = atAltitude(400), material = createSkyDomeMaterial(sun, sky, daylight, clear), haze = material.uniforms.hazeColour.value as Color;
  const low = new Vector3(1, 0.1, 0).normalize(), rain = skyConditions(daylight, 0.8);
  setSkyDome(material, low, sky, daylight, rain);
  const fresh = createSkyDomeMaterial(low, sky, daylight, rain);
  for (const name of Object.keys(fresh.uniforms)) if (name !== 'hazeColour') expect(material.uniforms[name].value).toEqual(fresh.uniforms[name].value);
  expect(material.uniforms.hazeColour.value).toBe(haze);
});

it("picks the colour look by the direct sun's strength and blends each look toward its overcast one", () => {
  const sky = testSky(), strength = (cover: number) => { const c = sunRadiance(sky.sun, 45, cover); return Math.max(c.r, c.g, c.b); };
  // Knots 0 and 200: the strength's share of 200 is the way from the neutral look to the cool one.
  const t = strength(0) / 200, look = skyColourLook(sky, sunRadiance(sky.sun, 45, 0), 45, clear);
  look.gain.forEach((gain, i) => expect(gain).toBeCloseTo([1, 1 - 0.2 * t, 1 - 0.4 * t][i], 12));
  expect(look.sunProximity).toBeCloseTo(0.8 + 0.2 * t, 12);
  // Full cover: both ends are their overcast looks.
  const covered = skyColourLook(sky, sunRadiance(sky.sun, 45, 1), 45, skyConditions(clean, 1)), u = strength(1) / 200;
  covered.gain.forEach(gain => expect(gain).toBeCloseTo(1 - 0.1 * u, 12));
  expect(covered.sunProximity).toBe(1);
});

it('raises the turbidity with cloud and pollution (damped by cloud) inside the package range', () => {
  const sky = testSky();
  expect(skyTurbidity(sky, clear)).toBe(2);
  // p = 0.5: 2 + 2·0.25.
  expect(skyTurbidity(sky, skyConditions(daylight, 0))).toBeCloseTo(2.5, 12);
  // C = 0.4: p = 0.5·(1 − 0.5·0.4) = 0.4, 2 + 2·0.4 + 2·0.16.
  expect(skyTurbidity(sky, skyConditions(daylight, 0.4))).toBeCloseTo(3.12, 12);
  expect(skyTurbidity(sky, {airPollution: 5, cloudCover: 1, precipitation: 1})).toBe(6);
  expect(skyConditions(daylight, 1.7)).toEqual({airPollution: 0.5, cloudCover: 1, precipitation: 0});
});

it("sets the haze density and the height term from the layout's daylight, the cloud cover and the sun's height", () => {
  const sky = testSky();
  // A clear high sun: the day density base·hazeBaseScale + pollution·airPollution.
  expect(hazeDensity(sky, daylight, skyConditions(daylight, 0), 60)).toBeCloseTo(0.0002 * 2 + 0.0004 * 0.5, 12);
  // 15° on the 30°/0.4 ramp is a tenth of the way from the dawn density; cover 0.4 adds its term and damps the pollution to 0.4.
  expect(hazeDensity(sky, daylight, skyConditions(daylight, 0.4), 15)).toBeCloseTo(0.0001 + 0.1 * (0.0004 - 0.0001) + 0.0001 * 0.4 + 0.0004 * 0.4, 12);
  expect(hazeDensity(sky, {...daylight, hazeBaseScale: 1000}, skyConditions(daylight, 0), 60)).toBe(0.02);
  expect(heightHaze(sky, daylight, skyConditions(daylight, 0.2))).toEqual({amount: 0.4, rate: 0.006, exponent: 0.75});
  expect(heightHaze(sky, {...daylight, fogHeightAltitudeScalar: 100, fogHeightExponentScalar: 0}, clear)).toEqual({amount: 0.5, rate: 0.02, exponent: 0.05});
  expect(sunwardHaze(sky, skyConditions(daylight, 0.2))).toBeCloseTo(0.04, 12);
});

it("thickens the dome's own haze with cloud and pollution and strengthens it from dawn to day", () => {
  const sky = testSky();
  // C = 0.2, p = 0.45: depth 0.2 + 0.3·0.2 + 0.1·0.45; a high sun takes the base intensity ·2 (hazeBaseScale), cloud adds 0.5·0.2.
  expect(skyHazeDepth(sky, daylight, skyConditions(daylight, 0.2), 60)).toBeCloseTo((0.2 + 0.06 + 0.045) * (2 + 0.1), 12);
  // 15° is a tenth of the way along the day ramp from the dawn intensity (2·1).
  expect(skyHazeDepth(sky, daylight, skyConditions(daylight, 0), 15)).toBeCloseTo((0.2 + 0.1 * 0.5) * (2 + 0.1 * (2 - 2)), 12);
});

it('colours both hazes with the mean horizon sky, pulled toward a pollution-tinted white, each dimmed by its own luminance', () => {
  const sky = testSky(), weather = skyConditions(daylight, 0.2), haze = hazeColour(sky, sun, weather);
  // Six directions 5° up, spread over 30° around the heading.
  const H = [0, 0, 0];
  for (let i = 0; i < 6; i++) {
    const yaw = (i / 5 - 0.5) * Math.PI / 6, up = 5 * Math.PI / 180;
    expectedRadiance(sky, weather, new Vector3(Math.cos(up) * Math.cos(yaw), Math.sin(up), Math.cos(up) * Math.sin(yaw))).forEach((v, c) => { H[c] += v / 6; });
  }
  const L = Math.hypot(...H), p = 0.5 * (1 - 0.5 * 0.2), w = p * p + 0.2 + 0.5 * 0.2, white = [1 + p * 0.2, 1 + p * 0.05, 1];
  const adjusted = H.map((v, i) => L * (v / L + (white[i] - v / L) * w));
  // Sun at 45°: |45 / 30 − 0.4| clamps to 1, the base luminances. The fog: cloud 0.2 dims by lerp(1, 0.3, 0.2). The dome's haze: its
  // base 0.8, pollution lerp(1, 0.9, p), cloud lerp(1, 0.6, 0.2).
  const dim = 0.5 * (1 + (0.3 - 1) * 0.2), skyDim = 0.8 * (1 - 0.1 * p) * (1 - 0.4 * 0.2);
  const skyTarget = new Color(), got = haze(0, new Color(), skyTarget);
  for (const [i, v] of [got.r, got.g, got.b].entries()) expect(v / (adjusted[i] * dim)).toBeCloseTo(1, 9);
  for (const [i, v] of [skyTarget.r, skyTarget.g, skyTarget.b].entries()) expect(v / (adjusted[i] * skyDim)).toBeCloseTo(1, 9);
  // Away from the sun the haze is darker.
  expect(haze(Math.PI, new Color()).r).toBeLessThan(got.r);
});

it("colours the sky for the direction from the sky box's own centre, which lifts the eye's horizon", () => {
  const material = createSkyDomeMaterial(sun, testSky(), daylight, clear);
  expect((material.uniforms.skyBox.value as {x: number; y: number})).toMatchObject({x: 1000, y: -20});
  expect(material.fragmentShader).toContain('vec3 dir = skyBoxDirection(normalize(vWorld - cameraPosition));');
});
