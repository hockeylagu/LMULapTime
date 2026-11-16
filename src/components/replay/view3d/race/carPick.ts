import { Euler, Matrix4, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';

/** A car where it was drawn: native metres and the body's rotations (race pose channels `x` to `rotZ`). */
export interface DrawnPlace {
  slot: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/** The box a car is picked by, in its own frame (metres): its width, its height above the pose and its length (along z). */
const HALF_WIDTH_M = 1, HEIGHT_M = 1.2, HALF_LENGTH_M = 2.5;
/** Heights above a car's pose that show it, metres: its body and its roof. */
export const PICK_BODY_M = 0.5, PICK_ROOF_M = 1.1;
/** A far car is picked within this many pixels of its centre at least. */
const PICK_MIN_PX = 10;
/** Cars nearer the camera than this (metres along its view) are around it, not under the pointer: the followed car from its cockpit. */
const PICK_NEAREST_M = 3;

const corner = new Vector3(), toView = new Matrix4(), place = new Matrix4(), mirror = new Matrix4().makeScale(1, 1, -1), euler = new Euler();

/**
 * The cars under a point of the canvas (`x` and `y`, CSS pixels from its top left corner, of `width` by `height`) as `camera` last
 * drew `places` around `origin`, nearest to the camera first: those whose box the point falls in on screen. The camera's matrices
 * are those of its last frame.
 */
export function carsUnder(
  places: readonly DrawnPlace[], camera: PerspectiveCamera | OrthographicCamera, origin: {x: number; y: number; z: number},
  width: number, height: number, x: number, y: number,
): DrawnPlace[] {
  const under: Array<{car: DrawnPlace; depth: number}> = [];
  for (const car of places) {
    // The car's frame to the camera's: the scene draws native coordinates around the origin, mirrored along z.
    place.makeRotationFromEuler(euler.set(car.rotX, car.rotY, car.rotZ, 'YXZ')).setPosition(car.x - origin.x, car.y - origin.y, car.z - origin.z);
    toView.multiplyMatrices(camera.matrixWorldInverse, mirror).multiply(place);
    const depth = -corner.set(0, HEIGHT_M / 2, 0).applyMatrix4(toView).z;
    if (depth < PICK_NEAREST_M) continue;
    // The box's extent on screen, at least PICK_MIN_PX around its centre; a corner behind the camera leaves the car out.
    corner.applyMatrix4(camera.projectionMatrix);
    const centreX = ((corner.x + 1) / 2) * width, centreY = ((1 - corner.y) / 2) * height;
    let left = centreX - PICK_MIN_PX, right = centreX + PICK_MIN_PX, top = centreY - PICK_MIN_PX, bottom = centreY + PICK_MIN_PX, behind = false;
    for (let index = 0; index < 8; index++) {
      corner.set(index & 1 ? HALF_WIDTH_M : -HALF_WIDTH_M, index & 2 ? HEIGHT_M : 0, index & 4 ? HALF_LENGTH_M : -HALF_LENGTH_M).applyMatrix4(toView);
      if (corner.z > -0.1) { behind = true; break; }
      corner.applyMatrix4(camera.projectionMatrix);
      const screenX = ((corner.x + 1) / 2) * width, screenY = ((1 - corner.y) / 2) * height;
      left = Math.min(left, screenX); right = Math.max(right, screenX); top = Math.min(top, screenY); bottom = Math.max(bottom, screenY);
    }
    if (!behind && x >= left && x <= right && y >= top && y <= bottom) under.push({car, depth});
  }
  return under.sort((a, b) => a.depth - b.depth).map(({car}) => car);
}
