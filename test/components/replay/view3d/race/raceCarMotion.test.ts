import { describe, expect, it, vi } from 'vitest';
import { RACE_LAMP, RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import { createRaceCarMotion, windowPoints } from '../../../../../src/components/replay/view3d/race/raceCarMotion.js';
import { makeCar } from '../../../../../src/components/replay/view3d/sceneObjects.js';
import { rigModel } from '../../../../helpers/scenes/rigModel.js';

const channel = (name: typeof RACE_POSE_CHANNELS[number]) => RACE_POSE_CHANNELS.indexOf(name);

/** Two cars, two samples each: car 1's first sample carries every channel, its second has no pose. */
function window(): RacePoseWindow {
  const data = new Float32Array(2 * 2 * RACE_POSE_CHANNEL_COUNT).fill(Number.NaN);
  const base = 2 * RACE_POSE_CHANNEL_COUNT;
  data.set([10, 1, 20, 0, 0.5, 0, 180], base);
  data[base + channel('inPit')] = 0;
  data[base + channel('steerYaw')] = -0.25;
  data[base + channel('brake')] = 0.8;
  data[base + channel('lamps')] = RACE_LAMP.headlights | RACE_LAMP.rainLight;
  data.set([0.01, 0.02, 0.03, 0.04], base + channel('deflFL'));
  return {fromSec: 100, hz: 10, count: 2, slots: [3, 7], data};
}

describe('windowPoints', () => {
  it('reads a car\'s samples as lap samples with steering, brake, lamps and suspension', () => {
    const [first, second] = windowPoints(window(), 1);
    expect(first).toMatchObject({x: 10, y: 1, z: 20, rotY: 0.5, speedKmh: 180, timeSec: 100, steerYaw: -67.5, headlights: true, pitLimiter: false, rainLight: true});
    expect(first.brake).toBeCloseTo(0.8);
    expect(first.suspensionDeflections?.map(value => Number(value.toFixed(2)))).toEqual([0.01, 0.02, 0.03, 0.04]);
    expect(second.timeSec).toBeCloseTo(100.1);
    expect(second.x).toBeNaN();
    expect(second).toMatchObject({steerYaw: undefined, suspensionDeflections: undefined, headlights: false});
  });
});

describe('createRaceCarMotion', () => {
  it('builds the wheels and fits them to the road only once the car is drawn (read), not for every window or road change', () => {
    const ground = vi.fn(() => 0), motion = createRaceCarMotion(makeCar('#38bdf8', false, rigModel()), undefined, ground);
    const first = window(), second = window();
    motion.update(first, 1); motion.update(second, 1); motion.refreshHeights();
    expect(ground).not.toHaveBeenCalled();
    expect(motion.wheels).not.toBeNull();
    const built = ground.mock.calls.length;
    expect(built).toBeGreaterThan(0);
    void motion.lights; // Reading again builds nothing more.
    expect(ground).toHaveBeenCalledTimes(built);
    motion.refreshHeights(); motion.refreshHeights();
    expect(ground).toHaveBeenCalledTimes(built);
    void motion.wheels;
    expect(ground.mock.calls.length).toBeGreaterThan(built);
  });
});
