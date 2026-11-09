import { expect, it } from 'vitest';
import { Color } from 'three';
import { profilesAt, timeOfDayPosition, weatherWeight } from '../../../../../src/components/replay/view3d/atmosphere/timeOfDay.js';

const KNOTS = [-4, 0, 10, 50, 80], sun = (strength: number) => new Color(strength / 2, strength, strength / 4);

it("places the profiles by the direct sun's strongest channel, scaled down below 1° of elevation", () => {
  // 20 between knots 10 and 50: a quarter of the way from profile 2.
  expect(timeOfDayPosition(KNOTS, sun(20), 30)).toBeCloseTo(2.25, 12);
  // At 0.25° the strength counts a quarter: 5, half way from profile 1.
  expect(timeOfDayPosition(KNOTS, sun(20), 0.25)).toBeCloseTo(1.5, 12);
  // At or past the last knot, the last profile.
  expect(timeOfDayPosition(KNOTS, sun(90), 30)).toBe(4);
  // On a knot, or below the horizon, no pair holds it strictly: profile 0.
  expect(timeOfDayPosition(KNOTS, sun(20), 0.5)).toBe(0);
  expect(timeOfDayPosition(KNOTS, sun(20), -2)).toBe(0);
  // At or below the first knot (the strength counts at least 1), profile 0.
  expect(timeOfDayPosition([5, 10, 50], sun(2), 30)).toBe(0);
});

it('takes the two profiles around a position and holds the last', () => {
  expect(profilesAt(['a', 'b', 'c'], 1.5)).toEqual(['b', 'c', 0.5]);
  expect(profilesAt(['a', 'b', 'c'], 2)).toEqual(['c', 'c', 0]);
  expect(profilesAt(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 0]);
});

it('weighs the overcast look by the cover squared, raised to the profile power', () => {
  expect(weatherWeight(0.5, 2)).toBeCloseTo(0.0625, 12);
  expect(weatherWeight(1, 3)).toBe(1);
  expect(weatherWeight(0, 1)).toBe(0);
});
