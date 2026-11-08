import { expect, it } from 'vitest';
import { Euler, Group, Quaternion, Vector3 } from 'three';
import type { CarCamera } from '../../../../shared/types/scenes/car.js';
import { driverCamera, driverPose, isDriverCamera } from '../../../../src/components/replay/view3d/driverCameras.js';

const camera = (name: string, position: [number, number, number], orientation: [number, number, number] = [0, 0, 0]): CarCamera =>
  ({ name, position, orientation, fov: [89, 49], clipPlanes: [0.1, 700], cockpitView: name === 'cockpit' ? 'in' : 'out' });
const cockpit = camera('cockpit', [0.3, 0.95, 0.31]), hood = camera('hood', [0.3, 0.92, -0.96]), roof = camera('roof', [0.3, 1.5, 0.4]);

/** The scene graph of the 3D view: a z-mirrored world, the posed car and its body model offset by the ground fit. */
function posedCar(at: Vector3, orientation = new Quaternion()) {
  const world = new Group(), car = new Group(), body = new Group();
  world.scale.z = -1; car.position.copy(at); car.quaternion.copy(orientation); body.position.set(0, 0.05, 0);
  world.add(car); car.add(body);
  return body;
}
const pose = () => ({ eye: new Vector3(), target: new Vector3(), up: new Vector3() });

it('picks the car camera of each car-mounted mode', () => {
  expect(driverCamera([hood, cockpit], 'cockpit')).toBe(cockpit);
  expect(driverCamera([hood, cockpit], 'hood')).toBe(hood);
  expect(driverCamera([hood, roof, cockpit], 'roof')).toBe(roof);
  expect(() => driverCamera([cockpit], 'roof')).toThrow('no roof camera');
  expect(() => driverCamera([hood], 'cockpit')).toThrow('no cockpit camera');
  expect(['cockpit', 'hood', 'roof', 'chase', 'toString'].map(isDriverCamera)).toEqual([true, true, true, false, false]);
});

it('places the eye at the camera position of the posed body and looks forward', () => {
  const at = new Vector3(100, 10, 200), result = driverPose(posedCar(at), cockpit, pose());
  // Native -z forward becomes scene +z through the mirrored world.
  const offset = result.eye.clone().sub(new Vector3(at.x, at.y, -at.z));
  expect(offset.distanceTo(new Vector3(0.3, 1, -0.31))).toBeLessThan(1e-9);
  expect(result.target.z).toBeGreaterThan(result.eye.z + 39);
  expect(result.up.y).toBeCloseTo(1, 6);
});

it('turns with the car and applies the camera pitch', () => {
  const quarter = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0, 'YXZ'));
  const turned = driverPose(posedCar(new Vector3(), quarter), cockpit, pose());
  const look = turned.target.clone().sub(turned.eye).normalize();
  expect(Math.abs(look.x)).toBeCloseTo(1, 6);
  const pitched = driverPose(posedCar(new Vector3()), camera('cockpit', [0, 1, 0], [-0.1, 0, 0]), pose());
  expect(pitched.target.y).toBeLessThan(pitched.eye.y);
});
