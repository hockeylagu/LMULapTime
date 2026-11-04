import { expect, it, vi } from 'vitest';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { makeCar } from '../../../../src/components/replay/view3d/sceneObjects.js';
import { createWheelAnimation } from '../../../../src/components/replay/view3d/wheelAnimation.js';
import { sampleRenderPose } from '../../../../src/components/replay/view3d/replayPose.js';
import { attachWheelRigs } from '../../../../src/components/replay/view3d/wheelGeometry.js';
import { rigModel } from '../../../helpers/scenes/rigModel.js';

const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 0, minZ: -5, maxZ: 0, spanX: 0, spanZ: 5}, points: [
  {x: 0, y: 0.33, z: 0, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0},
  {x: 0, y: 0.33, z: -5, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0.5},
]};
const rig = (name: string, car: ReturnType<typeof makeCar>) => ({pivot: car.getObjectByName(`wheel_${name}`)!, spin: car.getObjectByName(`spin_${name}`)!, steer: car.getObjectByName(`steer_${name}`)!});

it('fits the floating model to the road and spins every wheel about its axle', () => {
  const car = makeCar(lap, '#38bdf8', false, rigModel()), animation = createWheelAnimation(car, lap, () => 0);
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.33);
  const pose = sampleRenderPose(lap.points, 0, 0.5)!; animation.update(pose);
  for (const name of ['fl', 'fr', 'rl', 'rr']) expect(rig(name, car).spin.rotation.x).not.toBe(0);
  const angle = rig('fl', car).spin.rotation.x; animation.update(pose); expect(rig('fl', car).spin.rotation.x).toBe(angle);
  animation.update(sampleRenderPose(lap.points, 0, 0)!); expect(rig('fl', car).spin.rotation.x).toBeCloseTo(0);
  expect(animation.description).toContain('Estimated ground fit');
});

it('maps ride-height changes against each corner lap median and bounds the travel', () => {
  const measured: ReplayTrajectoryData = {...lap, points: [
    {...lap.points[0], rideHeight: [40, 40, 60, 60]}, {...lap.points[1], rideHeight: [20, 30, 70, 65]},
  ]};
  const car = makeCar(measured, '#38bdf8', false, rigModel()), animation = createWheelAnimation(car, measured, () => 0);
  animation.update(sampleRenderPose(measured.points, 1, 0)!);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33 + 0.01);
  expect(rig('rl', car).pivot.position.y).toBeCloseTo(0.33 - 0.005);
  expect(animation.description).toContain('Ride-height-driven');
});

it('steers only the fronts from recorded steering', () => {
  const steered: ReplayTrajectoryData = {...lap, handlingCalibration: {wheelbaseM: 2.8, steeringRatio: 12, steeringWheelRangeDeg: 540, wheelbaseSource: 'plugin', steeringSource: 'plugin-default'},
    points: lap.points.map(point => ({...point, steerYaw: 120}))};
  const car = makeCar(steered, '#38bdf8', false, rigModel()), animation = createWheelAnimation(car, steered, () => 0);
  animation.update(sampleRenderPose(steered.points, 0, 0.5)!);
  expect(rig('fl', car).steer.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(rig('fr', car).steer.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(rig('rl', car).steer.rotation.y).toBe(0);
  expect(animation.description).toContain('Recorded steering');
});

it('keeps the model where it is without road coverage', () => {
  const car = makeCar(lap, '#38bdf8', false, rigModel()), animation = createWheelAnimation(car, lap, () => null);
  animation.update(sampleRenderPose(lap.points, 0, 0)!);
  expect(car.getObjectByName('body-envelope')!.position.y).toBe(0);
  expect(animation.description).not.toContain('Estimated ground fit');
});

it('reads the rolling hub and radius of each rig and throws on a car without a complete rig', () => {
  const model = rigModel(), rigs = attachWheelRigs(model);
  expect(rigs.map(r => r.corner)).toEqual([0, 1, 2, 3]);
  expect(rigs[0].hub.toArray()).toEqual([0.8, 0.33, -1.4]); expect(rigs[0].radiusM).toBeCloseTo(0.33);
  model.getObjectByName('wheel_rr')!.userData.wheelPivot = [0, 0, 0];
  expect(() => attachWheelRigs(model)).toThrow('not at its pivot');
  const missing = rigModel(); missing.remove(missing.getObjectByName('wheel_fr')!);
  expect(() => attachWheelRigs(missing)).toThrow('no wheel rig fr');
});

it('queries road contact once per sample and interpolates wheel travel without per-frame lookups', () => {
  const car = makeCar(lap, '#38bdf8', false, rigModel());
  let height: (point: {z: number}) => number | null = () => 0;
  const surface = vi.fn((point: {z: number}) => height(point));
  const animation = createWheelAnimation(car, lap, surface);
  height = point => -0.02 * point.z;
  surface.mockClear();
  animation.update(sampleRenderPose(lap.points, 0, 0.25)!);
  const first = rig('fl', car).pivot.position.y;
  expect(surface).toHaveBeenCalledTimes(8);
  for (let frame = 0; frame < 60; frame++) animation.update(sampleRenderPose(lap.points, 0, 0.75)!);
  expect(surface).toHaveBeenCalledTimes(8);
  expect(rig('fl', car).pivot.position.y - first).toBeCloseTo(0.05);
  animation.update(sampleRenderPose(lap.points, 0, 0.25)!);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(first);
  animation.refreshHeights();
  animation.update(sampleRenderPose(lap.points, 0, 0.25)!);
  expect(surface).toHaveBeenCalledTimes(8);
});

it('retries missing contact only after a scenery refresh', () => {
  const car = makeCar(lap, '#38bdf8', false, rigModel());
  let available = false;
  const surface = vi.fn(() => available ? 0 : null);
  const animation = createWheelAnimation(car, lap, surface);
  surface.mockClear();
  const pose = sampleRenderPose(lap.points, 0, 0.5)!;
  animation.update(pose); animation.update(pose);
  expect(surface).toHaveBeenCalledTimes(8);
  available = true;
  animation.update(pose);
  expect(surface).toHaveBeenCalledTimes(8);
  animation.refreshHeights();
  animation.update(pose);
  expect(surface).toHaveBeenCalledTimes(16);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.18);
});

it('does not use road fallback for measured suspension or interpolate contact through a teleport', () => {
  const measured = {...lap, points: lap.points.map(point => ({...point, rideHeight: [40, 40, 60, 60] as [number, number, number, number]}))};
  const surface = vi.fn(() => 0), car = makeCar(measured, '#38bdf8', false, rigModel());
  const animation = createWheelAnimation(car, measured, surface);
  surface.mockClear();
  animation.update(sampleRenderPose(measured.points, 0, 0.5)!);
  expect(surface).not.toHaveBeenCalled();
  const discontinuous = {...lap, points: [lap.points[0], {...lap.points[1], isTeleport: true}]};
  const other = createWheelAnimation(makeCar(discontinuous, '#38bdf8', false, rigModel()), discontinuous, surface);
  surface.mockClear();
  other.update(sampleRenderPose(discontinuous.points, 0, 0.9)!);
  expect(surface).toHaveBeenCalledTimes(4);
});
