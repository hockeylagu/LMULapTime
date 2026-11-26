import { describe, expect, it } from 'vitest';
import { refracted, skyBodies, type SkyBodies } from '../../../../../src/components/replay/view3d/night/skyBodies.js';
import { lightLevelSecond, nightLight, sunDirectShare, trackLightsOn, twilightLuminance, type NightModel } from '../../../../../src/components/replay/view3d/night/nightLight.js';

type Rgb = [number, number, number];
const table: [number, number][] = [[-16, 0.0018], [-15, 0.0018], [-14, 0.0019], [-13, 0.0022], [-12, 0.0031], [-11, 0.0092], [-10, 0.021], [-9, 0.047], [-8, 0.11],
  [-7, 0.3], [-6, 0.9], [-5, 2.9], [-4, 9.4], [-3, 28], [-2, 77], [-1, 190], [0, 400], [1, 710], [2, 1200], [3, 1400], [4, 1800], [5, 2200]];
/** The package's night model as the pipeline builds it from the game files (schema 23). */
const model: NightModel = {
  twilight: {sunElevationDeg: table.map(row => row[0]), illuminance: table.map(row => row[1]), scale: 5, chromaticity: [0.25, 0.25], sunScatteringScale: 1, hdrScale: 0.001, blendBelowDeg: 2},
  sunDirect: {zeroDeg: -1, exponent: 2},
  ambientMapping: {lightColorToAmbient: 0.8, useIntensity: true},
  lightLevel: {base: 0.4, sinScale: 0.8, stepS: 1800},
  moon: {reference: {rgb: [0.08309, 0.07865, 0.06008], elevationDeg: 21.29, phaseAngleDeg: 16.4}, opticalDepth: 0.2, scatterShare: 0.0175, scatterColour: [-0.223, 1.399, 0.652], zenithShare: 0.515},
  fog: {twilightShare: 0.727, hue: [1, 1, 1.05]},
};
const xyzToRgb: [Rgb, Rgb, Rgb] = [[2.3707, -0.9, -0.4706], [-0.5139, 1.4253, 0.0886], [0.0053, -0.0147, 1.0094]];
const algarve = {latitudeDeg: 37.23, longitudeDeg: -8.63, utcOffsetHours: 1};
const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const close = (values: number[], digits = 6) => values.map(v => Number(v.toPrecision(digits)));

describe('skyBodies', () => {
  it("places the sun and the moon as the game's sky middleware does (the research viewer's Algarve night replay, WEC scene date)", () => {
    const {sun, moon} = skyBodies(algarve, '2023-04-04', 21.5 * 3600);
    expect(close([sun.elevationDeg, sun.bearingDeg, moon.elevationDeg, moon.bearingDeg, moon.phaseAngleDeg])).toEqual([-18.1533, 292.573, 33.7966, 115.366, 15.8003]);
    expect(skyBodies(algarve, '2023-04-04', 13.5 * 3600).sun.elevationDeg).toBeGreaterThan(50);
  });

  it('lifts an elevation by the refraction, also below the horizon, and none near the zenith', () => {
    expect(refracted(0)).toBeCloseTo(0.482, 3);
    expect(refracted(-2)).toBeGreaterThan(-2);
    expect(refracted(86)).toBe(86);
  });

  it('refuses an unreadable date', () => {
    expect(() => skyBodies(algarve, 'race day', 0)).toThrow('unreadable date');
  });
});

describe('nightLight', () => {
  it("gives the research viewer's ambient, moonlight, fog and zenith on the Algarve night", () => {
    const night = nightLight(model, xyzToRgb, skyBodies(algarve, '2023-04-04', 21.5 * 3600));
    expect(close(night.ambient)).toEqual([0.000226193, 0.00240454, 0.00140402]);
    expect(close(night.moonLight)).toEqual([0.101798, 0.0963585, 0.0736073]);
    expect(close(night.moonDirection)).toEqual([0.750898, 0.556246, -0.35601]);
    expect(close(night.fog)).toEqual([2.70365e-6, 2.70365e-6, 2.83884e-6]);
    // The viewer's luminance row was rounded from the same inverse.
    expect(night.zenithLuminance).toBeCloseTo(0.00095774, 7);
  });

  it('reproduces the Bahrain sunset capture from the twilight alone, the moon below the horizon', () => {
    const bodies: SkyBodies = {sun: {elevationDeg: -0.83, bearingDeg: 270}, moon: {elevationDeg: -10, bearingDeg: 90, phaseAngleDeg: 90}};
    const night = nightLight(model, xyzToRgb, bodies);
    expect(night.moonLight).toEqual([0, 0, 0]);
    expect(luminance(night.ambient) / luminance([0.320, 0.485, 0.747]) - 1).toBeLessThan(0.02);
  });

  it('holds the twilight table at its ends', () => {
    expect(twilightLuminance(model, -40)).toBe(twilightLuminance(model, -16));
    expect(twilightLuminance(model, 20)).toBe(twilightLuminance(model, 5));
    expect(twilightLuminance(model, -0.5)).toBeCloseTo((190 + 400) / 2 * 5 / Math.PI * 0.001, 9);
  });
});

it("fades the sun's direct light to zero at 1° below the horizon", () => {
  expect([sunDirectShare(model, 3), sunDirectShare(model, 0), sunDirectShare(model, -0.5), sunDirectShare(model, -1), sunDirectShare(model, -5)]).toEqual([1, 1, 0.25, 0, 0]);
});

it('switches the track lights by the light level the game samples every half hour', () => {
  expect([lightLevelSecond(model, 19 * 3600 + 1799), lightLevelSecond(model, 19 * 3600 + 1800)]).toEqual([19 * 3600, 19.5 * 3600]);
  // Qatar's threshold 0.525: on with the sun 2° up (level 0.428), off at 10° (level 0.539).
  expect([trackLightsOn(model, 0.525, 2), trackLightsOn(model, 0.525, 10), trackLightsOn(model, 0.525, -30)]).toEqual([true, false, true]);
});
