import type { Color } from 'three';

/**
 * Where the time-of-day profiles stand for a sun (the camera's exposure looks and the sky's colour looks alike): a position along
 * the profiles' knots of direct-sun strength (`sunTarget`), not along the sun's elevation. With M the strongest channel of the
 * direct sun in the package's light unit (at least 1) and X = M·min(elevation°, 1): M at or past the last knot is the last
 * profile, M at or below the first is profile 0; otherwise the first pair of knots with knot[i] < X < knot[i + 1] gives
 * i + (X − knot[i]) / (knot[i + 1] − knot[i]), and no such pair is profile 0 (the pipeline's docs/SCENE_PACKAGE.md "Sky dome").
 */
export function timeOfDayPosition(knots: readonly number[], sun: Color, sunElevationDeg: number): number {
  const M = Math.max(1, sun.r, sun.g, sun.b), X = M * Math.min(sunElevationDeg, 1), last = knots.length - 1;
  if (M >= knots[last]) return last;
  if (M <= knots[0]) return 0;
  for (let i = 0; i < last; i++) if (knots[i] < X && X < knots[i + 1]) return i + (X - knots[i]) / (knots[i + 1] - knots[i]);
  return 0;
}

/** The two profiles around a position and how far it is from the first toward the second. */
export function profilesAt<T>(profiles: readonly T[], position: number): [T, T, number] {
  const i = Math.min(Math.floor(position), profiles.length - 1);
  return [profiles[i], profiles[Math.min(i + 1, profiles.length - 1)], position - i];
}

/**
 * The clear-to-overcast weight of a profile under the replay's cloud cover: pow((1 − sun visibility)·C, weatherLerpPower), with a
 * cover C hiding the sun by C (the replay has no sun occlusion of its own), so pow(C², weatherLerpPower).
 */
export const weatherWeight = (cloudCover: number, weatherLerpPower: number): number => (cloudCover * cloudCover) ** weatherLerpPower;
