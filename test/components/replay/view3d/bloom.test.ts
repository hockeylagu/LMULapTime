import { describe, expect, it } from 'vitest';
import { bloomParameters, blurWeights } from '../../../../src/components/replay/view3d/bloom.js';
import { testCamera } from '../../../helpers/scenes/sceneryProfiles.js';

describe('bloom', () => {
  const camera = testCamera(), type = camera.types.tv.bloom;

  it('derives the knee and gain the night capture used from the look and the low tier', () => {
    // The night TV capture's bright-pass constant is [14, 1, 4, 0.125] at remap 0.5 and its merge gain 2.52.
    const p = bloomParameters({threshold: 1.5, remapFactor: 0.5, luminance: 1.5}, type, camera.bloom);
    expect(p.knee).toBeCloseTo(14, 10);
    expect(p.weight).toBeCloseTo(0.125 / 64, 12);
    expect(p.gain).toBeCloseTo(2.52, 10);
  });

  it('takes the day luminance into the gain', () => {
    const day = {threshold: 1.5, remapFactor: 0.2, luminance: 1};
    expect(bloomParameters(day, type, camera.bloom).gain).toBeCloseTo(1.68, 10);
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
});
