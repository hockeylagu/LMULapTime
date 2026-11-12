import { describe, expect, it, vi } from 'vitest';
import { Color, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';
import { adaptLogLuminance, createAutoExposure, inverseToneCurve, lawExposure, meterUnit, profileAt, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';
import { testCamera } from '../../../helpers/scenes/sceneryProfiles.js';

/** A synthetic camera type (profiles at sun strengths 0 and 60). */
const TYPE = testCamera().types.external;

/** A direct sun whose strongest channel is `strength`, at an elevation. */
const sun = (strength: number, elevationDeg: number) => ({rgb: new Color(strength, strength / 2, strength / 4), elevationDeg});

describe('autoExposure', () => {
  it("tone-maps with the profile's curve: dark toe, compressed shoulder, invertible", () => {
    const curve = {a: 2.5, b: 0.6}, z = Math.exp(-2.5 * 0.5);
    expect(toneCurve(curve, 0)).toBe(0);
    expect(toneCurve(curve, 0.5)).toBeCloseTo((1 - z) * (1 - 0.6 * z) ** 2, 9);
    expect(toneCurve(curve, 0.18)).toBeLessThan(0.18);
    expect(toneCurve(curve, 10)).toBeLessThanOrEqual(1);
    for (const y of [0, 0.05, 0.3, 0.7, 0.95]) expect(toneCurve(curve, inverseToneCurve(curve, y))).toBeCloseTo(y, 6);
  });

  it("takes each profile value at its knot of direct-sun strength, interpolates between and holds past the ends", () => {
    // Knots 0 and 60: a sun whose strongest channel is 30, above 1°, sits half way; at or below the horizon it is profile 0.
    expect(profileAt(TYPE, sun(30, 0))).toEqual({targetExposure: 0.4, lightDarkBorder: 1.5, minExposure: 0, maxExposure: 4, whiteBalanceK: 7000, toneCurve: {a: 2.5, b: 0.6}});
    const mid = profileAt(TYPE, sun(30, 30));
    expect(mid.targetExposure).toBeCloseTo(0.3); expect(mid.whiteBalanceK).toBeCloseTo(6750);
    expect(mid.lightDarkBorder).toBeCloseTo(1.375); expect(mid.maxExposure).toBeCloseTo(2.5);
    expect(mid.toneCurve.a).toBeCloseTo(2.75); expect(mid.toneCurve.b).toBeCloseTo(0.65);
    expect(profileAt(TYPE, sun(30, -20)).targetExposure).toBe(0.4);
    expect(profileAt(TYPE, sun(70, 30)).targetExposure).toBe(0.2);
  });

  it('blends each profile toward its overcast look by the cloud cover squared, raised to the profile power', () => {
    // Full cover: the overcast look (target 1.5x, 7500 K, curve 2 / 0.5).
    const covered = profileAt(TYPE, sun(30, 0), 1);
    expect(covered.targetExposure).toBeCloseTo(0.6, 12); expect(covered.whiteBalanceK).toBe(7500); expect(covered.toneCurve).toEqual({a: 2, b: 0.5});
    expect([covered.lightDarkBorder, covered.minExposure, covered.maxExposure]).toEqual([2, 0.1, 5]);
    // Half cover with power 1: a quarter of the way (the sun is taken as half hidden by half the sky covered).
    const half = profileAt(TYPE, sun(30, 0), 0.5);
    expect(half.targetExposure).toBeCloseTo(0.4 + 0.2 * 0.25, 12); expect(half.whiteBalanceK).toBeCloseTo(7125, 9);
    // Between profiles, each end blends first, then the position interpolates.
    expect(profileAt(TYPE, sun(30, 30), 1).targetExposure).toBeCloseTo(0.45, 12);
  });

  it('exposes by the law U · T · B^(1 - s) / (U · L)^s inside the look limits: brighter scenes get less exposure, by the adaptation scale', () => {
    const unit = meterUnit(2.2), look = {...profileAt(TYPE, sun(30, 0)), targetExposure: 0.3, lightDarkBorder: 1.5, minExposure: 0.05, maxExposure: 2};
    expect(lawExposure(look, 0.4, Math.log(1 / unit), unit)).toBeCloseTo(unit * 0.3 * 1.5 ** 0.6, 9);
    expect(lawExposure(look, 0.4, Math.log(4 / unit), unit)).toBeCloseTo(unit * 0.3 * 1.5 ** 0.6 / 4 ** 0.4, 9);
    expect(lawExposure(look, 0.6, Math.log(4), unit)).toBeLessThan(lawExposure(look, 0.4, Math.log(4), unit));
    // A very dark scene stops at the maximum, a very bright one at the minimum (both on the camera's scale, so times U).
    expect(lawExposure(look, 0.4, Math.log(1e-9 / unit), unit)).toBeCloseTo(unit * 2, 12);
    expect(lawExposure(look, 0.4, Math.log(1e9 / unit), unit)).toBeCloseTo(unit * 0.05, 12);
    expect(meterUnit(4.4)).toBeCloseTo(unit / 2, 12); // The package's scale, not a constant of the app.
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

  it('links the canvas pass for the canvas and the metering pass for its own target, and leaves the renderer as it was', async () => {
    const before = new WebGLRenderTarget(4, 4), compiled: {pass: Object3D; target: WebGLRenderTarget | null}[] = [];
    let current: WebGLRenderTarget | null = before;
    const renderer = {
      getRenderTarget: () => current, setRenderTarget: (target: WebGLRenderTarget | null) => { current = target; },
      compileAsync: vi.fn(async (pass: Object3D) => { compiled.push({pass, target: current}); }),
    } as unknown as WebGLRenderer;
    const exposure = createAutoExposure(renderer, testCamera(), sun(30, 40), () => {});
    expect(exposure.target).toMatchObject({samples: 4, depthBuffer: true, resolveDepthBuffer: false});
    await exposure.link();
    expect(current).toBe(before);
    // The canvas pass draws to the canvas; the metering pass to its small target, neither the HDR target nor the one set before.
    expect(compiled[0].target).toBeNull();
    expect(compiled[1].target).toBeInstanceOf(WebGLRenderTarget);
    expect([exposure.target, before]).not.toContain(compiled[1].target);
    exposure.dispose();
  });
});
