import { Box3, Matrix4, Ray, Vector3, type BufferAttribute, type BufferGeometry, type InterleavedBufferAttribute, type Mesh } from 'three';
import { CURTAIN_RISE_ATTRIBUTE, type CurtainLift } from './traceCurtain.js';

/**
 * The hover pick on a lap's curtain or racing ribbon: both are strips of two vertices per lap sample (`traceCurtain.ts`,
 * `racingLine.ts`). The triangles sit in a coarse grid of `PICK_CELL_M` cells: a
 * ray is tested against the cells' boxes, then against the triangles of the cells it crosses (a few hundred, not the whole lap). The
 * hit triangle's nearest vertex gives the sample. A curtain's vertices stand on their feet by their rise times its step's scale,
 * as its shader stands them (`traceCurtain.ts`); the cells' boxes hold the feet and grow by the tallest rise at the cell's most.
 */

/** The grid's cell across (x) and along (z), metres. */
export const PICK_CELL_M = 50;

interface PickCell {
  /** The cell's feet (a ribbon's vertices). */
  box: Box3;
  /** The tallest rise of the cell's vertices at scale 1 (0 for a ribbon). */
  rise: number;
  /** Each triangle's three vertex indices, in turn. */
  triangles: number[];
}

/** The strip's pick grid, built once per geometry (a re-drape replaces the geometry, so it builds again). */
const grids = new WeakMap<BufferGeometry, PickCell[]>();

/**
 * The triangles of the strip that are the sheet or the ribbon: the first `stripIndexCount` indices (a curtain's top edges follow
 * its fill in the index and are left out; the edges stand on the fill's top, which picks the same sample).
 */
function gridOf(geometry: BufferGeometry, stripIndexCount: number): PickCell[] {
  const cached = grids.get(geometry);
  if (cached) return cached;
  const position = geometry.getAttribute('position'), index = geometry.getIndex(), rises = riseOf(geometry);
  const cells = new Map<string, PickCell>(), a = new Vector3();
  const count = Math.min(stripIndexCount, index?.count ?? 0);
  for (let t = 0; t + 2 < count; t += 3) {
    const corners = [index!.getX(t), index!.getX(t + 1), index!.getX(t + 2)];
    a.fromBufferAttribute(position, corners[0]);
    const key = `${Math.floor(a.x / PICK_CELL_M)}:${Math.floor(a.z / PICK_CELL_M)}`;
    const cell = cells.get(key) ?? cells.set(key, {box: new Box3(), rise: 0, triangles: []}).get(key)!;
    for (const corner of corners) {
      cell.box.expandByPoint(a.fromBufferAttribute(position, corner));
      if (rises) cell.rise = Math.max(cell.rise, rises.getY(corner));
    }
    cell.triangles.push(...corners);
  }
  const built = [...cells.values()];
  grids.set(geometry, built);
  return built;
}

export interface StripHit {
  /** The lap sample under the ray: the hit triangle's nearest vertex's. */
  index: number;
  /** Where the ray meets the strip, in the space of `ray` (the scene's). */
  point: Vector3;
  distance: number;
}

/** A curtain's rise attribute; a ribbon has none. */
const riseOf = (geometry: BufferGeometry): BufferAttribute | InterleavedBufferAttribute | undefined =>
  (geometry.hasAttribute(CURTAIN_RISE_ATTRIBUTE) ? geometry.getAttribute(CURTAIN_RISE_ATTRIBUTE) : undefined);

const toLocal = new Matrix4(), localRay = new Ray(), hit = new Vector3(), corner = [new Vector3(), new Vector3(), new Vector3()];
const box = new Box3(), riseOffset = new Vector3();

/**
 * The nearest hit of `ray` (scene space) on `mesh`'s strip, its first `stripIndexCount` indices; null for none. The mesh's own
 * transform (under the mirrored world) carries the ray into its frame, and the hit back. `lift`: how a curtain stands at the view
 * (`curtainLift`); without it a curtain stands at scale 1.
 */
