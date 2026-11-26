import { expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { RACE_LAMP, RACE_POSE_CHANNEL_COUNT, RACE_POSE_CHANNELS, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { SpotCar } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { createRaceBeams } from '../../../../../src/components/replay/view3d/race/raceBeams.js';

const LAMPS = RACE_POSE_CHANNELS.indexOf('lamps');
const lights = {spots: [], cockpit: null} as CarLights;
const body = {descriptor: {lights}} as unknown as LoadedBody;
/** One car, two samples: headlights off, then on. */
const window = (() => {
  const data = new Float32Array(2 * RACE_POSE_CHANNEL_COUNT);
  data[RACE_POSE_CHANNEL_COUNT + LAMPS] = RACE_LAMP.headlights;
  return {data, count: 2, slots: [7]} as unknown as RacePoseWindow;
})();

it("hands over the placed cars whose headlights are on, once their body's lights are read, at their pose", async () => {
  const origin = new Vector3(100, 0, 50), beams = createRaceBeams(origin, async () => body), root = new Group();
  root.scale.z = -1;
  const pose = (index: number) => ({x: 110, y: 1, z: 60, yaw: 0, orientation: new Quaternion(), index, fraction: 0});
  const drawn = (index: number) => {
    const out: SpotCar[] = [];
    beams.begin(); beams.place(7, pose(index), window, 0); beams.headlights(root, out);
    return out;
  };
  expect(drawn(0)).toEqual([]); // Off.
  expect(drawn(1)).toEqual([]); // On, its body still loading.
  await Promise.resolve();
  const [car] = drawn(1);
  expect(car.lights).toBe(lights);
  expect(new Vector3().setFromMatrixPosition(car.frame).toArray()).toEqual([10, 1, -10]);
});
