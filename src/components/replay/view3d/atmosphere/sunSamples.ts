import { Color, MathUtils } from 'three';
import type { ScenerySun } from '../../../../../shared/types/scenes/scenery.js';

/**
 * The direct sun from the layout's sampled radiance (`sky.sun`): a grid by base cloud coverage and sun elevation. Between elevations
 * the log of each channel is linear in the relative air mass, which is how the atmosphere's attenuation behaves, so the sparse
 * samples hold across gaps where linear interpolation in elevation does not; between coverages the result is linear. Outside the
 * grid the nearest sample holds. The loader has checked the grid's shape.
 */

/**
 * Scene radiance per unit of the package's light (the sun grid here, the sky model in skyDome.ts): the grid's midday sun is near
 * 100 and the scene was calibrated at 4.0, the one conversion between the two.
 */
export const SUN_UNIT = 0.04;

/** Kasten and Young's relative air mass: how many atmospheres the sun's ray crosses at an elevation, 1 at the zenith. */
export const relativeAirMass = (elevationDeg: number) => 1 / (Math.sin(MathUtils.degToRad(elevationDeg)) + 0.50572 * (elevationDeg + 6.07995) ** -1.6364);

function rowRadiance(elevations: readonly number[], row: readonly (readonly [number, number, number])[], elevationDeg: number, target: Color): Color {
  const upper = elevations.findIndex(elevation => elevation >= elevationDeg);
  if (upper === 0 || row.length === 1) return target.setRGB(...row[0]);
  if (upper < 0) return target.setRGB(...row[row.length - 1]);
  const low = row[upper - 1], high = row[upper];
  const m = relativeAirMass(elevationDeg), mLow = relativeAirMass(elevations[upper - 1]), mHigh = relativeAirMass(elevations[upper]);
  const t = mHigh === mLow ? 0 : (m - mLow) / (mHigh - mLow);
  const channel = (i: number) => Math.exp(MathUtils.lerp(Math.log(low[i]), Math.log(high[i]), t));
  return target.setRGB(channel(0), channel(1), channel(2));
}

/** The sun's radiance at an elevation and base cloud coverage, in the grid's unit. */
export function sunRadiance(sun: ScenerySun, elevationDeg: number, cloudCover: number, target = new Color()): Color {
  const { sunElevationDeg: elevations, cloudCoverage: covers, grid } = sun;
  const upper = covers.findIndex(cover => cover >= cloudCover);
  if (upper === 0 || covers.length === 1) return rowRadiance(elevations, grid[0], elevationDeg, target);
  if (upper < 0) return rowRadiance(elevations, grid[grid.length - 1], elevationDeg, target);
  const below = rowRadiance(elevations, grid[upper - 1], elevationDeg, target), above = rowRadiance(elevations, grid[upper], elevationDeg, new Color());
  return below.lerp(above, (cloudCover - covers[upper - 1]) / (covers[upper] - covers[upper - 1]));
}
