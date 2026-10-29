import { Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';

const UP = new Vector3(0, 1, 0);

/** Move the user's camera/focus offsets with the car; native chase yaw becomes negative scene yaw. */
export function trackCamera(
  camera: PerspectiveCamera | OrthographicCamera, focus: Vector3,
  previousCar: Vector3, nextCar: Vector3, nativeYawDelta = 0,
): void {
  camera.position.sub(previousCar).applyAxisAngle(UP, -nativeYawDelta).add(nextCar);
  focus.sub(previousCar).applyAxisAngle(UP, -nativeYawDelta).add(nextCar);
}
