import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { SceneryCamera } from '../../../../shared/types/scenes/scenery.js';
import { adaptLogLuminance, darkestMeteredLog, inverseToneCurve, targetExposure, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';

/** A synthetic package camera profile. */
const CAMERA: SceneryCamera = {
  meteringWindow: {x: 0.1, y: 0.1, width: 0.8, height: 0.8},
  profiles: [{sunElevationDeg: 0, targetExposure: 0.4, whiteBalanceK: 7000}, {sunElevationDeg: 30, targetExposure: 0.3, whiteBalanceK: 6600}, {sunElevationDeg: 60, targetExposure: 0.2, whiteBalanceK: 6500}],
  toneCurve: {a: 2.5, b: 0.6}, glareThreshold: 1.2, ambientOcclusion: {radiusM: 0.4, samples: 8, scale: 2, colour: 0.4},
};

describe('autoExposure', () => {
  it('meters no darker than a sunlit grey ground, so a dark cockpit cannot burn out the track outside', () => {
    expect(Math.exp(darkestMeteredLog(90))).toBeCloseTo(0.18 * 4 / Math.PI, 6);
    expect(darkestMeteredLog(30)).toBeCloseTo(darkestMeteredLog(90) + Math.log(0.5), 6);
    expect(darkestMeteredLog(30, 0.25)).toBeCloseTo(darkestMeteredLog(30) + Math.log(0.25), 6);
  });
  it("tone-maps with the camera's curve: dark toe, compressed shoulder, invertible", () => {
    const curve = CAMERA.toneCurve, z = Math.exp(-2.5 * 0.5);
    expect(toneCurve(curve, 0)).toBe(0);
    expect(toneCurve(curve, 0.5)).toBeCloseTo((1 - z) * (1 - 0.6 * z) ** 2, 9);
    expect(toneCurve(curve, 0.18)).toBeLessThan(0.18);
    expect(toneCurve(curve, 10)).toBeLessThanOrEqual(1);
    for (const y of [0, 0.05, 0.3, 0.7, 0.95]) expect(toneCurve(curve, inverseToneCurve(curve, y))).toBeCloseTo(y, 6);
  });
  it('takes the target at a profile elevation, interpolates between and holds past the ends', () => {
    expect(targetExposure(CAMERA, 30)).toBeCloseTo(0.3);
    expect(targetExposure(CAMERA, 45)).toBeCloseTo(0.25);
    expect(targetExposure(CAMERA, -20)).toBe(0.4);
    expect(targetExposure(CAMERA, 120)).toBe(0.2);
  });

  it('leaves colours alone at 6500 K and warms them under a bluer profile white, keeping white white at the neutral point', () => {
    const grey = (elevation: number) => new Vector3(0.5, 0.5, 0.5).applyMatrix3(whiteBalance(CAMERA, elevation));
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
