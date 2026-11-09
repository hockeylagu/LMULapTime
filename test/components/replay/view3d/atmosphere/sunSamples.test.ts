import { expect, it } from 'vitest';
import { relativeAirMass, sunRadiance } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import type { ScenerySun } from '../../../../../shared/types/scenes/scenery.js';

// A clear row shaped like a real atmosphere: each channel falls as exp(-depth · air mass), red least, blue most.
const depth = [0.05, 0.08, 0.14] as const;
const at = (elevationDeg: number, scale = 100): [number, number, number] => depth.map(d => scale * Math.exp(-d * relativeAirMass(elevationDeg))) as [number, number, number];
const elevations = [1.35, 9.55, 28.3, 56.2, 70.3];
const close = (actual: number[], expected: readonly number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
const sun: ScenerySun = {unit: 'test', sunElevationDeg: elevations, cloudCoverage: [0, 0.5, 1], grid: [100, 50, 10].map(scale => elevations.map(e => at(e, scale)))};

it('is one atmosphere at the zenith and about 38 near the horizon', () => {
  expect(relativeAirMass(90)).toBeCloseTo(1, 3);
  expect(relativeAirMass(0)).toBeCloseTo(37.9, 0);
});

it('returns the samples exactly and interpolates the log of each channel in air mass between them', () => {
  close(sunRadiance(sun, 28.3, 0).toArray(), at(28.3));
  // 36.7° sits in the 28.3–56.2 gap; an exponential in air mass is reproduced exactly by the rule.
  const [r, g, b] = sunRadiance(sun, 36.7, 0).toArray(), [er, eg, eb] = at(36.7);
  expect(r).toBeCloseTo(er, 6); expect(g).toBeCloseTo(eg, 6); expect(b).toBeCloseTo(eb, 6);
  // Linear in elevation would be wrong here by a visible amount.
  const linear = at(28.3)[2] + (at(56.2)[2] - at(28.3)[2]) * (36.7 - 28.3) / (56.2 - 28.3);
  expect(Math.abs(linear - eb) / eb).toBeGreaterThan(0.01);
});

it('holds the nearest sample outside the sampled elevations', () => {
  close(sunRadiance(sun, -5, 0).toArray(), at(1.35));
  close(sunRadiance(sun, 89, 0).toArray(), at(70.3));
});

it('is linear in cloud coverage between rows and clamped beyond them', () => {
  expect(sunRadiance(sun, 56.2, 0.25).g).toBeCloseTo((at(56.2)[1] + at(56.2, 50)[1]) / 2, 9);
  close(sunRadiance(sun, 56.2, 1.4).toArray(), at(56.2, 10));
  close(sunRadiance(sun, 56.2, -0.1).toArray(), at(56.2));
});
