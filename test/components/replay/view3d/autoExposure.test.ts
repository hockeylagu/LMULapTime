import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { adaptLogLuminance, darkestMeteredLog, inverseToneCurve, targetExposure, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';

describe('autoExposure', () => {
  it('meters no darker than a sunlit grey ground, so a dark cockpit cannot burn out the track outside', () => {
    expect(Math.exp(darkestMeteredLog(90))).toBeCloseTo(0.18 * 4 / Math.PI, 6);
    expect(darkestMeteredLog(30)).toBeCloseTo(darkestMeteredLog(90) + Math.log(0.5), 6);
  });
  it('tone-maps with the game sensitometric curve: dark toe, unchanged around 0.5, compressed shoulder', () => {
    expect(toneCurve(0)).toBe(0);
    expect(toneCurve(0.18)).toBeCloseTo(0.131, 3);
    expect(toneCurve(0.5)).toBeCloseTo(0.499, 3);
    expect(toneCurve(1)).toBeCloseTo(0.845, 3);
    expect(toneCurve(10)).toBeLessThanOrEqual(1);
    for (const y of [0, 0.05, 0.3, 0.7, 0.95]) expect(toneCurve(inverseToneCurve(y))).toBeCloseTo(y, 6);
  });
  it('takes the game target at a profile elevation, interpolates between and holds past the ends', () => {
    expect(targetExposure(60)).toBeCloseTo(0.24);
    expect(targetExposure(45)).toBeCloseTo((0.325 + 0.24) / 2);
    expect(targetExposure(-20)).toBe(0.5);
    expect(targetExposure(120)).toBe(0.15);
  });

  it('leaves colours alone at midday and warms them for a low sun, keeping white white at the neutral point', () => {
    const grey = (elevation: number) => new Vector3(0.5, 0.5, 0.5).applyMatrix3(whiteBalance(elevation));
    expect(grey(60).toArray().map(c => Number(c.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
    const low = grey(0); // 7000 K assumed: the bluer light is corrected toward warm.
    expect(low.x).toBeGreaterThan(low.y); expect(low.y).toBeGreaterThan(low.z);
    expect(low.z / low.x).toBeCloseTo(0.89, 2); // 500 K warmer: blue about 11 % under red.
  });

  it('takes the first reading as is, then moves part of the way toward each new one', () => {
    expect(adaptLogLuminance(null, -1, 0)).toBe(-1);
    const next = adaptLogLuminance(0, 1, 0.5);
    expect(next).toBeGreaterThan(0); expect(next).toBeLessThan(1);
    expect(adaptLogLuminance(0, 1, 0)).toBe(0);
  });
});
