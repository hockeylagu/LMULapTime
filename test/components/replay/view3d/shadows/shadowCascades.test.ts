import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cascadeCentres, selectCascade, shadowCascadeLayout, shadowFadeOut, snapCascadeCentre, sunSquareAxes } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
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

  it('fades out over its share of the last span, gone at far', () => {
    expect(chase.fadeStartM).toBeCloseTo(300 - 0.75 * 220, 9);
    expect([0, chase.fadeStartM, 300, 900].map(depth => shadowFadeOut(chase, depth))).toEqual([0, 0, 1, 1]);
    expect(shadowFadeOut(chase, (chase.fadeStartM + 300) / 2)).toBeCloseTo(0.5, 9);
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

  it('shades a point from the first cascade whose tile holds it', () => {
    expect(selectCascade([[0.5, 0.5], [0.5, 0.5]], 0.49)).toBe(0);
    expect(selectCascade([[0.995, 0.5], [0.6, 0.4]], 0.49)).toBe(1);
    expect(selectCascade([[0.5, 0.005], [0.5, 0.995], [0.5, 0.5]], 0.49)).toBe(2);
    expect(selectCascade([[2, 0.5], [1.5, 0.5]], 0.49)).toBe(-1);
  });

  it('has no cascades for a camera type the package publishes no set for', () => {
    expect(() => shadowCascadeLayout(shadows, shadows.cameras.tv)).toThrow(/no shadow cascades/);
  });
});
