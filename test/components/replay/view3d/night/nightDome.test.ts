import { expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { nightDome, nightXyY } from '../../../../../src/components/replay/view3d/night/nightDome.js';
import { createSkyDomeMaterial, hazeColour, skyConditions, skyTurbidity, type NightSky } from '../../../../../src/components/replay/view3d/atmosphere/skyDome.js';
import { TEST_HAZE_WEIGHTS, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const daylight = {date: '2023-09-10', sessions: [], airPollution: 0, hazeBaseScale: 1, ...TEST_HAZE_WEIGHTS, latitudeDeg: 0, longitudeDeg: 0, utcOffsetHours: 0};
const clear = skyConditions(daylight, 0), night = {chromaticity: [0.25, 0.25] as const, zenithLuminance: 0.001, weight: 1};
// The sun 12° below the horizon, toward +x.
const below = new Vector3(Math.cos(-12 * Math.PI / 180), Math.sin(-12 * Math.PI / 180), 0);
/** The fog colour toward +x, sampled from the dome just above the horizon. */
const haze = (dark?: NightSky) => hazeColour(testSky(), below, clear, dark)(0, new Color());

it("puts the night dome's zenith at the twilight's chromaticity and the night model's luminance", () => {
  const thetaSun = Math.PI / 2 + 12 * Math.PI / 180, dome = nightDome(testSky(), skyTurbidity(testSky(), clear), -12, [0.25, 0.25], 0.001);
  expect(nightXyY(dome, 1, thetaSun, Math.cos(thetaSun)).map(v => +v.toPrecision(12))).toEqual([0.25, 0.25, 0.001]);
  // Brighter toward the horizon than at the zenith, as Preetham's Perez sky is.
  expect(nightXyY(dome, 0.05, Math.PI / 2, 0)[2]).toBeGreaterThan(0.001);
});

it('draws the night dome in place of the day sky, its light following the zenith luminance', () => {
  // The haze takes its colour from the night dome, in proportion to its zenith luminance.
  const lit = haze(night), twice = haze({...night, zenithLuminance: 0.002});
  expect(lit.equals(haze())).toBe(false);
  expect(twice.g / lit.g).toBeCloseTo(2, 9);
});

it('mixes the day and night domes by the night weight, one program for both', () => {
  const at = (weight: number) => haze({...night, weight});
  const day = haze(), full = at(1), half = at(0.5);
  expect(at(0).equals(day)).toBe(true);
  expect(half.g).toBeGreaterThan(Math.min(day.g, full.g)); expect(half.g).toBeLessThan(Math.max(day.g, full.g));
  const sky = testSky(), plain = createSkyDomeMaterial(below, sky, daylight, clear), dark = createSkyDomeMaterial(below, sky, daylight, clear, {...night, weight: 0.25});
  expect([plain.uniforms.nightWeight.value, dark.uniforms.nightWeight.value]).toEqual([0, 0.25]);
  expect(dark.fragmentShader).toBe(plain.fragmentShader);
});
