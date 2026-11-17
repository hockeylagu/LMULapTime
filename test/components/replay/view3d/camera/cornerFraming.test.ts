import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { cornerFraming } from '../../../../../src/components/replay/view3d/camera/cornerFraming.js';

/** A right-angle arc of radius `radius` around the origin, from +x to +z (scene coordinates, y up). */
const arc = (radius: number) => Array.from({length: 11}, (_, i) => {
  const angle = (i / 10) * Math.PI / 2;
  return new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
});

/** Each point of `path` in normalized device coordinates, seen from `eye` looking at `look`. */
function onScreen(path: Vector3[], eye: Vector3, look: Vector3, fovDeg: number, aspect: number): Vector3[] {
  const camera = new PerspectiveCamera(fovDeg, aspect, 0.5, 15000);
  camera.position.copy(eye); camera.lookAt(look); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  return path.map(point => point.clone().project(camera));
}

describe('cornerFraming', () => {
  it('stands outside the turn, beyond its slowest point and above it, looking at the middle of the path', () => {
    const path = arc(50), apex = path[5];
    const {eye, look} = cornerFraming(path, apex, 48, 16 / 9);
    // The path's centre lies inside the turn; the eye stands on the far side of the apex from it.
    const outward = new Vector3(apex.x - look.x, 0, apex.z - look.z).normalize();
    const flat = new Vector3(eye.x - look.x, 0, eye.z - look.z);
    expect(flat.clone().normalize().dot(outward)).toBeCloseTo(1);
    expect(flat.length()).toBeGreaterThan(apex.clone().sub(look).setY(0).length());
    expect(eye.y).toBeGreaterThan(look.y + 20);
  });

  it('fits a long corner in a wide and in a tall view, filling much of either', () => {
    for (const aspect of [16 / 9, 0.6]) {
      const path = arc(250);
      const {eye, look} = cornerFraming(path, path[5], 48, aspect);
      const screen = onScreen(path, eye, look, 48, aspect);
      for (const point of screen) { expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1); }
      expect(Math.max(...screen.map(point => Math.max(Math.abs(point.x), Math.abs(point.y))))).toBeGreaterThan(0.6);
    }
  });

  it('stands beside a near-straight stretch, 40 m away', () => {
    const straight = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(20, 0, 0)];
    const {eye, look} = cornerFraming(straight, straight[1], 48, 1);
    expect(look.x).toBeCloseTo(10);
    expect(Math.abs(eye.z - look.z)).toBeGreaterThan(Math.abs(eye.x - look.x));
    expect(eye.distanceTo(look)).toBeCloseTo(40);
  });
});
