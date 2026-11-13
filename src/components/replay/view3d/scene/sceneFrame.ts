/** LMU is left-handed Y-up; Three.js is right-handed. Stored data stays native. */
export function nativeToScene(
  point: {x: number; y: number; z: number},
  origin: {x: number; y: number; z: number},
): [number, number, number] {
  return [point.x - origin.x, point.y - origin.y, origin.z - point.z];
}
