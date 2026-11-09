import type { SceneryHosekSky } from '../../../../../shared/types/scenes/scenery.js';

/**
 * The Hosek-Wilkie (2012) clear sky in CIE XYZ: per channel nine distribution coefficients A–I and a radiance, cooked from the
 * package's datasets (the published model's data) for a turbidity (1–10), a ground albedo (0–1) and a solar elevation, as the
 * authors' reference implementation does: a quintic Bezier over (elevation / 90°)^(1/3) through six control points, linear between
 * the two whole turbidities around T and between albedo 0 and 1.
 *
 * Radiance toward a view of zenith angle θ, γ from the sun:
 *   F = (1 + A·exp(B / (cos θ + 0.01))) · (C + D·exp(E·γ) + F·cos²γ + G·χ(I, γ) + H·√cos θ),
 *   χ(g, γ) = (1 + cos²γ) / (1 + g² − 2g·cos γ)^1.5,
 * times the channel's radiance.
 */
export interface HosekSkyState {
  /** Per channel X, Y, Z: A–I. */
  coefficients: [number[], number[], number[]];
  /** Per channel X, Y, Z: the radiance scale. */
  radiances: [number, number, number];
}

const bezier = (data: readonly number[], offset: number, stride: number, x: number): number => {
  const y = 1 - x;
  return y ** 5 * data[offset] + 5 * y ** 4 * x * data[offset + stride] + 10 * y ** 3 * x ** 2 * data[offset + 2 * stride]
    + 10 * y ** 2 * x ** 3 * data[offset + 3 * stride] + 5 * y * x ** 4 * data[offset + 4 * stride] + x ** 5 * data[offset + 5 * stride];
};

/** One channel's `count` values (9 coefficients, or 1 radiance) for the turbidity, albedo and elevation. */
function cook(data: readonly number[], count: number, turbidity: number, albedo: number, elevationRad: number): number[] {
  const whole = Math.floor(turbidity), rest = turbidity - whole, x = Math.cbrt(Math.max(0, elevationRad) / (Math.PI / 2));
  const block = count * 6, albedoBlock = block * 10, out = new Array<number>(count).fill(0);
  const add = (offset: number, weight: number) => { for (let i = 0; i < count; i++) out[i] += weight * bezier(data, offset + i, count, x); };
  add(block * (whole - 1), (1 - albedo) * (1 - rest));
  add(albedoBlock + block * (whole - 1), albedo * (1 - rest));
  if (whole < 10) {
    add(block * whole, (1 - albedo) * rest);
    add(albedoBlock + block * whole, albedo * rest);
  }
  return out;
}

/** The sky state for a turbidity in [1, 10], a ground albedo in [0, 1] and the sun's elevation (radians, clamped at 0). */
export function hosekSkyState(datasets: Pick<SceneryHosekSky, 'coefficients' | 'radiances'>, turbidity: number, albedo: number, sunElevationRad: number): HosekSkyState {
  if (!(turbidity >= 1 && turbidity <= 10)) throw Error(`Sky turbidity ${turbidity} is outside the model's 1–10`);
  if (!(albedo >= 0 && albedo <= 1)) throw Error(`Sky ground albedo ${albedo} is outside 0–1`);
  const channel = (i: 0 | 1 | 2) => cook(datasets.coefficients[i], 9, turbidity, albedo, sunElevationRad);
  const radiance = (i: 0 | 1 | 2) => cook(datasets.radiances[i], 1, turbidity, albedo, sunElevationRad)[0];
  return {coefficients: [channel(0), channel(1), channel(2)], radiances: [radiance(0), radiance(1), radiance(2)]};
}

/** The distribution F for one channel's A–I. */
export function hosekDistribution(k: readonly number[], cosTheta: number, gamma: number, cosGamma: number): number {
  const mie = (1 + cosGamma * cosGamma) / (1 + k[8] * k[8] - 2 * k[8] * cosGamma) ** 1.5;
  return (1 + k[0] * Math.exp(k[1] / (cosTheta + 0.01))) * (k[2] + k[3] * Math.exp(k[4] * gamma) + k[5] * cosGamma * cosGamma + k[6] * mie + k[7] * Math.sqrt(cosTheta));
}

/** The same distribution in GLSL: `hosek(k, cosTheta, gamma, cosGamma)` with `k` a float[9]. */
export const HOSEK_GLSL = `
      float hosek(float k[9], float cosTheta, float gamma, float cosGamma) {
        float mie = (1.0 + cosGamma * cosGamma) / pow(1.0 + k[8] * k[8] - 2.0 * k[8] * cosGamma, 1.5);
        return (1.0 + k[0] * exp(k[1] / (cosTheta + 0.01))) * (k[2] + k[3] * exp(k[4] * gamma) + k[5] * cosGamma * cosGamma + k[6] * mie + k[7] * sqrt(cosTheta));
      }`;

/** CIE XYZ radiance toward a view of height cosTheta (≥ 0) at cosGamma from the sun. */
export function hosekXyz(state: HosekSkyState, cosTheta: number, cosGamma: number): [number, number, number] {
  const gamma = Math.acos(Math.min(1, Math.max(-1, cosGamma)));
  const value = (i: 0 | 1 | 2) => hosekDistribution(state.coefficients[i], cosTheta, gamma, cosGamma) * state.radiances[i];
  return [value(0), value(1), value(2)];
}
