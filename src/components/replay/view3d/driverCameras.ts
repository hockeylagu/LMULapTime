import { Euler, Vector3, type Object3D } from 'three';
import type { CarCamera } from '../../../../shared/types/scenes/car.js';

/**
 * Car-mounted game cameras, by their LMU LocalCam: the driver's eye (`COCKPIT`, cockpit mesh `in`), the nose camera (`NOSECAM`:
 * over the bonnet on GT cars, ahead of the front axle on prototypes) and the forward roof camera (`ONBOARD00`, above the roll hoop).
 */
const GAME_CAMERAS = { cockpit: 'COCKPIT', hood: 'NOSECAM', roof: 'ONBOARD00' } as const;
export type DriverCameraMode = keyof typeof GAME_CAMERAS;

export const isDriverCamera = (mode: string): mode is DriverCameraMode => Object.hasOwn(GAME_CAMERAS, mode);

/** The game camera of a mode; the driver's eye when a car has none. */
export function driverCamera(cameras: readonly CarCamera[], mode: DriverCameraMode): CarCamera {
  const find = (name: string) => cameras.find(camera => camera.name.toUpperCase() === name);
  const camera = find(GAME_CAMERAS[mode]) ?? find('COCKPIT');
  if (!camera) throw Error('The car has no COCKPIT camera');
  return camera;
}

export interface DriverPose { eye: Vector3; target: Vector3; up: Vector3 }

const LOOK_AHEAD_M = 40;
const local = new Vector3(), direction = new Vector3(), euler = new Euler();

/**
 * Eye, look target and up of a game camera in scene coordinates. `body` is the car model in its native frame (+x left, +y up,
 * -z forward), already posed: going through its world matrix applies the lap pose, the ground fit and the mirrored scene frame.
 * The orientation offsets are pitch (about +x, negative looks down), yaw and roll.
 */
export function driverPose(body: Object3D, camera: CarCamera, out: DriverPose): DriverPose {
  body.updateWorldMatrix(true, false);
  const [pitch, yaw, roll] = camera.orientation;
  euler.set(pitch, yaw, roll, 'YXZ');
  out.eye.set(...camera.position);
  local.copy(out.eye);
  body.localToWorld(out.eye);
  direction.set(0, 0, -LOOK_AHEAD_M).applyEuler(euler);
  out.target.copy(local).add(direction);
  body.localToWorld(out.target);
  direction.set(0, 1, 0).applyEuler(euler);
  out.up.copy(local).add(direction);
  body.localToWorld(out.up).sub(out.eye).normalize();
  return out;
}
