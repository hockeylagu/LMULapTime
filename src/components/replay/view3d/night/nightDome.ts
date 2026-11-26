/**
 * The game's night sky dome (docs/SCENE_PACKAGE.md "Night"; the pipeline's night research read it from seven captures' sky constants):
 * below the horizon the game's Hosek-Wilkie sky draws its Perez branch, xyY = zenith · Perez(θ, γ) / Perez(0, θsun), the zenith at the
 * twilight's chromaticity and the night model's zenith luminance (nightLight.ts), the coefficients Preetham's at the sky's turbidity with
 * the package's `perezScale` on luminance (its multipliers' first row). The dome's colour look and haze stay the day's rules at the
 * unclamped sun (skyDome.ts).
 */
import type { ScenerySky } from '../../../../../shared/types/scenes/scenery.js';

type Five = [number, number, number, number, number];

/** Preetham, Shirley and Smits (1999): the Perez coefficients A–E at turbidity T, slope and offset per channel x, y and Y. */
const PREETHAM: Record<'x' | 'y' | 'Y', readonly (readonly [number, number])[]> = {
  x: [[-0.0193, -0.2592], [-0.0665, 0.0008], [-0.0004, 0.2125], [-0.0641, -0.8989], [-0.0033, 0.0452]],
  y: [[-0.0167, -0.2608], [-0.0950, 0.0092], [-0.0079, 0.2102], [-0.0441, -1.6537], [-0.0109, 0.0529]],
  Y: [[0.1787, -1.4630], [-0.3554, 0.4275], [-0.0227, 5.3251], [0.1206, -2.5771], [-0.0670, 0.3703]],
};

const perez = ([A, B, C, D, E]: Five, cosTheta: number, gamma: number, cosGamma: number) =>
  (1 + A * Math.exp(B / cosTheta)) * (1 + C * Math.exp(D * gamma) + E * cosGamma * cosGamma);

/** The night dome for one sun: the Perez coefficients per channel and the zenith xyY over the Perez function toward the zenith. */
export interface NightDome {coefficients: {x: Five; y: Five; Y: Five}; zenithOverSun: [number, number, number]}

/**
 * The night dome at a sky turbidity (skyDome.ts `skyTurbidity`) for a refracted sun elevation, with the twilight's chromaticity and the
 * night model's zenith luminance (the package's `sky.night.twilight.chromaticity`, nightLight.ts `zenithLuminance`).
 */
export function nightDome(sky: Pick<ScenerySky, 'perezScale' | 'perezMultipliers'>, turbidity: number, sunElevationDeg: number,
  chromaticity: readonly [number, number], zenithLuminance: number): NightDome {
  const row = sky.perezMultipliers[0].abcd, luminanceScale = sky.perezScale.map((s, i) => s * (i < 4 ? row[i] : 1));
  const cook = (channel: 'x' | 'y' | 'Y', scale: readonly number[]) => PREETHAM[channel].map(([a, b], i) => (a * turbidity + b) * scale[i]) as Five;
  const coefficients = {x: cook('x', [1, 1, 1, 1, 1]), y: cook('y', [1, 1, 1, 1, 1]), Y: cook('Y', luminanceScale)};
  const thetaSun = Math.PI / 2 - sunElevationDeg * Math.PI / 180, zenith = [chromaticity[0], chromaticity[1], zenithLuminance];
  const zenithOverSun = (['x', 'y', 'Y'] as const).map((channel, i) => zenith[i] / perez(coefficients[channel], 1, thetaSun, Math.cos(thetaSun))) as [number, number, number];
  return {coefficients, zenithOverSun};
}

/** The night dome's xyY toward a view (cos θ from the zenith, γ from the sun), as `nightXyY` draws it. */
export function nightXyY(dome: NightDome, cosTheta: number, gamma: number, cosGamma: number): [number, number, number] {
  return (['x', 'y', 'Y'] as const).map((channel, i) => dome.zenithOverSun[i] * perez(dome.coefficients[channel], cosTheta, gamma, cosGamma)) as [number, number, number];
}

/** GLSL: the night dome's xyY toward a view, from its uniforms (`nightUniforms`). */
export const NIGHT_DOME_GLSL = `
      uniform float nightX[5], nightY[5], nightLum[5]; uniform vec3 nightZenith;
      float nightPerez(float k[5], float cosTheta, float gamma, float cosGamma) {
        return (1.0 + k[0] * exp(k[1] / cosTheta)) * (1.0 + k[2] * exp(k[3] * gamma) + k[4] * cosGamma * cosGamma);
      }
      vec3 nightXyY(float cosTheta, float gamma, float cosGamma) {
        return nightZenith * vec3(nightPerez(nightX, cosTheta, gamma, cosGamma), nightPerez(nightY, cosTheta, gamma, cosGamma), nightPerez(nightLum, cosTheta, gamma, cosGamma));
      }`;

/** The night dome's uniforms; a dome program without a night dome draws its day branch (`nightOn` 0). */
export function nightUniforms(dome: NightDome | null): Record<'nightOn' | 'nightX' | 'nightY' | 'nightLum' | 'nightZenith', {value: unknown}> {
  return {
    nightOn: {value: dome ? 1 : 0},
    nightX: {value: dome?.coefficients.x ?? [0, 0, 0, 0, 0]}, nightY: {value: dome?.coefficients.y ?? [0, 0, 0, 0, 0]}, nightLum: {value: dome?.coefficients.Y ?? [0, 0, 0, 0, 0]},
    nightZenith: {value: dome ? [...dome.zenithOverSun] : [0, 0, 0]},
  };
}