export function pickStrip(mesh: Mesh, stripIndexCount: number, ray: Ray, lift?: CurtainLift): StripHit | null {
  mesh.updateWorldMatrix(true, false);
  localRay.copy(ray).applyMatrix4(toLocal.copy(mesh.matrixWorld).invert());
  const position = mesh.geometry.getAttribute('position'), rises = riseOf(mesh.geometry);
  let best: StripHit | null = null;
  for (const cell of gridOf(mesh.geometry, stripIndexCount)) {
    box.copy(cell.box).max.y += cell.rise * (lift?.scale ?? 1);
    if (!localRay.intersectsBox(box)) continue;
    for (let t = 0; t < cell.triangles.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        corner[k].fromBufferAttribute(position, cell.triangles[t + k]);
        if (rises) corner[k].addScaledVector(riseOffset.fromBufferAttribute(rises, cell.triangles[t + k]), lift?.scale ?? 1);
      }
      // Both sides: a curtain shows from either side, a ribbon from above.
      if (!localRay.intersectTriangle(corner[0], corner[1], corner[2], false, hit)) continue;
      const point = hit.clone().applyMatrix4(mesh.matrixWorld), distance = point.distanceTo(ray.origin);
      // A curtain faded out near a driver or chase camera is not under the pointer: a sheet further along may be.
      if ((lift && distance < lift.shownFromM) || (best && distance >= best.distance)) continue;
      const nearest = [0, 1, 2].reduce((n, k) => (corner[k].distanceToSquared(hit) < corner[n].distanceToSquared(hit) ? k : n), 0);
      best = {index: Math.floor(cell.triangles[t + nearest] / 2), point, distance};
    }
  }
  return best;
}

/**
 * How far from the ray a sample's foot still picks (m): `fixedM` everywhere (an orthographic view's pixels) plus `perMetreM` for each
 * metre along the ray (a perspective view's pixels, wider further away).
 */
export interface FootReach { fixedM: number; perMetreM: number; /** Feet nearer the eye are faded out (`CurtainLift.shownFromM`). */ fromM?: number }

/**
 * The lap sample whose foot on the road is nearest `ray` (scene space) within its reach, on `mesh`'s strip: from above a curtain
 * stands edge-on and the ray never meets its sheet, a thin line is hard to land on, and where the value is 0 there is no sheet, only
 * its line on the road (driver, 2026-11-28). The hit is the ray's point
 * nearest that foot.
 */
export function pickStripFoot(mesh: Mesh, stripIndexCount: number, ray: Ray, reach: FootReach): StripHit | null {
  mesh.updateWorldMatrix(true, false);
  localRay.copy(ray).applyMatrix4(toLocal.copy(mesh.matrixWorld).invert());
  const position = mesh.geometry.getAttribute('position');
  const reachAt = (alongM: number) => reach.fixedM + reach.perMetreM * Math.max(0, alongM);
  let best: {index: number; gap: number} | null = null;
  for (const cell of gridOf(mesh.geometry, stripIndexCount)) {
    const far = localRay.origin.distanceTo(cell.box.getCenter(hit)) + cell.box.getSize(hit).length() / 2;
    if (!localRay.intersectsBox(box.copy(cell.box).expandByScalar(reachAt(far)))) continue;
    for (const vertex of cell.triangles) {
      if (vertex % 2) continue; // A sample's foot: the fill's lower vertex.
      hit.fromBufferAttribute(position, vertex);
      const along = localRay.origin.distanceTo(hit);
      if (along < (reach.fromM ?? 0)) continue;
      const gap = localRay.distanceSqToPoint(hit), limit = reachAt(along);
      // Nearest by the share of its reach, so a near foot and a far one compare in pixels.
      const share = gap / (limit * limit);
      if (share <= 1 && (!best || share < best.gap)) best = {index: vertex / 2, gap: share};
    }
  }
  if (!best) return null;
  localRay.closestPointToPoint(hit.fromBufferAttribute(position, best.index * 2), hit);
  const point = hit.clone().applyMatrix4(mesh.matrixWorld);
  return {index: best.index, point, distance: point.distanceTo(ray.origin)};
}

/** The stretch of the ray the frame must draw no opaque surface in for a hit to show: the eye to just short of the hit. */
export const HIT_CLEARANCE_M = 0.2;

export function clearSpan(ray: Ray, hitPoint: Vector3): readonly [Vector3, Vector3] {
  const length = Math.max(0, hitPoint.distanceTo(ray.origin) - HIT_CLEARANCE_M);
  return [ray.origin.clone(), ray.at(length, new Vector3())];
}
