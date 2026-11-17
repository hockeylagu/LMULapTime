import { Vector3 } from 'three';

/** How far above the corner the framing eye looks down, degrees. */
const ELEVATION_DEG = 35;
/** Room around the corner's path, as a share of its extent. */
const MARGIN = 1.15;
/** The nearest the eye stands to the corner's centre, metres: a short kink still shows its approach. */
const MIN_DISTANCE_M = 40;

/**
 * Where a free camera stands to show a corner whole: outside the turn, beyond the slowest point and above it, looking at the
 * centre of the path from entry to exit. `path` is the path in scene coordinates (y up), `apex` its slowest point; `fovDeg` the
 * camera's vertical field of view and `aspect` its width over height. The distance fits the path's width across the view and
 * its depth as the look-down angle foreshortens it.
 */
export function cornerFraming(path: readonly Vector3[], apex: Vector3, fovDeg: number, aspect: number): {eye: Vector3; look: Vector3} {
  const look = new Vector3();
  for (const point of path) look.add(point);
  look.divideScalar(Math.max(1, path.length));
  // The path's centre lies inside the turn, so the slowest point is outward from it. A corner near straight has no inside:
  // the eye stands beside the path's chord instead.
  const outward = new Vector3(apex.x - look.x, 0, apex.z - look.z);
  if (outward.length() < 1 && path.length > 1) {
    const chord = new Vector3().subVectors(path[path.length - 1], path[0]);
    outward.set(-chord.z, 0, chord.x);
  }
  if (outward.lengthSq() === 0) outward.set(0, 0, 1);
  outward.normalize();
  const elevation = ELEVATION_DEG * Math.PI / 180;
  let halfWidth = 0, halfHeight = 0;
  for (const point of path) {
    const dx = point.x - look.x, dz = point.z - look.z;
    halfWidth = Math.max(halfWidth, Math.abs(dz * outward.x - dx * outward.z));
    halfHeight = Math.max(halfHeight, Math.abs(dx * outward.x + dz * outward.z) * Math.sin(elevation) + Math.abs(point.y - look.y) * Math.cos(elevation));
  }
  const tanHalfV = Math.tan(fovDeg * Math.PI / 360), tanHalfH = tanHalfV * aspect;
  const distance = Math.max(MIN_DISTANCE_M, MARGIN * Math.max(halfWidth / tanHalfH, halfHeight / tanHalfV));
  const eye = look.clone()
    .addScaledVector(outward, distance * Math.cos(elevation))
    .add(new Vector3(0, distance * Math.sin(elevation), 0));
  return {eye, look};
}
