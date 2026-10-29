import { expect, it } from 'vitest';
import { Group, OrthographicCamera, Vector3 } from 'three';
import { nativeToScene } from '../../../../src/components/replay/view3d/sceneFrame.js';

it('matches the 2D map handedness: native +X is right and native +Z is up', () => {
  const origin = {x: 10, y: 20, z: 30};
  expect(nativeToScene({x: 12, y: 23, z: 35}, origin)).toEqual([2, 3, -5]);
  const top = new OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  top.position.set(0, 100, 0); top.up.set(0, 0, -1); top.lookAt(0, 0, 0); top.updateMatrixWorld();
  const x = new Vector3(...nativeToScene({x: 11, y: 20, z: 30}, origin)).project(top);
  const z = new Vector3(...nativeToScene({x: 10, y: 20, z: 31}, origin)).project(top);
  expect(x.x).toBeGreaterThan(0); expect(z.y).toBeGreaterThan(0);
});

it('keeps reflected car heading, mesh positions and camera targets in the same frame', () => {
  const world = new Group(); world.scale.z = -1;
  const car = new Group(); car.rotation.y = Math.PI / 3; car.position.set(5, 2, 8); world.add(car);
  world.updateMatrixWorld(true);
  const target = car.getWorldPosition(new Vector3());
  expect(target.toArray()).toEqual(nativeToScene({x: 5, y: 2, z: 8}, {x: 0, y: 0, z: 0}));
  const nose = car.localToWorld(new Vector3(0, 0, -1)).sub(target);
  expect(nose.x).toBeCloseTo(-Math.sin(Math.PI / 3)); expect(nose.z).toBeCloseTo(Math.cos(Math.PI / 3));
});
