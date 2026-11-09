import { expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { createPerezSkyMaterial, hazeColour, hazeDensity, heightHaze, perezScales, skyConditions, skyRadiance, skyTurbidity, sunwardHaze } from '../../../../../src/components/replay/view3d/atmosphere/perezSky.js';
import { TEST_HAZE_WEIGHTS, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const sun = new Vector3(1, 1, 0).normalize(), clear = skyConditions(undefined, 0);
const daylight = {date: '2023-09-10', sessions: [], airPollution: 0.5, hazeBaseScale: 2, ...TEST_HAZE_WEIGHTS, fogHeightAltitudeScalar: 3, fogHeightExponentScalar: 0.5, latitudeDeg: 0, longitudeDeg: 0, utcOffsetHours: 0};

it("scales the Perez coefficients by the package's scales and the multipliers at the sun's height, linear between rows", () => {
  expect(perezScales(testSky(), 20)).toEqual([0.8, 0.4, 0.2, 2, 1]);
  expect(perezScales(testSky(), 0)).toEqual([1, 0.5, 0.5, 2, 1]);
  const between = perezScales(testSky(), 10);
  expect(between.map(v => +v.toFixed(9))).toEqual([0.9, 0.45, 0.35, 2, 1]);
  expect(perezScales(testSky(), 55).map(v => +v.toFixed(9))).toEqual([0.9, 0.45, 0.35, 2, 1]);
  expect(() => perezScales({...testSky(), perezMultipliers: testSky().perezMultipliers.slice(1)}, 10)).toThrow('no Perez multipliers at 10.00°');
  expect(() => perezScales({...testSky(), perezMultipliers: testSky().perezMultipliers.slice(0, 2)}, 45)).toThrow('no Perez multipliers at 45.00°');
  const material = createPerezSkyMaterial(sun, testSky(), clear);
  expect((material.uniforms.sunDirection.value as Vector3).distanceTo(sun)).toBeLessThan(1e-12);
  expect(material.uniforms.coefficientsY.value).toHaveLength(5);
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

it("sets the clear-day haze density and the height term from the layout's daylight", () => {
  const sky = testSky();
  expect(hazeDensity(sky, daylight)).toBeCloseTo(0.0002 * 2 + 0.0004 * 0.5, 12);
  expect(hazeDensity(sky, {...daylight, hazeBaseScale: 1000})).toBe(0.02);
  expect(hazeDensity(sky)).toBe(0);
  expect(heightHaze(sky, daylight, skyConditions(daylight, 0.2))).toEqual({amount: 0.4, rate: 0.006, exponent: 0.75});
  expect(heightHaze(sky, {...daylight, fogHeightAltitudeScalar: 100, fogHeightExponentScalar: 0}, clear)).toEqual({amount: 0.5, rate: 0.02, exponent: 0.05});
  expect(heightHaze(sky, undefined, clear).amount).toBe(0);
  expect(sunwardHaze(sky, skyConditions(daylight, 0.2))).toBeCloseTo(0.04, 12);
});

it('brightens toward the sun and toward the horizon, with a blue zenith', () => {
  const sky = testSky(), at = (x: number, y: number, z: number) => skyRadiance(sky, sun, clear, new Vector3(x, y, z).normalize());
  const zenith = at(0, 1, 0), sunward = at(1, 0.05, 0), away = at(-1, 0.05, 0);
  expect(zenith.b).toBeGreaterThan(zenith.r);
  expect(sunward.r + sunward.g + sunward.b).toBeGreaterThan(away.r + away.g + away.b);
  expect([zenith, sunward, away].every(colour => colour.toArray().every(v => Number.isFinite(v) && v >= 0))).toBe(true);
});

it('colours the haze with the mean horizon sky, pulled toward a pollution-tinted white and dimmed by sun height and weather', () => {
  const sky = testSky(), weather = skyConditions(daylight, 0.2), haze = hazeColour(sky, sun, weather);
  // Six directions 5° up, spread over 30° around the heading.
  const H = new Color(0, 0, 0), sample = new Color();
  for (let i = 0; i < 6; i++) {
    const yaw = (i / 5 - 0.5) * Math.PI / 6, up = 5 * Math.PI / 180;
    H.add(skyRadiance(sky, sun, weather, new Vector3(Math.cos(up) * Math.cos(yaw), Math.sin(up), Math.cos(up) * Math.sin(yaw)), sample));
  }
  H.multiplyScalar(1 / 6);
  const L = Math.hypot(H.r, H.g, H.b), p = 0.5 * (1 - 0.5 * 0.2), w = p * p + 0.2 + 0.5 * 0.2;
  // Sun at 45°: |45 / 30 − 0.4| clamps to 1, the base luminance; cloud 0.2 dims by lerp(1, 0.3, 0.2).
  const dim = 0.5 * (1 + (0.3 - 1) * 0.2), white = [1 + p * 0.2, 1 + p * 0.05, 1];
  const expected = [H.r, H.g, H.b].map((v, i) => L * (v / L + (white[i] - v / L) * w) * dim);
  const got = haze(0, new Color());
  for (const [i, v] of [got.r, got.g, got.b].entries()) expect(v / expected[i]).toBeCloseTo(1, 9);
  // Away from the sun the haze is darker.
  expect(haze(Math.PI, new Color()).r).toBeLessThan(got.r);
});
