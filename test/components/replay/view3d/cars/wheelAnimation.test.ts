import { expect, it, vi } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/sceneObjects.js';
import { createWheelAnimation } from '../../../../../src/components/replay/view3d/cars/wheelAnimation.js';
import { sampleRenderPose } from '../../../../../src/components/replay/view3d/scene/replayPose.js';
import { attachWheelRigs } from '../../../../../src/components/replay/view3d/cars/wheelGeometry.js';
import { rigModel } from '../../../../helpers/scenes/rigModel.js';

const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 0, minZ: -5, maxZ: 0, spanX: 0, spanZ: 5}, points: [
  {x: 0, y: 0.33, z: 0, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0},
  {x: 0, y: 0.33, z: -5, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0.5},
]};
const rig = (name: string, car: ReturnType<typeof makeCar>) => ({pivot: car.getObjectByName(`wheel_${name}`)!, spin: car.getObjectByName(`spin_${name}`)!, steer: car.getObjectByName(`steer_${name}`)!});

it('fits the floating model to the road and spins every wheel about its axle', () => {
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, lap, () => 0);
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.33);
  const pose = sampleRenderPose(lap.points, 0, 0.5)!; animation.update(pose);
  for (const name of ['fl', 'fr', 'rl', 'rr']) expect(rig(name, car).spin.rotation.x).not.toBe(0);
  const angle = rig('fl', car).spin.rotation.x; animation.update(pose); expect(rig('fl', car).spin.rotation.x).toBe(angle);
  animation.update(sampleRenderPose(lap.points, 0, 0)!); expect(rig('fl', car).spin.rotation.x).toBeCloseTo(0);
  expect(animation.description).toContain('Estimated ground fit');
});

it('maps ride-height changes against each corner lap median', () => {
  const measured: ReplayTrajectoryData = {...lap, points: [
    {...lap.points[0], rideHeight: [40, 40, 60, 60]}, {...lap.points[1], rideHeight: [20, 30, 70, 65]},
  ]};
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, measured, () => 0);
  animation.update(sampleRenderPose(measured.points, 1, 0)!);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33 + 0.01);
  expect(rig('rl', car).pivot.position.y).toBeCloseTo(0.33 - 0.005);
  expect(animation.description).toContain('Ride-height-driven');
});

it('draws measured travel as recorded, without a bound', () => {
  const measured: ReplayTrajectoryData = {...lap, points: [
    {...lap.points[0], rideHeight: [40, 40, 60, 60]}, {...lap.points[1], rideHeight: [-460, 40, 60, 60]},
  ]};
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, measured, () => 0);
  animation.update(sampleRenderPose(measured.points, 1, 0)!);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33 + 0.25);
});

it('drives the wheels from the replay suspension travel without telemetry ride height, against its slowest tenth off the road', () => {
  // Compression raises the deflection: front-left 12 mm more compressed at 300 km/h than at 30 km/h.
  const points = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300].map((speedKmh, i) => ({...lap.points[i % 2], timeSec: i, speedKmh,
    suspensionDeflections: [-0.02 + (speedKmh - 30) / 270 * 0.012, -0.02, -0.03, -0.03] as [number, number, number, number]}));
  const measured: ReplayTrajectoryData = {...lap, pointsCount: points.length, points};
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, measured, () => null);
  animation.update(sampleRenderPose(measured.points, 9, 0)!);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33 + 0.012);
  expect(rig('rl', car).pivot.position.y).toBeCloseTo(0.33);
  expect(animation.description).toContain('Recorded suspension');
  // Telemetry ride height, where the lap has it, wins.
  const both = {...measured, points: points.map(point => ({...point, rideHeight: [40, 40, 60, 60] as [number, number, number, number]}))};
  expect(createWheelAnimation(makeCar('#38bdf8', false, rigModel()), both, () => 0).description).toContain('Ride-height-driven');
});

it('references the ride height of the slowest samples off the road, so the car sinking at speed lifts the wheels', () => {
  const points = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300].map((speedKmh, i) => ({...lap.points[i % 2], timeSec: i, speedKmh, rideHeight: [60 - speedKmh / 10, 60, 60, 60] as [number, number, number, number]}));
  const measured: ReplayTrajectoryData = {...lap, pointsCount: points.length, points};
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, measured, () => null);
  animation.update(sampleRenderPose(measured.points, 9, 0)!);
  // Static 57 mm (30 km/h), 30 mm at 300 km/h: 27 mm up. The lap median (45 mm) would give only 15 mm.
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33 + 0.027);
});

it('fits each corner rest to the road, so a steady car keeps all four tyres on it whatever the recorded travel', () => {
  // Rears 23 mm more deflected than the fronts throughout: not a lean, a rest the replay does not give.
  const deflections: [number, number, number, number] = [-0.013, -0.013, -0.036, -0.036];
  const measured: ReplayTrajectoryData = {...lap, points: lap.points.map(point => ({...point, suspensionDeflections: deflections}))};
  const car = makeCar('#38bdf8', false, rigModel());
  let road = false;
  const animation = createWheelAnimation(car, measured, () => road ? 0 : null);
  animation.update(sampleRenderPose(measured.points, 0, 0)!);
  expect(animation.description).not.toContain('fit');
  // The road streams in: the model and each corner are fitted then.
  road = true;
  animation.refreshHeights();
  animation.update(sampleRenderPose(measured.points, 0, 0)!);
  for (const name of ['fl', 'fr', 'rl', 'rr']) expect(rig(name, car).pivot.position.y).toBeCloseTo(0.33);
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.33);
  expect(animation.description).toContain('Estimated ground and corner fit');
});

