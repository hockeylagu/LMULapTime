import { Vector3, type Camera } from 'three';
import type { HeldMove } from './heldKeys.js';

export const MIN_CAMERA_DISTANCE = 4, MAX_CAMERA_DISTANCE = 7000;

/** Translate the eye and orbit pivot together, using the camera's horizontal heading and world up. */
export function flyCamera(camera: Camera, target: Vector3, {strafe, forward, lift}: HeldMove): void {
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  // Using the horizontal right axis also preserves the heading in the straight-down view.
  const heading = new Vector3(right.z, 0, -right.x);
  const offset = right.multiplyScalar(strafe).addScaledVector(heading, forward).setY(lift);
  camera.position.add(offset); target.add(offset);
}
