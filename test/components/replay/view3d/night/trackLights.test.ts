import { expect, it } from 'vitest';
import { lightsInReach, sceneryNodeLights, trackLightAt, type TrackLight } from '../../../../../src/components/replay/view3d/night/trackLights.js';

const light = (x: number, rangeM = 10, y = 5): TrackLight => ({position: [x, y, 0], rangeM, colour: [2, 1, 0.5]});
const lights = [light(30), light(0), light(12), light(-15, 5)];

it('lists the lights whose range reaches a bounding sphere, nearest its centre first', () => {
  // The sphere at the origin, 3 m wide: the light 12 m away reaches it (10 + 3), the one 30 m away and the short one 15 m away do not.
  expect(lightsInReach(lights, [0, 5, 0], 3)).toEqual([1, 2]);
  expect(lightsInReach(lights, [0, 5, 0], 30)).toEqual([1, 2, 3, 0]);
});

it("lights a capped node by its layout's list, any other node by every light in reach", () => {
  const lists = new Map([[7, [3]]]);
  expect(sceneryNodeLights(lights, lists, 7, [0, 5, 0], 3)).toEqual([3]);
  // A list id this layout has no entry for (capped only in another layout of the venue), or none at all.
  expect(sceneryNodeLights(lights, lists, 8, [0, 5, 0], 3)).toEqual([1, 2]);
  expect(sceneryNodeLights(lights, lists, undefined, [0, 5, 0], 3)).toEqual([1, 2]);
});

it('adds N·L · colour · (1 − d / range), diffuse only, nothing beyond its range or behind the face', () => {
  // Straight above a face looking up, 5 m away: full facing, half the range.
  expect(trackLightAt(light(0), [0, 0, 0], [0, 1, 0])).toEqual([1, 0.5, 0.25]);
  expect(trackLightAt(light(0), [0, 0, 0], [0, -1, 0])).toEqual([0, 0, 0]);
  expect(trackLightAt(light(0, 4), [0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0]);
});

it('stretches the vertical distance to a light below the vertex twenty times, so the lamps shine down', () => {
  // A light 0.1 m below and 1 m beside a face turned toward it: 2 m away once stretched, the facing from the stretched vector.
  const below = trackLightAt({position: [1, -0.1, 0], rangeM: 10, colour: [1, 1, 1]}, [0, 0, 0], [1, 0, 0]);
  const d = Math.hypot(1, 2);
  expect(below[0]).toBeCloseTo(1 / d * (1 - d / 10), 9);
});
