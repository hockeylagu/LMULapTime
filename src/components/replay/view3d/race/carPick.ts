import { Box3, Euler, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { CONTACT_SHADOW_NAME } from '../car/underCarBake.js';

/** A car where it was drawn: native metres and the body's rotations (race pose channels `x` to `rotZ`). */
export interface DrawnPlace {
  slot: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  /** The box it is picked by in the pose's frame (metres), its body as drawn on the road (`placeOnRoad`); `PICK_BOX` without. */
  box?: Box3;
  /** Its body's parts, placed as `box`: the point must fall on one of them, not only in the box (a roof aerial does not widen the roof). */
  parts?: readonly Box3[];
}

/** The box a car is picked by without its body's bounds, in its pose's frame (metres): 2 m wide, 1.2 m above the pose, 5 m long (along z). */
export const PICK_BOX = new Box3(new Vector3(-1, 0, -2.5), new Vector3(1, 1.2, 2.5));

/** A body on the road: the box a car is picked by, its body's bounds with their bottom on the road under the pose (`groundY`). */
export function placeOnRoad(body: Box3, poseY: number, groundY: number | null, box = new Box3()): Box3 {
  box.copy(body);
  const lift = groundY === null ? 0 : groundY - poseY - body.min.y;
  box.min.y += lift; box.max.y += lift;
  return box;
}

const toEnvelope = new Matrix4(), size = new Vector3();

/**
 * A car model's parts' bounds in its envelope's frame (the car's, without the envelope's lift), where they hang, its contact shadow
 * left out; a part inside another's bounds (the cockpit in the shell, a detail level's copy) only once, the largest first.
 */
export function envelopeParts(car: Object3D): Box3[] {
  const envelope = car.getObjectByName('body-envelope'), boxes: Box3[] = [];
  envelope?.updateWorldMatrix(true, true);
  envelope?.traverse(object => {
    // The contact shadow lies flat under the body, wider and longer than it.
    if (!(object instanceof Mesh) || object.name === CONTACT_SHADOW_NAME) return;
    const geometry = object.geometry as Mesh['geometry'];
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    toEnvelope.copy(envelope.matrixWorld).invert().multiply(object.matrixWorld);
    boxes.push(geometry.boundingBox!.clone().applyMatrix4(toEnvelope));
  });
  const volume = (box: Box3) => { box.getSize(size); return size.x * size.y * size.z; };
  const kept: Box3[] = [];
  for (const box of boxes.sort((a, b) => volume(b) - volume(a))) if (!kept.some(other => other.containsBox(box))) kept.push(box);
  return kept;
}

/** A car model's body bounds in its envelope's frame: its parts' (`envelopeParts`); a point at the origin without parts. */
export function envelopeBounds(car: Object3D, box = new Box3()): Box3 {
  box.makeEmpty();
  for (const part of envelopeParts(car)) box.union(part);
  return box.isEmpty() ? box.setFromCenterAndSize(new Vector3(), new Vector3()) : box;
}

/** Heights in a car's box that show it, metres above its pose: its body and, a little under the top, its roof. */
export function pickHeights(car: DrawnPlace): [body: number, roof: number] {
  const {min, max} = car.box ?? PICK_BOX;
  return [(min.y + max.y) / 2, max.y - (max.y - min.y) * 0.1];
}
/** A far car is picked within this many pixels of its centre at least. */
const PICK_MIN_PX = 10;
/** Cars nearer the camera than this (metres along its view) are around it, not under the pointer: the followed car from its cockpit. */
const PICK_NEAREST_M = 3;

const corner = new Vector3(), toView = new Matrix4(), place = new Matrix4(), mirror = new Matrix4().makeScale(1, 1, -1), euler = new Euler();

type Point = readonly [number, number];

/** Whether (x, y) lies in the convex hull of `points`: the outline a box draws on screen, not the rectangle around it. */
export function insideHull(points: readonly Point[], x: number, y: number): boolean {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), hull: Point[] = [];
  const turn = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  // The lower chain then the upper one (monotone chain): every turn of the hull one way round.
  for (const pass of [sorted, [...sorted].reverse()]) {
    const start = hull.length;
    for (const point of pass) {
      while (hull.length >= start + 2 && turn(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
      hull.push(point);
    }
    hull.pop();
  }
  return hull.length >= 3 && hull.every((point, i) => turn(point, hull[(i + 1) % hull.length], [x, y]) >= 0);
}

/** The eight corners of `box` on screen (CSS pixels), through `toView` and `projection`; null when one is behind the camera. */
function cornersOnScreen(box: Box3, projection: Matrix4, width: number, height: number): Point[] | null {
  const points: Point[] = [];
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z).applyMatrix4(toView);
    if (corner.z > -0.1) return null;
    corner.applyMatrix4(projection);
    points.push([((corner.x + 1) / 2) * width, ((1 - corner.y) / 2) * height]);
  }
  return points;
}

/**
 * The cars under a point of the canvas (`x` and `y`, CSS pixels from its top left corner, of `width` by `height`) as a frame drew
 * `places` around `origin` with the camera matrices of `view`, nearest to the camera first: those whose box the point falls in on screen.
 */
export function carsUnder(
  places: readonly DrawnPlace[], view: {readonly matrixWorldInverse: Matrix4; readonly projectionMatrix: Matrix4}, origin: {x: number; y: number; z: number},
  width: number, height: number, x: number, y: number,
): DrawnPlace[] {
  const under: Array<{car: DrawnPlace; depth: number}> = [];
  for (const car of places) {
    // The car's frame to the camera's: the scene draws native coordinates around the origin, mirrored along z.
    place.makeRotationFromEuler(euler.set(car.rotX, car.rotY, car.rotZ, 'YXZ')).setPosition(car.x - origin.x, car.y - origin.y, car.z - origin.z);
    toView.multiplyMatrices(view.matrixWorldInverse, mirror).multiply(place);
    const box = car.box ?? PICK_BOX, {min, max} = box;
    const depth = -corner.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2).applyMatrix4(toView).z;
    if (depth < PICK_NEAREST_M) continue;
    // Within PICK_MIN_PX of its centre, or on the outline its box (one of its parts) draws on screen; a corner of its box behind the
    // camera leaves the car out.
    corner.applyMatrix4(view.projectionMatrix);
    const centreX = ((corner.x + 1) / 2) * width, centreY = ((1 - corner.y) / 2) * height;
    const outline = cornersOnScreen(box, view.projectionMatrix, width, height);
    if (!outline) continue;
    const near = Math.abs(x - centreX) <= PICK_MIN_PX && Math.abs(y - centreY) <= PICK_MIN_PX;
    const onPart = (part: Box3) => { const points = cornersOnScreen(part, view.projectionMatrix, width, height); return points !== null && insideHull(points, x, y); };
    if (near || (car.parts ? car.parts.some(onPart) : insideHull(outline, x, y))) under.push({car, depth});
  }
  return under.sort((a, b) => a.depth - b.depth).map(({car}) => car);
}
