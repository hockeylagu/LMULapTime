import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { adaptLogLuminance, EXPOSURE_CALIBRATION, inverseToneCurve, lawExposure, profileAt, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';
import { testCamera } from '../../../helpers/scenes/sceneryProfiles.js';

/** A synthetic camera type (profiles at 0° and 60°). */
const TYPE = testCamera().types.external;

describe('autoExposure', () => {
  it("tone-maps with the profile's curve: dark toe, compressed shoulder, invertible", () => {
    const curve = {a: 2.5, b: 0.6}, z = Math.exp(-2.5 * 0.5);
    expect(toneCurve(curve, 0)).toBe(0);
    expect(toneCurve(curve, 0.5)).toBeCloseTo((1 - z) * (1 - 0.6 * z) ** 2, 9);
    expect(toneCurve(curve, 0.18)).toBeLessThan(0.18);
    expect(toneCurve(curve, 10)).toBeLessThanOrEqual(1);
    for (const y of [0, 0.05, 0.3, 0.7, 0.95]) expect(toneCurve(curve, inverseToneCurve(curve, y))).toBeCloseTo(y, 6);
  });

  it('takes each profile value at a profile elevation, interpolates between and holds past the ends', () => {
    expect(profileAt(TYPE, 0)).toEqual({targetExposure: 0.4, whiteBalanceK: 7000, toneCurve: {a: 2.5, b: 0.6}});
    const mid = profileAt(TYPE, 30);
    expect(mid.targetExposure).toBeCloseTo(0.3); expect(mid.whiteBalanceK).toBeCloseTo(6750);
    expect(mid.toneCurve.a).toBeCloseTo(2.75); expect(mid.toneCurve.b).toBeCloseTo(0.65);
    expect(profileAt(TYPE, -20).targetExposure).toBe(0.4);
    expect(profileAt(TYPE, 120).targetExposure).toBe(0.2);
  });

  it('exposes by the law C · T / L^s: brighter scenes get less exposure, by the adaptation scale', () => {
    expect(lawExposure(0.3, 0.4, 0)).toBeCloseTo(EXPOSURE_CALIBRATION * 0.3, 9);
    expect(lawExposure(0.3, 0.4, Math.log(4))).toBeCloseTo(EXPOSURE_CALIBRATION * 0.3 / 4 ** 0.4, 9);
    expect(lawExposure(0.3, 0.6, Math.log(4))).toBeLessThan(lawExposure(0.3, 0.4, Math.log(4)));
  });

  it('leaves colours alone at 6500 K and warms them under a bluer profile white', () => {
    const grey = (kelvin: number) => new Vector3(0.5, 0.5, 0.5).applyMatrix3(whiteBalance(kelvin));
    expect(grey(6500).toArray().map(c => Number(c.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
    const low = grey(7000); // The bluer light is corrected toward warm.
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
