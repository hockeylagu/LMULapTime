import { Euler, Matrix4, Vector3, type Object3D } from 'three';
import { frameWithin } from '../cars/carParts.js';
import type { CarCamera } from '../../../../../shared/types/scenes/car.js';

/**
 * Car-mounted cameras, named by the car descriptor after their role: the driver's eye (`cockpit`, cockpit mesh `in`), the bonnet camera
 * (`hood`: over the bonnet on GT cars, ahead of the front axle on prototypes) and the forward roof camera (`roof`, above the roll hoop).
 */
const DRIVER_CAMERAS = ['cockpit', 'hood', 'roof'] as const;
export type DriverCameraMode = typeof DRIVER_CAMERAS[number];

export const isDriverCamera = (mode: string): mode is DriverCameraMode => (DRIVER_CAMERAS as readonly string[]).includes(mode);

/** The car's camera for a mode; the package gives every car all three. */
export function driverCamera(cameras: readonly CarCamera[], mode: DriverCameraMode): CarCamera {
  const camera = cameras.find(item => item.name === mode);
  if (!camera) throw Error(`The car has no ${mode} camera`);
  return camera;
}

export interface DriverPose { eye: Vector3; target: Vector3; up: Vector3 }

const LOOK_AHEAD_M = 40;
const local = new Vector3(), direction = new Vector3(), euler = new Euler(), inCar = new Matrix4(), bodyFrame = new Matrix4();

/**
 * Eye, look target and up of a car camera in scene coordinates. `car` is placed (`placeCarFrame`) and holds its body model in the
 * model's native frame (+x left, +y up, -z forward): the car's world matrix and the body's local ones (its ground fit) apply the lap
 * pose, the ground fit and the mirrored scene frame, whatever the body's world matrix is (the car's part table writes it once a frame).
 * The orientation offsets are pitch (about +x, negative looks down), yaw and roll.
 */
export function driverPose(car: Object3D, camera: CarCamera, out: DriverPose): DriverPose {
  const body = car.getObjectByName('body-envelope');
  if (!body) throw Error('Car has no body envelope');
  bodyFrame.multiplyMatrices(car.matrixWorld, frameWithin(body, car, inCar));
  const [pitch, yaw, roll] = camera.orientation;
  euler.set(pitch, yaw, roll, 'YXZ');
  out.eye.set(...camera.position);
  local.copy(out.eye);
  out.eye.applyMatrix4(bodyFrame);
  direction.set(0, 0, -LOOK_AHEAD_M).applyEuler(euler);
  out.target.copy(local).add(direction);
  out.target.applyMatrix4(bodyFrame);
  direction.set(0, 1, 0).applyEuler(euler);
  out.up.copy(local).add(direction);
  out.up.applyMatrix4(bodyFrame).sub(out.eye).normalize();
  return out;
}
