import { expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { makeCar } from '../../../../src/components/replay/view3d/sceneObjects.js';
import { createWheelAnimation } from '../../../../src/components/replay/view3d/wheelAnimation.js';
import { sampleRenderPose } from '../../../../src/components/replay/view3d/replayPose.js';

function model(): Group {
  const source = new Group();
  for (const name of ['tyres', 'rims']) {
    const positions: number[] = [];
    for (const x of [0.8, -0.8]) for (const z of [-1.4, 1.4]) {
      const box = new BoxGeometry(0.2, name === 'tyres' ? 0.66 : 0.4, name === 'tyres' ? 0.66 : 0.4).toNonIndexed();
      box.translate(x, 0.3, z); positions.push(...box.getAttribute('position').array); box.dispose();
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const mesh = new Mesh(geometry, new MeshStandardMaterial()); mesh.name = name; source.add(mesh);
  }
  return source;
}
const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 0, minZ: -5, maxZ: 0, spanX: 0, spanZ: 5}, points: [
  {x: 0, y: 0.33, z: 0, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0},
  {x: 0, y: 0.33, z: -5, rotX: 0, rotY: 0, rotZ: 0, timeSec: 0.5},
]};

it('fits the floating model to the road and spins tyre/rim geometry around each hub without moving its center', () => {
  const source = model(), car = makeCar(lap, '#38bdf8', false, source), animation = createWheelAnimation(car, lap, () => 0);
  const pose = sampleRenderPose(lap.points, 0, 0.5)!; car.position.set(pose.x, pose.y, pose.z); car.quaternion.copy(pose.orientation!); animation.update(pose);
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.3);
  for (const name of ['FL', 'FR', 'RL', 'RR']) {
    const wheel = car.getObjectByName(`wheel-${name}`)!;
    expect(wheel.children.map(part => part.name)).toEqual([`tyres-${name}`, `rims-${name}`]);
    expect(wheel.getWorldPosition(new Vector3()).y).toBeCloseTo(0.33);
    expect(wheel.rotation.x).not.toBe(0);
  }
  const wheel = car.getObjectByName('wheel-FL')!, angle = wheel.rotation.x;
  animation.update(pose); expect(wheel.rotation.x).toBe(angle);
  animation.update(sampleRenderPose(lap.points, 0, 0)!); expect(wheel.rotation.x).toBeCloseTo(0);
  expect(source.children.map(part => part.name)).toEqual(['tyres', 'rims']);
  expect(lap.points[0].y).toBe(0.33); expect(animation.description).toContain('Estimated ground fit');
});

it('maps ride-height changes against each corner lap median ahead of road estimates and preserves recorded body height', () => {
  const measured: ReplayTrajectoryData = {...lap, points: [
    {...lap.points[0], rideHeight: [40, 40, 60, 60]},
    {...lap.points[1], rideHeight: [20, 30, 70, 65]},
  ]};
  const car = makeCar(measured, '#38bdf8', false, model()), animation = createWheelAnimation(car, measured, () => 0);
  const pose = sampleRenderPose(measured.points, 1, 0)!; animation.update(pose);
  expect(car.getObjectByName('wheel-FL')!.position.y).toBeCloseTo(0.31);
  expect(car.getObjectByName('wheel-FR')!.position.y).toBeCloseTo(0.305);
  expect(car.getObjectByName('wheel-RL')!.position.y).toBeCloseTo(0.295);
  expect(car.getObjectByName('wheel-RR')!.position.y).toBeCloseTo(0.2975);
  expect(pose.y).toBe(0.33); expect(animation.description).toContain('Ride-height-driven');
});

it('estimates corner movement from replay heave and road, bounds visual travel, and keeps independent ghost wheel phases', () => {
  const car = makeCar(lap, '#38bdf8', false, model()), ghost = makeCar(lap, '#ffb703', true, model());
  const animation = createWheelAnimation(car, lap, () => 0), other = createWheelAnimation(ghost, lap, () => 0);
  const pose = sampleRenderPose(lap.points, 0, 0.5)!;
  animation.update({...pose, y: pose.y - 0.02}); other.update({...pose, fraction: 0.25});
  expect(car.getObjectByName('wheel-FL')!.position.y).toBeCloseTo(0.32);
  expect(car.getObjectByName('wheel-FL')!.rotation.x).not.toBe(ghost.getObjectByName('wheel-FL')!.rotation.x);
  animation.update({...pose, y: pose.y + 1}); expect(car.getObjectByName('wheel-FL')!.position.y).toBeCloseTo(0.15);
});

it('leaves unsupported wheel geometry static and never invents a ground fit without road coverage', () => {
  const unsupported = new Group(); unsupported.add(new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial()));
  expect(createWheelAnimation(makeCar(lap, '#38bdf8', false, unsupported), lap, () => 0).description).toBe('Wheel animation unavailable');
  const car = makeCar(lap, '#38bdf8', false, model()), animation = createWheelAnimation(car, lap, () => null);
  animation.update(sampleRenderPose(lap.points, 0, 0)!);
  expect(car.getObjectByName('body-envelope')!.position.y).toBe(0);
  expect(animation.description).not.toContain('Estimated ground fit');
});

it('fits the model origin to the lap median, so one kerb or crest sample cannot float the car', () => {
  const lifted: ReplayTrajectoryData = {...lap, points: [
    {...lap.points[0], y: 0.6}, {...lap.points[1], timeSec: 0.2}, {...lap.points[1], z: -10, timeSec: 0.4},
  ]};
  const car = makeCar(lifted, '#38bdf8', false, model());
  createWheelAnimation(car, lifted, () => 0);
  expect(car.getObjectByName('body-envelope')!.position.y).toBeCloseTo(-0.3);
});

it('gives the estimated body four grounded wheels and steers only the fronts from recorded steering', () => {
  const steered: ReplayTrajectoryData = {...lap, handlingCalibration: {wheelbaseM: 2.8, steeringRatio: 12, steeringWheelRangeDeg: 540, wheelbaseSource: 'plugin', steeringSource: 'plugin-default'},
    points: lap.points.map(point => ({...point, steerYaw: 120}))};
  const car = makeCar(steered, '#38bdf8', false), animation = createWheelAnimation(car, steered, () => 0);
  animation.update(sampleRenderPose(steered.points, 0, 0.5)!);
  // 120° at the wheel over a 12:1 ratio is 10° of left (ISO +) road-wheel angle: -Y in vehicle-local axes.
  expect(car.getObjectByName('wheel-FL')!.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(car.getObjectByName('wheel-FR')!.rotation.y).toBeCloseTo(-10 * Math.PI / 180);
  expect(car.getObjectByName('wheel-RL')!.rotation.y).toBe(0);
  expect(car.getObjectByName('wheel-FL')!.rotation.order).toBe('YXZ');
  expect(car.getObjectByName('wheel-FL')!.getWorldPosition(new Vector3()).z).toBeCloseTo(-1.4);
  expect(animation.description).toContain('Recorded steering');
});
