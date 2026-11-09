import { describe, expect, it } from 'vitest';
import type { SceneryHosekSky } from '../../../../../shared/types/scenes/scenery.js';
import { hosekDistribution, hosekSkyState, hosekXyz } from '../../../../../src/components/replay/view3d/atmosphere/hosekSky.js';
import { testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

/**
 * Synthetic datasets whose every value encodes its place: 1000·albedo row + 10·turbidity index + control point + 0.01·coefficient
 * (radiances 100·albedo row + turbidity index + control point). A quintic Bezier through control points 0–5 is 5x, so the cook is
 * 1000·albedo + 10·(T − 1) + 5x + 0.01·i with x = (elevation / 90°)^(1/3), when it walks the layout and interpolates as the model does.
 */
const ramp = (count: number, albedoStep: number, turbidityStep: number, coefficientStep: number) => Array.from({length: count * 6 * 10 * 2}, (_, n) => {
  const i = n % count, point = Math.floor(n / count) % 6, turbidity = Math.floor(n / (count * 6)) % 10, albedo = Math.floor(n / (count * 60));
  return albedoStep * albedo + turbidityStep * turbidity + point + coefficientStep * i;
});
const DATASETS: Pick<SceneryHosekSky, 'coefficients' | 'radiances'> = {coefficients: [ramp(9, 1000, 10, 0.01), ramp(9, 1000, 10, 0.01), ramp(9, 1000, 10, 0.01)], radiances: [ramp(1, 100, 1, 0), ramp(1, 100, 1, 0), ramp(1, 100, 1, 0)]};

describe('hosekSky', () => {
  it.each([[2, 0.1, 0.3], [3.5, 0.15, 0.9], [9.7, 0.6, 1.4], [10, 1, Math.PI / 2]])('cooks the datasets at T %d, albedo %d, elevation %d', (turbidity, albedo, elevation) => {
    const state = hosekSkyState(DATASETS, turbidity, albedo, elevation), x = Math.cbrt(elevation / (Math.PI / 2));
    state.coefficients[1].forEach((value, i) => expect(value).toBeCloseTo(1000 * albedo + 10 * (turbidity - 1) + 5 * x + 0.01 * i, 9));
    state.radiances.forEach(value => expect(value).toBeCloseTo(100 * albedo + (turbidity - 1) + 5 * x, 9));
  });

  it('is brighter toward the sun than away from it', () => {
    const state = hosekSkyState(testSky().hosek, 3, 0.15, 0.6), cosTheta = Math.cos(Math.PI / 2 - 0.6);
    expect(hosekXyz(state, cosTheta, 0.99)[1]).toBeGreaterThan(3 * hosekXyz(state, cosTheta, -0.5)[1]);
  });

  it('evaluates the distribution term by term', () => {
    const k = [0.5, 0.2, 1, 2, -1, 0.3, 0.4, 0.6, 0.7], cosTheta = 0.5, cosGamma = 0.25, gamma = Math.acos(cosGamma);
    const mie = (1 + cosGamma ** 2) / (1 + 0.49 - 1.4 * cosGamma) ** 1.5;
    const expected = (1 + 0.5 * Math.exp(0.2 / 0.51)) * (1 + 2 * Math.exp(-gamma) + 0.3 * cosGamma ** 2 + 0.4 * mie + 0.6 * Math.sqrt(cosTheta));
    expect(hosekDistribution(k, cosTheta, gamma, cosGamma)).toBeCloseTo(expected, 10);
  });

  it('rejects a turbidity or albedo outside the model', () => {
    expect(() => hosekSkyState(DATASETS, 0.5, 0.15, 0.5)).toThrow(/turbidity/);
    expect(() => hosekSkyState(DATASETS, 3, 1.5, 0.5)).toThrow(/albedo/);
  });
});
