import { expect, it } from 'vitest';
import { domeWeight, nightMoment, nightPlace, UNTRACED_NIGHT_LIGHT_THRESHOLD } from '../../../../../src/components/replay/view3d/night/nightMoment.js';
import { sceneSun } from '../../../../../src/components/replay/view3d/sceneEnvironment.js';
import { TEST_HAZE_WEIGHTS, testLayoutNight, testNight, testShading, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const model = testNight();
const daylight = {date: '2023-09-10', sessions: [{id: 'race' as const, localTime: '12:00', sunElevationDeg: 50, sunBearingDeg: 180}], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 1, longitudeDeg: 2, utcOffsetHours: 3};
/** Two scenes: the WEC one at Algarve's place on its own date with no threshold, an ELMS one with Qatar's. */
const night = {...testLayoutNight(), scenes: [
  {sceneDesc: 'algarvewec', date: '2023-04-04', latitudeDeg: 37.23, longitudeDeg: -8.63, timezoneHours: 0, dstRange: null, utcOffsetHours: 1, nightLightThreshold: null, nightLightPollution: 0.001},
  {sceneDesc: 'elms', date: '2023-07-01', latitudeDeg: 37.23, longitudeDeg: -8.63, timezoneHours: 0, dstRange: null, utcOffsetHours: 1, nightLightThreshold: 0.6, nightLightPollution: 0.001},
]};

it('weights the night dome linearly between the package endpoints', () => {
  expect([domeWeight(model, 10), domeWeight(model, 2.9), domeWeight(model, (2.9 - 0.83) / 2), domeWeight(model, -0.83), domeWeight(model, -20)]).toEqual([0, 0, 0.5, 1, 1]);
});

it("takes the replay's own night scene for the place, the date and the threshold, else the daylight's place", () => {
  expect(nightPlace(night, daylight, 'algarvewec')).toEqual({latitudeDeg: 37.23, longitudeDeg: -8.63, utcOffsetHours: 1, date: '2023-04-04', threshold: UNTRACED_NIGHT_LIGHT_THRESHOLD});
  expect(nightPlace(night, daylight, 'elms').threshold).toBe(0.6);
  expect(nightPlace(night, daylight, 'other')).toEqual({latitudeDeg: 1, longitudeDeg: 2, utcOffsetHours: 3, date: '2023-09-10', threshold: UNTRACED_NIGHT_LIGHT_THRESHOLD});
  // One scene is the layout's scene, named or not.
  expect(nightPlace({...night, scenes: [night.scenes[1]]}, daylight, undefined).date).toBe('2023-07-01');
});

it('switches to night, the moon and the track lights on the Algarve night, and stays day at noon', () => {
  const place = nightPlace(night, daylight, 'algarvewec'), nightLevel = 2.35;
  const dark = nightMoment(model, testSky().hosek.xyzToRgb, place, 21.5 * 3600, nightLevel);
  expect([dark.sunShare, dark.night, dark.lightsOn, dark.domeWeight]).toEqual([0, true, true, 1]);
  expect(dark.dayShare).toBeLessThan(0.01);
  const noon = nightMoment(model, testSky().hosek.xyzToRgb, place, 13.5 * 3600, nightLevel);
  expect([noon.sunShare, noon.lightsOn, noon.domeWeight]).toEqual([1, false, 0]);
});

it('lights a night scene by the moon: its direction, its light and the night facts', () => {
  const venue = {daylight, sky: testSky(), shading: testShading(), night};
  const sun = sceneSun(venue, 0, {session: 'race', startMinute: 21 * 60 + 30, sessionTimeSec: 0, scene: 'algarvewec'});
  const {lighting} = sun;
  expect(lighting.night?.sunShare).toBe(0);
  expect(sun.sunElevationDeg).toBeLessThan(-15);
  // The moon is up, east of south: the light comes from above, not from the sun below the horizon.
  expect(lighting.lightDirection.y).toBeGreaterThan(0.5);
  expect(sun.radiance.toArray()).toEqual(lighting.night!.light.moonLight);
  // Without a clock the published sun is a day sun.
  expect(sceneSun(venue, 0).lighting.night).toBeNull();
});
