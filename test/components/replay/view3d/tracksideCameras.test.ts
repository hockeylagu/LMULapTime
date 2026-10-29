import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createTracksideCameras } from '../../../../src/components/replay/view3d/tracksideCameras.js';

it('places fixed spots to the left of travel, ahead of the stretch each one covers', () => {
  // Driving native -Z (forward) for 1 km: the car's left is native +X, which the scene keeps as +X.
  const points = Array.from({length: 101}, (_, i) => ({x: 0, y: 0, z: -i * 10}));
  const spot = createTracksideCameras(points, points.map((_, i) => i * 10), new Vector3());
  const first = spot(0)!, same = spot(150)!, next = spot(170)!;
  expect(first.x).toBeCloseTo(18); expect(first.y).toBeCloseTo(6);
  expect(first.z).toBeCloseTo(70); // Scene Z mirrors native Z: 70 m down the road.
  expect(same).toBe(first); // One camera watches the whole stretch...
  expect(next.z).toBeCloseTo(230); // ...then the next one takes over.
  expect(createTracksideCameras([], [], new Vector3())(0)).toBeNull();
});
