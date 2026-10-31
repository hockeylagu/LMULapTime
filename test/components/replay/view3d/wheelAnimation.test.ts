import { expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { makeCar } from '../../../../src/components/replay/view3d/sceneObjects.js';
import { createWheelAnimation } from '../../../../src/components/replay/view3d/wheelAnimation.js';
import { sampleRenderPose } from '../../../../src/components/replay/view3d/replayPose.js';
import { attachWheelRigs } from '../../../../src/components/replay/view3d/wheelGeometry.js';

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

it('preserves ghost depth handling and stable tyre/rim ordering when splitting animated wheels', () => {
  const ghost = makeCar(lap, '#ffb703', true, model());
  const tyre = ghost.getObjectByName('tyres') as Mesh<BufferGeometry, MeshStandardMaterial>;
  const rim = ghost.getObjectByName('rims') as Mesh<BufferGeometry, MeshStandardMaterial>;
  const tyreOrder = tyre.renderOrder, rimOrder = rim.renderOrder;
  expect(tyreOrder).not.toBe(rimOrder);
  const animation = createWheelAnimation(ghost, lap, () => 0);
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    animation.update(sampleRenderPose(lap.points, 0, fraction)!);
    for (const corner of ['FL', 'FR', 'RL', 'RR']) {
      const wheelTyre = ghost.getObjectByName(`tyres-${corner}`) as Mesh<BufferGeometry, MeshStandardMaterial>;
      const wheelRim = ghost.getObjectByName(`rims-${corner}`) as Mesh<BufferGeometry, MeshStandardMaterial>;
      expect(wheelTyre.renderOrder).toBe(tyreOrder);
      expect(wheelRim.renderOrder).toBe(rimOrder);
      expect(wheelTyre.material).toBe(tyre.material);
      expect(wheelRim.material).toBe(rim.material);
      for (const part of [wheelTyre, wheelRim]) {
        expect(part.material.depthTest).toBe(true);
        expect(part.material.depthWrite).toBe(false);
        expect(part.material.polygonOffset).toBe(true);
      }
    }
  }
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

function pivotModel(): Group {
  const source = new Group();
  for (const [corner, x, z] of [['FL', 0.8, -1.4], ['FR', -0.8, -1.4], ['RL', 0.8, 1.4], ['RR', -0.8, 1.4]] as const) {
    for (const name of ['tyres', 'rims']) {
      const geometry = new BoxGeometry(0.2, name === 'tyres' ? 0.66 : 0.4, name === 'tyres' ? 0.66 : 0.4);
      // The source hub is deliberately offset from the bounding-box center.
      geometry.translate(x, 0.3, z + 0.01);
      const mesh = new Mesh(geometry, new MeshStandardMaterial()); mesh.name = `${name}-${corner}`;
      mesh.userData.wheelPivot = [x, 0.3, z]; source.add(mesh);
    }
  }
  return source;
}

it('uses exported rolling hubs instead of box centers and preserves every vertex at rest', () => {
  const source = pivotModel(), original = source.children[0] as Mesh;
  const before = new Vector3().fromBufferAttribute(original.geometry.getAttribute('position'), 0);
  const rigs = attachWheelRigs(source);
  expect(rigs).toHaveLength(4);
  expect(rigs[0].hub.z).toBe(-1.4);
  source.updateMatrixWorld(true);
  const tyre = rigs[0].pivot.children[0] as Mesh;
  expect(tyre.geometry).toBe(original.geometry);
  const after = new Vector3().fromBufferAttribute(tyre.geometry.getAttribute('position'), 0).applyMatrix4(tyre.matrixWorld);
  expect(after.distanceTo(before)).toBeLessThan(1e-6);
  const radius = before.distanceTo(rigs[0].hub);
  rigs[0].pivot.rotation.set(1.7, 0.4, 0, 'YXZ'); source.updateMatrixWorld(true);
  const spun = new Vector3().fromBufferAttribute(tyre.geometry.getAttribute('position'), 0).applyMatrix4(tyre.matrixWorld);
  expect(spun.distanceTo(rigs[0].hub)).toBeCloseTo(radius);
  expect(rigs[0].pivot.position.distanceTo(rigs[0].hub)).toBe(0);
});

it.each(['nonfinite', 'wrong-corner', 'mismatch', 'missing-rim', 'detached'])(
  'leaves malformed exported pivots unchanged: %s', failure => {
    const source = pivotModel();
    if (failure === 'nonfinite') source.children[0].userData.wheelPivot = [NaN, 0.3, -1.4];
    if (failure === 'wrong-corner') source.children[0].userData.wheelPivot = [-0.8, 0.3, -1.4];
    if (failure === 'mismatch') source.children[1].userData.wheelPivot = [0.8, 0.3, -1.3];
    if (failure === 'missing-rim') source.remove(source.children[1]);
    if (failure === 'detached') {
      source.children[0].userData.wheelPivot = [0.8, 0.8, -1.4];
      source.children[1].userData.wheelPivot = [0.8, 0.8, -1.4];
    }
    const children = [...source.children];
    expect(attachWheelRigs(source)).toEqual([]); expect(source.children).toEqual(children);
  },
);
