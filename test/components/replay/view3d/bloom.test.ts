import { describe, expect, it } from 'vitest';
import { bloomParameters, blurWeights, brightPass, HALF_MAX, spotReduction } from '../../../../src/components/replay/view3d/bloom.js';
import { testCamera } from '../../../helpers/scenes/sceneryProfiles.js';

describe('bloom', () => {
  const camera = testCamera(), type = camera.types.tv.bloom;

  it('derives the knee and gain the night capture used from the look and the low tier', () => {
    // The night TV capture's bright-pass constant is [14, 1, 4, 0.125] at remap 0.5 and its merge gain 2.52.
    const p = bloomParameters({threshold: 1.5, remapFactor: 0.5, luminance: 1.5}, type, camera.bloom, 'low');
    expect(p.knee).toBeCloseTo(14, 10);
    expect(p.weight).toBeCloseTo(0.125 / 64, 12);
    expect(p.gain).toBeCloseTo(2.52, 10);
  });

  it('takes the day luminance and the chosen quality tier into the gain', () => {
    const day = {threshold: 1.5, remapFactor: 0.2, luminance: 1};
    expect(bloomParameters(day, type, camera.bloom, 'low').gain).toBeCloseTo(1.68, 10);
    expect(bloomParameters(day, type, camera.bloom, 'high').gain).toBeCloseTo(2.24, 10);
    expect(bloomParameters(day, type, camera.bloom).knee).toBeCloseTo(98, 10);
  });

  it('keeps a remap factor of zero finite', () => {
    const p = bloomParameters({threshold: 1.5, remapFactor: 0, luminance: 1}, type, camera.bloom);
    expect(Number.isFinite(p.knee)).toBe(true);
  });

  it('normalises the blur over its taps, centre heaviest', () => {
    const w = blurWeights(2.2, 7);
    expect(w).toHaveLength(8);
    expect(w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[7]).toBeGreaterThan(0);
  });

  it('passes nothing at or under the threshold and keeps the hue above it', () => {
    const p = bloomParameters({threshold: 1.5, remapFactor: 0.5, luminance: 1.5}, type, camera.bloom);
    expect(brightPass([1.5, 1.5, 1.5], p)).toEqual([0, 0, 0]);
    const [r, g, b] = brightPass([6, 3, 0], p);
    expect(r).toBeGreaterThan(0);
    expect(r / g).toBeCloseTo(2, 10);
    expect(b).toBe(0);
    // t = 1.5 above the mean 3: (t + sqrt(t (t + k) + 1) − 1) · weight / L per unit of colour.
    const t = 1.5, f = (t + Math.sqrt(t * (t + 14) + 1) - 1) * (0.125 / 64) / 3;
    expect(r).toBeCloseTo(6 * f, 12);
  });

  it('keeps a lone bright texel from outweighing its block in the first reduction, and a block bright all over whole', () => {
    const dark: [number, number, number] = [0, 0, 0], bulb: [number, number, number] = [400, 400, 400];
    // A distant bulb caught on one texel: the plain mean (100) would bloom; weighed, it stays near 1 at exposure 1.
    expect(spotReduction([bulb, dark, dark, dark], 1)[0]).toBeCloseTo(400 / 401 / (1 / 401 + 3), 10);
    expect(spotReduction([bulb, dark, dark, dark], 1)[0]).toBeLessThan(1.4);
    expect(spotReduction([bulb, bulb, bulb, bulb], 1)).toEqual(bulb);
    expect(spotReduction([[2, 1, 0], [2, 1, 0], [2, 1, 0], [2, 1, 0]], 3)).toEqual([2, 1, 0]);
    // A texel that overflowed the half float (infinity) counts at its largest value: finite, never NaN.
    expect(spotReduction([[Infinity, 0, 0], dark, dark, dark], 1).every(Number.isFinite)).toBe(true);
    expect(spotReduction([[Infinity, Infinity, Infinity], bulb, bulb, bulb], 1)[0]).toBeLessThanOrEqual(HALF_MAX);
  });
});
