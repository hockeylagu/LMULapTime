import { Box3, Euler, Matrix4, Mesh, Ray, Vector3, type Object3D } from 'three';
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

const toEnvelope = new Matrix4(), a = new Vector3(), b = new Vector3(), c = new Vector3(), triangle = new Box3();

/**
 * The cells a part is cut into, metres across (x) and along (z) the car: a body shell's box holds the roof's height over the hood,
 * the tail and the rounded sides too, and seen from the chase camera above the car its far top edge draws well over the roof; a
 * cell holds its own height.
 */
export const PART_CELL_M = 0.25;

/** The cells (`PART_CELL_M`) a span from `min` to `max` crosses, the first and the last: one at least. */
function cellsOf(min: number, max: number): [first: number, last: number] {
  const first = Math.floor(min / PART_CELL_M);
  return [first, Math.max(first, Math.ceil(max / PART_CELL_M) - 1)];
}

/** The part of `polygon` on one side of a plane across `axis` at `at`: `keep` 1 where the axis is at least `at`, -1 at most. */
function clip(polygon: Vector3[], axis: 'x' | 'z', at: number, keep: 1 | -1): Vector3[] {
  const kept: Vector3[] = [];
  polygon.forEach((point, i) => {
    const next = polygon[(i + 1) % polygon.length], side = (point[axis] - at) * keep, nextSide = (next[axis] - at) * keep;
    if (side >= 0) kept.push(point);
    if ((side < 0 && nextSide > 0) || (side > 0 && nextSide < 0)) kept.push(point.clone().lerp(next, side / (side - nextSide)));
  });
  return kept;
}

/**
 * A mesh's triangles, through `matrix`, into `cells` of PART_CELL_M across and along the car: each cell widened over the part of
 * each triangle in it (a windscreen's few triangles give the cells by the hood the hood's height, not the roof's).
 */
function addToCells(cells: Map<string, Box3>, geometry: Mesh['geometry'], matrix: Matrix4): void {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!position) return;
  const count = index ? index.count : position.count;
  for (let corner = 0; corner + 2 < count; corner += 3) {
    const vertex = (n: number, into: Vector3) => into.fromBufferAttribute(position, index ? index.getX(corner + n) : corner + n).applyMatrix4(matrix);
    const points = [vertex(0, a), vertex(1, b), vertex(2, c)];
    triangle.setFromPoints(points);
    const [firstX, lastX] = cellsOf(triangle.min.x, triangle.max.x), [firstZ, lastZ] = cellsOf(triangle.min.z, triangle.max.z);
    for (let cellX = firstX; cellX <= lastX; cellX++) for (let cellZ = firstZ; cellZ <= lastZ; cellZ++) {
      let piece = points;
      // A triangle in one cell is whole; one across cells is cut at the edges it crosses.
      if (firstX !== lastX) piece = clip(clip(piece, 'x', cellX * PART_CELL_M, 1), 'x', (cellX + 1) * PART_CELL_M, -1);
      if (firstZ !== lastZ) piece = clip(clip(piece, 'z', cellZ * PART_CELL_M, 1), 'z', (cellZ + 1) * PART_CELL_M, -1);
      if (!piece.length) continue;
      const key = `${cellX},${cellZ}`, box = cells.get(key) ?? cells.set(key, new Box3()).get(key)!;
      for (const point of piece) box.expandByPoint(point);
    }
  }
}

/**
 * A car model's body in its envelope's frame (the car's, without the envelope's lift), where its parts hang, as boxes over cells
 * of `PART_CELL_M` across and along it, its contact shadow left out: the parts in a cell (the shell, the cockpit inside it, a
 * detail level's copy) share its box.
 */
export function envelopeParts(car: Object3D): Box3[] {
  const cells = new Map<string, Box3>();
  eachPart(car, (geometry, matrix) => addToCells(cells, geometry, matrix));
  return [...cells.values()];
}

/** Each mesh of a car model's envelope but its contact shadow, with the matrix from the mesh's frame to the envelope's. */
function eachPart(car: Object3D, visit: (geometry: Mesh['geometry'], matrix: Matrix4) => void): void {
  const envelope = car.getObjectByName('body-envelope');
  envelope?.updateWorldMatrix(true, true);
  envelope?.traverse(object => {
    // The contact shadow lies flat under the body, wider and longer than it.
    if (!(object instanceof Mesh) || object.name === CONTACT_SHADOW_NAME) return;
    visit(object.geometry as Mesh['geometry'], toEnvelope.copy(envelope.matrixWorld).invert().multiply(object.matrixWorld));
  });
}

/** A car model's body bounds in its envelope's frame, over its parts where they hang; a point at the origin without parts. */
export function envelopeBounds(car: Object3D, box = new Box3()): Box3 {
  box.makeEmpty();
  eachPart(car, (geometry, matrix) => {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.union(triangle.copy(geometry.boundingBox!).applyMatrix4(matrix));
  });
  return box.isEmpty() ? box.setFromCenterAndSize(new Vector3(), new Vector3()) : box;
}

