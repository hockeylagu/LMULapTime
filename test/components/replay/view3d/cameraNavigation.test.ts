import { expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE, panCamera, zoomCamera } from '../../../../src/components/replay/view3d/cameraNavigation.js';

it('zooms perspective about its target, reversibly and within orbit limits', () => {
  const target = new Vector3(5, 2, -8), camera = new PerspectiveCamera(48);
  camera.position.copy(target).add(new Vector3(0, 0, 100));
  zoomCamera(camera, target, 1); expect(camera.position.distanceTo(target)).toBeCloseTo(80);
  zoomCamera(camera, target, -1); expect(camera.position.distanceTo(target)).toBeCloseTo(100);
  zoomCamera(camera, target, 100); expect(camera.position.distanceTo(target)).toBeCloseTo(MIN_CAMERA_DISTANCE);
  zoomCamera(camera, target, -100); expect(camera.position.distanceTo(target)).toBeCloseTo(MAX_CAMERA_DISTANCE);
  expect(target.toArray()).toEqual([5, 2, -8]);
});

it('zooms overhead orthographically without moving the camera and caps projection scale', () => {
  const camera = new OrthographicCamera(-80, 80, 80, -80); camera.position.set(0, 180, 0);
  const target = new Vector3();
  zoomCamera(camera, target, 1); expect(camera.zoom).toBeCloseTo(1.25);
  zoomCamera(camera, target, -1); expect(camera.zoom).toBeCloseTo(1);
  zoomCamera(camera, target, 100); expect(camera.zoom).toBe(40);
  zoomCamera(camera, target, -100); expect(camera.zoom).toBe(0.1);
  expect(camera.position.toArray()).toEqual([0, 180, 0]);
});

it.each([new PerspectiveCamera(60), new OrthographicCamera(-80, 80, 80, -80)])('pans in camera axes and keeps the viewing direction and orbit distance', camera => {
  camera.position.set(100, 0, 0); camera.lookAt(0, 0, 0);
  const target = new Vector3(), before = camera.position.clone().sub(target);
  panCamera(camera, target, 1, 0);
  expect(Math.abs(target.z)).toBeGreaterThan(1); expect(target.x).toBeCloseTo(0);
  expect(camera.position.clone().sub(target).distanceTo(before)).toBeCloseTo(0);
  panCamera(camera, target, 0, -1); expect(target.y).toBeGreaterThan(1);
  expect(camera.position.clone().sub(target).distanceTo(before)).toBeCloseTo(0);
});
