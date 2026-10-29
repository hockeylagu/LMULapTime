import { expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { trackCamera } from '../../../../src/components/replay/view3d/cameraTracking.js';
import { panCamera, zoomCamera } from '../../../../src/components/replay/view3d/cameraNavigation.js';

it.each([new PerspectiveCamera(48), new OrthographicCamera(-80, 80, 80, -80)])('keeps manual orbit, pan and zoom offsets while following elevation and position', camera => {
  const previous = new Vector3(100, 10, 200), next = new Vector3(110, 13, 190), focus = previous.clone();
  camera.position.copy(previous).add(new Vector3(24, 22, 35)); camera.lookAt(focus);
  panCamera(camera, focus, 1, -1); zoomCamera(camera, focus, 1);
  const cameraOffset = camera.position.clone().sub(previous), focusOffset = focus.clone().sub(previous), zoom = camera.zoom;
  trackCamera(camera, focus, previous, next);
  expect(camera.position.clone().sub(next).distanceTo(cameraOffset)).toBeCloseTo(0);
  expect(focus.clone().sub(next).distanceTo(focusOffset)).toBeCloseTo(0);
  expect(focusOffset.length()).toBeGreaterThan(0); expect(camera.zoom).toBe(zoom);
  // Re-rendering the same paused sample must not snap the panned target back to the car.
  trackCamera(camera, focus, next, next);
  expect(focus.clone().sub(next).distanceTo(focusOffset)).toBeCloseTo(0);
  expect(previous.toArray()).toEqual([100, 10, 200]); expect(next.toArray()).toEqual([110, 13, 190]);
});

it('carries adjusted chase-camera and focus offsets around the car through heading changes', () => {
  const camera = new PerspectiveCamera(48), focus = new Vector3(), previous = new Vector3(), next = new Vector3(10, 3, 20);
  camera.position.set(0, 6, -17); camera.lookAt(focus);
  zoomCamera(camera, focus, 1); panCamera(camera, focus, 1, 0);
  const relativeCamera = camera.position.clone(), relativeFocus = focus.clone();
  trackCamera(camera, focus, previous, next, Math.PI / 2);
  // Native +pi/2 turns the reset chase offset from -Z toward +X after the scene reflection.
  expect(camera.position.clone().sub(next).distanceTo(new Vector3(-relativeCamera.z, relativeCamera.y, relativeCamera.x))).toBeCloseTo(0);
  expect(focus.clone().sub(next).distanceTo(new Vector3(-relativeFocus.z, relativeFocus.y, relativeFocus.x))).toBeCloseTo(0);
});
