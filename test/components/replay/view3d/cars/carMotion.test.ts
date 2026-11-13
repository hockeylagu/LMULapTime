import { describe, expect, it, vi } from 'vitest';
import { Quaternion } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { createCarMotion } from '../../../../../src/components/replay/view3d/cars/carMotion.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/sceneObjects.js';
import { rigModel } from '../../../../helpers/scenes/rigModel.js';

/** A short straight: two samples 1 m apart. */
const lap = (): {points: ReplayTrajectoryPoint[]} => ({points: [
  {x: 0, y: 0, z: 0, rotY: 0, speedKmh: 100, timeSec: 0},
  {x: 0, y: 0, z: -1, rotY: 0, speedKmh: 100, timeSec: 0.036},
]});

describe('createCarMotion', () => {
  it('builds the wheels and fits them to the road only once the car is drawn, not for every track or road change', () => {
    const ground = vi.fn(() => 0), motion = createCarMotion(makeCar('#38bdf8', false, rigModel()), ground);
    const first = lap(), second = lap(), source = vi.fn(() => second);
    motion.setTrack(first, () => first); motion.setTrack(second, source); motion.setTrack(second, () => first); motion.refreshHeights();
    expect(ground).not.toHaveBeenCalled();
    expect(motion.wheels).not.toBeNull();
    // Only the last new track is read; the same track again is a no-op.
    expect(source).toHaveBeenCalledOnce();
    const built = ground.mock.calls.length;
    expect(built).toBeGreaterThan(0);
    void motion.lights; // Reading again builds nothing more.
    expect(ground).toHaveBeenCalledTimes(built);
    motion.refreshHeights(); motion.refreshHeights();
    expect(ground).toHaveBeenCalledTimes(built);
    void motion.wheels;
    expect(ground.mock.calls.length).toBeGreaterThan(built);
  });

  it('fits each new track from the model as built', () => {
    const car = makeCar('#38bdf8', false, rigModel()), envelope = car.getObjectByName('body-envelope')!, restY = envelope.position.y;
    const motion = createCarMotion(car, () => 0.4);
    motion.setTrack(lap(), lap);
    void motion.wheels;
    const fitted = envelope.position.y;
    expect(fitted).not.toBeCloseTo(restY);
    motion.update({x: 0, y: 0, z: 0, yaw: 0, orientation: new Quaternion(), index: 0, fraction: 0.5});
    motion.setTrack(lap(), lap);
    void motion.wheels;
    // Fitted again from the rest height, not on top of the first fit.
    expect(envelope.position.y).toBeCloseTo(fitted);
  });

  it('keeps still wheels for a model without wheel rigs', () => {
    const motion = createCarMotion(makeCar('#38bdf8', false, new (rigModel().constructor as new () => ReturnType<typeof rigModel>)()), () => 0);
    motion.setTrack(lap(), lap);
    expect(motion.wheels).toBeNull();
    expect(() => motion.update({x: 0, y: 0, z: 0, index: 0, fraction: 0})).not.toThrow();
  });

  it('throws for a wheel rig the package gets wrong', () => {
    const model = rigModel();
    model.getObjectByName('spin_fl')!.removeFromParent();
    const motion = createCarMotion(makeCar('#38bdf8', false, model), () => 0);
    motion.setTrack(lap(), lap);
    expect(() => motion.wheels).toThrow(/wheel rig fl/);
  });
});
