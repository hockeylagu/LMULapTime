import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveShadowSplits } from '../../../../../shared/packageContract/index.js';
import { cascadeCentres, shadowCameraOf, shadowCascadeLayout, snapCascadeCentre, sunSquareAxes } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const {shadows} = testShading();
const chase = shadowCascadeLayout(shadows, shadows.cameras.chase);

describe('shadow cascades', () => {
  it('sizes each square from its split, the last from the span past the one before, each in its own tile', () => {
    // Splits 20, 80, 300 at 1.1 m of side per metre of split: the last spans 300 − 80.
    [22, 88, 1.1 * 220].forEach((side, i) => {
      expect(chase.cascades[i].sideM).toBeCloseTo(side, 9);
      expect(chase.cascades[i].texelM).toBeCloseTo(side / 32, 9);
    });
    expect(chase.cascades.map(cascade => cascade.tile)).toEqual([[0, 0, 0], [0, 32, 0], [1, 0, 0]]);
    expect(shadowCascadeLayout(shadows, shadows.cameras.cockpit).cascades.map(cascade => cascade.splitM)).toEqual([30, 200]);
  });

  it('puts a centre on the middle of a texel of its cascade', () => {
    const cascade = chase.cascades[0];
    expect(snapCascadeCentre(0.1, cascade)).toBeCloseTo(0.5 * cascade.texelM, 9);
    expect(snapCascadeCentre(-0.1, cascade)).toBeCloseTo(-0.5 * cascade.texelM, 9);
    expect(snapCascadeCentre(10 * cascade.texelM + 0.01, cascade)).toBeCloseTo(10.5 * cascade.texelM, 9);
  });

  it('fixes the square axes to the sun: u horizontal across it, v in its vertical plane', () => {
    // Light travelling down and toward +x: u = −normalize(L × up) is −z.
    const light = new Vector3(1, -1, 0).normalize(), {u, v} = sunSquareAxes(light);
    expect(u.distanceTo(new Vector3(0, 0, -1))).toBeCloseTo(0, 9);
    expect([v.dot(light), v.dot(u), v.z, v.length()]).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9), expect.closeTo(0, 9), expect.closeTo(1, 9)]);
    expect(() => sunSquareAxes(new Vector3(0, -1, 0))).toThrow(/overhead/);
  });

  it('centres each square on the view line at the middle of its slice, the first from near, snapped to a texel', () => {
    // Light toward +x: u is −z; looking along −z from the origin, slices 0.1–20, 20–80 and 80–300 lie along +u.
    const axes = sunSquareAxes(new Vector3(1, -1, 0).normalize());
    const centres = cascadeCentres(chase, new Vector3(0, 1, 0), new Vector3(0, 0, -1), axes);
    [(0.1 + 20) / 2, 50, 190].forEach((alongM, i) => {
      expect(centres[i][0]).toBeCloseTo(snapCascadeCentre(alongM, chase.cascades[i]), 9);
      expect(Math.abs(centres[i][0] - alongM)).toBeLessThanOrEqual(chase.cascades[i].texelM / 2 + 1e-9);
    });
    // Turning the view does not turn the squares: looking along x moves the centres along v only (u stays at the eye's).
    const across = cascadeCentres(chase, new Vector3(0, 1, 0), new Vector3(1, 0, 0), axes);
    chase.cascades.forEach((cascade, i) => expect(across[i][0]).toBeCloseTo(snapCascadeCentre(0, cascade), 9));
  });

  it('splits a set the package leaves to the viewer by the split scheme, out to its scaled far', () => {
    // TV: far 200 · farScale 3, ratio 0.68 over 2 cascades.
    const tv = shadowCascadeLayout(shadows, shadows.cameras.tv);
    expect(tv.farM).toBe(600);
    expect(tv.cascades.map(cascade => cascade.splitM)).toEqual(resolveShadowSplits(1, 600, 0.68, 2));
    expect(tv.fadeStartM).toBeLessThan(600);
  });

  it("draws each cascade with its depth bias in 24-bit depth units (bias · 2^23, rounded) and the set's slope bias", () => {
    // 5e-5 · 2^23 = 419.4 and 6e-5 · 2^23 = 503.3.
    expect(chase.cascades.map(cascade => cascade.depthBiasUnits)).toEqual([419, 419, 503]);
    expect(chase.slopeBias).toBe(1);
    expect(() => shadowCascadeLayout(shadows, {...shadows.cameras.chase, biasClamp: 0.01})).toThrow(/clamped/);
    expect(() => shadowCascadeLayout(shadows, {...shadows.cameras.chase, splitsM: [1, 2, 3, 4, 5]})).toThrow(/atlas tiles/);
  });

  it("takes a car camera's own shadow keys over the set's", () => {
    const set = shadows.cameras.chase;
    expect(shadowCameraOf(set, null)).toBe(set);
    // Bias alone keeps the published splits; a missing per-cascade value keeps the set's.
    const biased = shadowCameraOf(set, {nearM: null, farM: null, splitRatio: null, depthBias: [7e-5], slopeBias: 2});
    expect([biased.splitsM, biased.depthBias, biased.slopeBias]).toEqual([set.splitsM, [7e-5, 5e-5, 6e-5], 2]);
    // New planes drop the published splits, so the layout resolves them from the camera's planes.
    const near = shadowCameraOf(set, {nearM: 0.5, farM: 150, splitRatio: null, depthBias: null, slopeBias: null});
    expect([near.nearM, near.farM, near.splitRatio, near.splitsM, near.depthBias]).toEqual([0.5, 150, 0.9, null, set.depthBias]);
    expect(shadowCascadeLayout(shadows, near).cascades.map(cascade => cascade.splitM)).toEqual(resolveShadowSplits(0.5, 150, 0.9, 3));
  });
});
