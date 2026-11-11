import { describe, expect, it } from 'vitest';
import { cloudCoverage, cloudSheets, sunVisibility, type CloudMoment } from '../../../../../src/components/replay/view3d/atmosphere/clouds.js';
import { testClouds, testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const moment = (cells: string, drift = 0, start = -10): CloudMoment => ({cells, upperDrift: drift, lowerDrift: drift, startUpperDrift: start, startLowerDrift: start});
const rule = testShading().sunVisibility, UP: [number, number, number] = [0, 1, 0];
const clear = 1 - Math.sqrt(0.01 / 64);

describe('cloud field', () => {
  it('covers by the darkness of the shown clouds, weighting cells near the centre more, the larger layer counting', () => {
    const clouds = testClouds();
    expect(cloudCoverage(clouds, moment('fffff'))).toBe(0);
    expect(cloudCoverage(clouds, moment('00000'))).toBe(1);
    expect(cloudCoverage(clouds, moment('ffff8'))).toBeCloseTo(0.5, 12);
    // Lower cells at drift 0: p = 0.5 (cells 0, 1) and 1.5 (cells 2, 3). Cell 0 lies at (-0.5, -0.5), cell 2 at (0.5, 0.5): both 1 - 0.5·hypot(0.5, 0.5).
    const near = 1 - 0.5 * Math.hypot(0.5, 0.5), far1 = 1 - 0.5 * Math.min(1, Math.hypot(-1, 0)), far3 = 1 - 0.5 * Math.min(1, Math.hypot(1, 0));
    expect(cloudCoverage(clouds, moment('0ffff'))).toBeCloseTo(near / (2 * near + far1 + far3), 12);
    // A cell past the end of its run (n - p - endMargin <= 0) shows no cloud but keeps its weight.
    expect(cloudCoverage(clouds, moment('ff0ff', 0.45))).toBe(0);
  });

  it('places a sheet at its grid position and height, sunk while it is young and faded at the ends of its run', () => {
    const clouds = testClouds(), [sheet] = cloudSheets(clouds, moment('0ffff'), 0);
    // Cell 0: p = 0.5, grid (-0.5, -0.5), 1000 m per cell; old enough, so at the full 2000 m.
    expect(sheet.centre.map(v => +v.toFixed(6))).toEqual([-500, 2000, -500]);
    expect(sheet.fade).toBe(1); expect(sheet.radius).toBeCloseTo(Math.hypot(1000, 1000), 6);
    // Just switched on (age = the start age 0.1): fade 10·0.1 = 1, sunk by half the height times 0.9.
    const [young] = cloudSheets(clouds, moment('0ffff', 0, 0), 0);
    expect(young.centre[1]).toBeCloseTo(2000 - 0.5 * 2000 * 0.9, 6); expect(young.fade).toBe(1);
    // Near the end of its run (remaining 0.05): fading out and sinking.
    const [ending] = cloudSheets(clouds, moment('0ffff', 1.35), 0);
    expect(ending.fade).toBeCloseTo(0.5, 9); expect(ending.centre[1]).toBeCloseTo(2000 - 0.5 * 2000 * 0.95, 6);
    expect(cloudSheets(clouds, moment('fffff'), 0)).toEqual([]);
    // The eye's own height lifts the field by eye·k/(k + 1), k = eye / height; positions are relative to the eye.
    expect(cloudSheets(clouds, moment('0ffff'), 2000)[0].centre[1]).toBeCloseTo(2000 * 1 / 2 + 2000 - 2000, 6);
  });

  it('turns a side sheet to face the centre', () => {
    const clouds = testClouds(), [sheet] = cloudSheets(clouds, moment('f0fff'), 0);
    // Cell 1 at grid (0, -1): yaw = pi - atan2(0, 1) = pi, so the mesh's +x corner lands at -x.
    expect(sheet.vertices[3]).toBeCloseTo(-1000, 6); expect(sheet.vertices[5]).toBeCloseTo(0, 6);
    // The vertex frame turns with the sheet: tangent +x to -x, binormal +z to -z, the normal stays down.
    const frame = Array.from(sheet.frame.subarray(0, 9), v => +v.toFixed(6) || 0);
    expect(frame).toEqual([-1, 0, 0, 0, 0, -1, 0, -1, 0]);
    expect(sheet.frame).toHaveLength(4 * 9);
  });
});

describe('sun visibility', () => {
  it('is the rule\'s clear value with no cloud toward the sun and zero at or below the horizon limit', () => {
    const clouds = testClouds();
    expect(sunVisibility(rule, clouds, [], UP)).toBeCloseTo(clear, 12);
    expect(sunVisibility(rule, clouds, cloudSheets(clouds, moment('0ffff'), 0), [0, 0, 1])).toBe(0);
    expect(sunVisibility(rule, clouds, [], [1, 0.1, 0])).toBeCloseTo(clear * Math.min(1, 0.1 / Math.hypot(1, 0.1) * 5), 12);
    // A sheet away from the sun's view leaves the clear value.
    expect(sunVisibility(rule, clouds, cloudSheets(clouds, moment('0ffff'), 0), [1, 0.5, 1])).toBeCloseTo(clear, 12);
  });

  it('hides the sun behind an opaque sheet and partly behind a thinner one, less in the rain by the wet limit', () => {
    const clouds = testClouds(), overhead = (cells: string) => cloudSheets(clouds, moment(cells), 0);
    // Cells 0 and 2 (2 km sheets centred 707 m from the eye at 2000 m) cover the whole view straight up.
    expect(sunVisibility(rule, clouds, overhead('0f0ff'), UP)).toBe(0);
    expect(sunVisibility(rule, clouds, overhead('0f0ff'), UP, 1)).toBeCloseTo(0.5, 12);
    // The thin type: the mean of its materials' alphas (1 and 0.5) is 0.75, which each ray adds.
    const thin = sunVisibility(rule, clouds, overhead('8ffff'), [-0.25, 1, -0.25]);
    expect(thin).toBeCloseTo(1 - Math.sqrt((0.01 + 64 * 0.75) / 64), 9);
    // The replay names code 8's variant: only the material whose name ends with it counts (alpha 0.5); an unknown id keeps them all.
    const variants = [...new Array<string>(8).fill('x'), 'B'], named = cloudSheets(clouds, { ...moment('8ffff'), variants }, 0);
    expect(sunVisibility(rule, clouds, named, [-0.25, 1, -0.25])).toBeCloseTo(1 - Math.sqrt((0.01 + 64 * 0.5) / 64), 9);
    expect(sunVisibility(rule, clouds, cloudSheets(clouds, { ...moment('8ffff'), variants: new Array<string>(15).fill('x') }, 0), [-0.25, 1, -0.25])).toBeCloseTo(thin, 12);
  });
});
