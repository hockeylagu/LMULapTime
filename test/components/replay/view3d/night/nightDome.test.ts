import { expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { nightDome, nightXyY } from '../../../../../src/components/replay/view3d/night/nightDome.js';
import { createSkyDomeMaterial, hazeColour, skyConditions, skyRadiance, skyTurbidity } from '../../../../../src/components/replay/view3d/atmosphere/skyDome.js';
import { testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const clear = skyConditions(undefined, 0), night = {chromaticity: [0.25, 0.25] as const, zenithLuminance: 0.001, weight: 1};
// The sun 12° below the horizon, toward +x.
const below = new Vector3(Math.cos(-12 * Math.PI / 180), Math.sin(-12 * Math.PI / 180), 0);

it("puts the night dome's zenith at the twilight's chromaticity and the night model's luminance", () => {
  const thetaSun = Math.PI / 2 + 12 * Math.PI / 180, dome = nightDome(testSky(), skyTurbidity(testSky(), clear), -12, [0.25, 0.25], 0.001);
  expect(nightXyY(dome, 1, thetaSun, Math.cos(thetaSun)).map(v => +v.toPrecision(12))).toEqual([0.25, 0.25, 0.001]);
  // Brighter toward the horizon than at the zenith, as Preetham's Perez sky is.
  expect(nightXyY(dome, 0.05, Math.PI / 2, 0)[2]).toBeGreaterThan(0.001);
});

it('draws the night dome in place of the day sky, its light following the zenith luminance', () => {
  const sky = testSky(), up = new Vector3(0, 1, 0);
  const lit = skyRadiance(sky, below, clear, up, new Color(), night), twice = skyRadiance(sky, below, clear, up, new Color(), {...night, zenithLuminance: 0.002});
  expect(lit.equals(skyRadiance(sky, below, clear, up))).toBe(false);
  expect(twice.g / lit.g).toBeCloseTo(2, 9);
  // The haze takes its colour from the night dome too.
  const heading = 0, day = hazeColour(sky, below, clear)(heading, new Color()), dark = hazeColour(sky, below, clear, night)(heading, new Color());
  expect(dark.equals(day)).toBe(false);
});

it('mixes the day and night domes by the night weight, one program for both', () => {
  const sky = testSky(), up = new Vector3(0, 1, 0), at = (weight: number) => skyRadiance(sky, below, clear, up, new Color(), {...night, weight});
  const day = skyRadiance(sky, below, clear, up), full = at(1), half = at(0.5);
  // By radiance: halfway between the two at a weight of 0.5 (before the colour look's gain, which a grey-ish zenith barely moves).
  expect(at(0).equals(day)).toBe(true);
  expect(half.g).toBeGreaterThan(Math.min(day.g, full.g)); expect(half.g).toBeLessThan(Math.max(day.g, full.g));
  const plain = createSkyDomeMaterial(below, sky, undefined, clear), dark = createSkyDomeMaterial(below, sky, undefined, clear, {...night, weight: 0.25});
  expect([plain.uniforms.nightWeight.value, dark.uniforms.nightWeight.value]).toEqual([0, 0.25]);
  expect(dark.fragmentShader).toBe(plain.fragmentShader);
});