it('steers only the fronts from recorded steering', () => {
  const steered: ReplayTrajectoryData = {...lap, handlingCalibration: {wheelbaseM: 2.8, steeringRatio: 12, steeringWheelRangeDeg: 540, wheelbaseSource: 'plugin', steeringSource: 'plugin-default'},
    points: lap.points.map(point => ({...point, steerYaw: 120}))};
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, steered, () => 0);
  animation.update(sampleRenderPose(steered.points, 0, 0.5)!);
  expect(rig('fl', car).steer.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(rig('fr', car).steer.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(rig('rl', car).steer.rotation.y).toBe(0);
  expect(animation.description).toContain('Recorded steering');
});

it('turns the steering wheel about the descriptor column axis by the recorded wheel angle', () => {
  const steered: ReplayTrajectoryData = {...lap, handlingCalibration: {wheelbaseM: 2.8, steeringRatio: 12, steeringWheelRangeDeg: 540, wheelbaseSource: 'plugin', steeringSource: 'plugin-default'},
    points: lap.points.map(point => ({...point, steerYaw: 90}))};
  const model = rigModel(), wheel = new Group(), axis = new Vector3(0, 0.2, 1).normalize();
  const pivot = new Vector3(0.3, 0.7, -0.3), hub = new Group(); hub.position.copy(pivot); wheel.add(hub);
  wheel.name = 'steering_wheel'; wheel.userData.steeringWheelAxis = axis.toArray(); wheel.userData.steeringWheelPivot = pivot.toArray(); model.add(wheel);
  const car = makeCar('#38bdf8', false, model), animation = createWheelAnimation(car, steered, () => 0);
  animation.update(sampleRenderPose(steered.points, 0, 0.5)!);
  // 90 on the ±270 scale of a 540° wheel: a quarter turn left, a negative rotation about the column in the native frame.
  expect(wheel.quaternion.angleTo(new Quaternion().setFromAxisAngle(axis, -Math.PI / 2))).toBeCloseTo(0, 6);
  // Turning about the pivot leaves the hub where it is.
  wheel.updateMatrixWorld(true);
  expect(hub.getWorldPosition(new Vector3()).distanceTo(car.getObjectByName('body-envelope')!.localToWorld(pivot.clone()))).toBeLessThan(1e-9);
  expect(animation.description).toContain('Recorded steering (wheel and tyres)');
});

it('keeps the model where it is without road coverage', () => {
  const car = makeCar('#38bdf8', false, rigModel()), animation = createWheelAnimation(car, lap, () => null);
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

it("measures a wheel in its car's frame: a car placed at an angle keeps its radius", () => {
  // As a race places a full model before its wheels are set up: turned on the circuit, in a mirrored parent.
  const world = new Group(), car = makeCar('#fff', false, rigModel());
  world.scale.z = -1; world.add(car);
  car.position.set(40, 2, -15); car.rotation.set(0.05, 1.1, -0.03);
  for (const each of attachWheelRigs(car.getObjectByName('body-envelope') as Group)) expect(each.radiusM).toBeCloseTo(0.33);
});

it('queries road contact once per sample and interpolates wheel travel without per-frame lookups', () => {
  const car = makeCar('#38bdf8', false, rigModel());
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
  // A refresh refits the lap and looks the contacts up afresh: 8 for the fit's two samples, 8 for the frame.
  animation.refreshHeights();
  animation.update(sampleRenderPose(lap.points, 0, 0.25)!);
  expect(surface).toHaveBeenCalledTimes(24);
});

it('retries missing contact only after a scenery refresh', () => {
  const car = makeCar('#38bdf8', false, rigModel());
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
  expect(surface).toHaveBeenCalledTimes(24);
  // The refresh also fits the model down onto the road, so the tyre needs no travel.
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.33);
  expect(rig('fl', car).pivot.position.y).toBeCloseTo(0.33);
});

it('does not use road fallback for measured suspension or interpolate contact through a teleport', () => {
  const measured = {...lap, points: lap.points.map(point => ({...point, rideHeight: [40, 40, 60, 60] as [number, number, number, number]}))};
  const surface = vi.fn(() => 0), car = makeCar('#38bdf8', false, rigModel());
  const animation = createWheelAnimation(car, measured, surface);
  surface.mockClear();
  animation.update(sampleRenderPose(measured.points, 0, 0.5)!);
  expect(surface).not.toHaveBeenCalled();
  const discontinuous = {...lap, points: [lap.points[0], {...lap.points[1], isTeleport: true}]};
  const other = createWheelAnimation(makeCar('#38bdf8', false, rigModel()), discontinuous, surface);
  surface.mockClear();
  other.update(sampleRenderPose(discontinuous.points, 0, 0.9)!);
  expect(surface).toHaveBeenCalledTimes(4);
});
