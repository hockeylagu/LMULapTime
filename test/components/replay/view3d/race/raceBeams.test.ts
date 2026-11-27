import { expect, it, vi } from 'vitest';
import { Box3, Group, Quaternion, Vector3 } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { RACE_LAMP, RACE_POSE_CHANNEL_COUNT, RACE_POSE_CHANNELS, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { SpotCar } from '../../../../../src/components/replay/view3d/night/carSpots.js';
import { createRaceBeams } from '../../../../../src/components/replay/view3d/race/raceBeams.js';

const LAMPS = RACE_POSE_CHANNELS.indexOf('lamps'), BRAKE = RACE_POSE_CHANNELS.indexOf('brake');
const lights = {spots: [], cockpit: null} as CarLights;
const body = {descriptor: {lights}} as unknown as LoadedBody;
/**
 * One car, four samples (brake in percent): headlights off and a brush of the pedal under the game's threshold, then on, on while
 * braking, and braking with them off.
 */
const window = (() => {
  const data = new Float32Array(4 * RACE_POSE_CHANNEL_COUNT);
  data[BRAKE] = 2;
  data[RACE_POSE_CHANNEL_COUNT + LAMPS] = RACE_LAMP.headlights;
  data[2 * RACE_POSE_CHANNEL_COUNT + LAMPS] = RACE_LAMP.headlights;
  data[2 * RACE_POSE_CHANNEL_COUNT + BRAKE] = 30;
  data[3 * RACE_POSE_CHANNEL_COUNT + BRAKE] = 30;
  return {data, count: 4, slots: [7]} as unknown as RacePoseWindow;
})();

it("hands over the placed cars whose headlights are on or that brake, once their body's lights are read, at their pose", async () => {
  const bounds = new Box3(new Vector3(-1, 0, -2), new Vector3(1, 1, 2));
  // The model drawn sits 0.2 m up on its envelope (a road fit): the beams and the own-car box sit with it.
  const envelope = new Group(); envelope.position.y = 0.2;
  const lit = vi.fn(), origin = new Vector3(100, 0, 50), root = new Group();
  const beams = createRaceBeams(origin, async () => body, slot => slot === 7 ? bounds : null, slot => slot === 7 ? envelope : null, lit);
  root.scale.z = -1;
  const pose = (index: number) => ({x: 110, y: 1, z: 60, yaw: 0, orientation: new Quaternion(), index, fraction: 0});
  const drawn = (index: number) => {
    const out: SpotCar[] = [];
    beams.begin(); beams.place(7, pose(index), window, 0); beams.headlights(root, out);
    return out;
  };
  expect(drawn(0)).toEqual([]); // Off, under the brake threshold.
  expect(drawn(1)).toEqual([]); // On, its body still loading.
  expect(lit).not.toHaveBeenCalled();
  await Promise.resolve();
  // Its lights read: the scene draws again, so a paused view shows the beams without waiting for the replay to move.
  expect(lit).toHaveBeenCalledOnce();
  const [car] = drawn(1);
  expect(lit).toHaveBeenCalledOnce();
  expect(car.lights).toBe(lights);
  expect(car.box).toBe(bounds); // The body its own spots leave dark.
  expect([car.headlights, car.braking]).toEqual([true, false]);
  const at = new Vector3().setFromMatrixPosition(car.frame);
  expect([at.x, at.y, at.z].map(v => Math.round(v * 1e6) / 1e6)).toEqual([10, 1.2, -10]);
  // Its tail spot lights the road behind it while it brakes, its headlights on or off.
  expect([drawn(2)[0].headlights, drawn(2)[0].braking]).toEqual([true, true]);
  expect([drawn(3)[0].headlights, drawn(3)[0].braking]).toEqual([false, true]);
});