/** A car smaller than this on screen (its outline's larger side, CSS pixels) is not picked: too small to tell apart. */
export const PICK_MIN_PX = 12;
/** Cars nearer the camera than this (metres along its view) are around it, not under the pointer: the followed car from its cockpit. */
const PICK_NEAREST_M = 3;
/** How far outside its parts the surface under the pointer may lie and still be the car's, metres: the parts are placed on the road under the pose. */
const SURFACE_SLACK_M = 0.1;

const corner = new Vector3(), toView = new Matrix4(), place = new Matrix4(), mirror = new Matrix4().makeScale(1, 1, -1), euler = new Euler();
const grown = new Box3(), carFrame = new Matrix4(), toLocal = new Matrix4(), localRay = new Ray();

/** The car's frame to the scene's: the scene draws native coordinates around the origin, mirrored along z. */
function carToScene(car: DrawnPlace, origin: {x: number; y: number; z: number}, matrix: Matrix4): Matrix4 {
  place.makeRotationFromEuler(euler.set(car.rotX, car.rotY, car.rotZ, 'YXZ')).setPosition(car.x - origin.x, car.y - origin.y, car.z - origin.z);
  return matrix.multiplyMatrices(mirror, place);
}

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

/** Whether an outline on screen is at least PICK_MIN_PX across, along either axis. */
function wideEnough(points: readonly Point[]): boolean {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= PICK_MIN_PX;
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
    toView.multiplyMatrices(view.matrixWorldInverse, carToScene(car, origin, carFrame));
    const box = car.box ?? PICK_BOX, {min, max} = box;
    const depth = -corner.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2).applyMatrix4(toView).z;
    if (depth < PICK_NEAREST_M) continue;
    // On the outline its box (one of its parts) draws on screen, the box at least PICK_MIN_PX across; a corner of its box behind the
    // camera leaves the car out.
    const outline = cornersOnScreen(box, view.projectionMatrix, width, height);
    if (!outline || !wideEnough(outline)) continue;
    const onPart = (part: Box3) => { const points = cornersOnScreen(part, view.projectionMatrix, width, height); return points !== null && insideHull(points, x, y); };
    if (car.parts ? car.parts.some(onPart) : insideHull(outline, x, y)) under.push({car, depth});
  }
  return under.sort((a, b) => a.depth - b.depth).map(({car}) => car);
}

/** A stretch of the pointer's ray through a car's parts: where it enters and leaves them, in scene coordinates. */
export interface CarSpan {
  car: DrawnPlace;
  enter: Vector3;
  leave: Vector3;
}

/** Where `ray` enters and leaves `box`, as distances along it from its origin (0 at the earliest); null when it misses. */
function crossing(ray: Ray, box: Box3): [number, number] | null {
  let enter = 0, leave = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const from = ray.origin[axis], step = ray.direction[axis], min = box.min[axis], max = box.max[axis];
    if (step === 0) {
      if (from < min || from > max) return null;
      continue;
    }
    const a = (min - from) / step, b = (max - from) / step;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return [enter, leave];
}

/**
 * Where the pointer's `ray` (scene coordinates, from the near plane) passes through `cars` (nearest the camera first, as `carsUnder`
 * lists them), car by car and nearest first: its parts (its box without them) each grown by SURFACE_SLACK_M, overlapping stretches
 * joined. The surface under the pointer is the car's of the first stretch it lies in; in none, it is another's: scenery, a car not
 * listed, the sky.
 */
export function carSpans(cars: readonly DrawnPlace[], origin: {x: number; y: number; z: number}, ray: Ray): CarSpan[] {
  const spans: CarSpan[] = [];
  for (const car of cars) {
    const toScene = carToScene(car, origin, carFrame);
    localRay.copy(ray).applyMatrix4(toLocal.copy(toScene).invert());
    const stretches = (car.parts ?? [car.box ?? PICK_BOX])
      .map(part => crossing(localRay, grown.copy(part).expandByScalar(SURFACE_SLACK_M)))
      .filter(stretch => stretch !== null)
      .sort((a, b) => a[0] - b[0]);
    const joined: Array<[number, number]> = [];
    for (const [enter, leave] of stretches) {
      const last = joined.at(-1);
      if (last && enter <= last[1]) last[1] = Math.max(last[1], leave); else joined.push([enter, leave]);
    }
    // The frame is rigid (a turn, a mirror, a move): distances along the ray are the scene's.
    for (const [enter, leave] of joined) {
      spans.push({car, enter: localRay.at(enter, new Vector3()).applyMatrix4(toScene), leave: localRay.at(leave, new Vector3()).applyMatrix4(toScene)});
    }
  }
  return spans;
}
