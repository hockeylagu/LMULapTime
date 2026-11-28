import { expect, it, vi } from 'vitest';
import { MathUtils, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from '../../../../../src/components/replay/view3d/camera/cameraRig.js';
import { nativeToScene } from '../../../../../src/components/replay/view3d/scene/replayPose.js';

it('moves the orbit camera each frame while a key is held and stops on release', () => {
  const changed = vi.fn(), rig = createCameraRig(document.createElement('div'), new Vector3(), changed);
  rig.resize(1.5); rig.setMode('orbit');
  const start = rig.camera.position.clone();
  rig.holdKey('d', true);
  expect(changed).toHaveBeenCalled();
  let time = 0;
  expect(rig.step(time)).toBe(true); // The first frame only starts the clock.
  for (let i = 0; i < 30; i++) { time += 1000 / 60; rig.step(time); }
  const moved = rig.camera.position.distanceTo(start);
  expect(moved).toBeGreaterThan(0.3);
  rig.holdKey('d', false);
  const rest = rig.camera.position.clone();
  expect(rig.step(time + 1000 / 60)).toBe(false); expect(rig.camera.position).toEqual(rest);
  rig.dispose();
});

it('flies level, faster the farther it looks, up with E, and faster with Shift, keeping the view direction', () => {
  const rig = createCameraRig(document.createElement('div'), new Vector3(), vi.fn());
  rig.resize(1.5); rig.setMode('orbit');
  const run = (key: Parameters<typeof rig.holdKey>[0], frames = 20) => {
    let time = 0;
    rig.holdKey(key, true); rig.step(time);
    for (let i = 0; i < frames; i++) rig.step(time += 1000 / 60);
    rig.holdKey(key, false);
  };
  const eye = () => rig.camera.position.clone(), look = () => rig.camera.getWorldDirection(new Vector3());
  rig.frame(new Vector3(0, 30, 40), new Vector3());
  let before = eye(); const direction = look();
  run('w');
  const step = eye().sub(before);
  expect(step.y).toBeCloseTo(0);
  expect(step.clone().normalize().dot(direction.clone().setY(0).normalize())).toBeCloseTo(1);
  expect(look().dot(direction)).toBeCloseTo(1);
  rig.frame(new Vector3(0, 300, 400), new Vector3());
  before = eye(); run('w');
  const far = eye().distanceTo(before);
  expect(far).toBeCloseTo(10 * step.length()); // Ten times as far from where it looks: ten times as fast.
  expect(rig.camera.position.distanceTo(rig.focus)).toBeCloseTo(500);
  before = eye(); run('e');
  const lift = eye().sub(before);
  expect(lift.y).toBeGreaterThan(0.3); expect(Math.hypot(lift.x, lift.z)).toBeLessThan(1e-6);
  // Shift on its own does not move; held over W it goes faster.
  before = eye(); run('shift'); expect(eye().distanceTo(before)).toBe(0);
  let time = 0;
  rig.holdKey('shift', true); rig.holdKey('w', true); rig.step(time);
  for (let i = 0; i < 20; i++) rig.step(time += 1000 / 60);
  rig.holdKey('w', false); rig.holdKey('shift', false);
  expect(eye().distanceTo(before)).toBeCloseTo(4 * far);
  rig.dispose();
});

it('flies as fast as the camera is far from the lap, however far it looks, and measures the lap where it looks for the curtains', () => {
  const rig = createCameraRig(document.createElement('div'), new Vector3(), vi.fn());
  rig.resize(1.5); rig.setMode('orbit');
  // A lap along x through the origin, a point every 10 m.
  const points = Array.from({length: 201}, (_, i) => ({x: i * 10, y: 0, z: 0}));
  rig.setLayer({primary: new Object3D(), cameras: [], chaseLodMultiplier: 1, trajectory: {points}, primaryDistances: points.map(point => point.x)});
  const flown = (eye: Vector3, look: Vector3) => {
    rig.frame(eye, look);
    const before = rig.camera.position.clone();
    let time = 0;
    rig.holdKey('d', true); rig.step(time); rig.step(time += 100); rig.holdKey('d', false);
    return rig.camera.position.distanceTo(before);
  };
  // 200 m over the lap, looking at it: 100 m/s, 10 m in 0.1 s.
  expect(flown(new Vector3(1000, 200, 0), new Vector3(1000, 0, -1))).toBeCloseTo(10);
  // 200 m over the lap, looking 3 km off: still the lap's distance.
  expect(flown(new Vector3(1000, 200, 0), new Vector3(1000, 0, -3000))).toBeCloseTo(10);
  // 2 km off the lap: ten times as fast.
  expect(flown(new Vector3(1000, 2000, 0), new Vector3(1000, 0, -1))).toBeCloseTo(100);
  rig.dispose();
});

it('shows the whole lap from the air at an angle, diagonally to its long axis, from the diagonal nearer the view', () => {
  const rig = createCameraRig(document.createElement('div'), new Vector3(), vi.fn());
  rig.resize(1.5); rig.setMode('orbit');
  // A lap 2 km long along x and 400 m wide.
  const points = [[0, 0], [2000, 0], [2000, -400], [0, -400]].map(([x, z]) => ({x, y: 0, z}));
  rig.setLayer({primary: new Object3D(), cameras: [], chaseLodMultiplier: 1, trajectory: {points}, primaryDistances: [0, 2000, 2400, 4400]});
  const heading = rig.camera.getWorldDirection(new Vector3()).setY(0).normalize();
  rig.overview();
  const camera = rig.camera as PerspectiveCamera, look = camera.getWorldDirection(new Vector3());
  expect(MathUtils.radToDeg(Math.asin(-look.y))).toBeCloseTo(15); // Looking down at 15°.
  const ground = look.clone().setY(0).normalize();
  // At 45° to the long axis, the diagonal nearest the way it looked.
  expect(Math.abs(ground.x)).toBeCloseTo(Math.SQRT1_2); expect(ground.dot(heading)).toBeGreaterThan(0.7);
  camera.updateMatrixWorld();
  for (const point of points) { // Every corner of the lap in view.
    const seen = new Vector3(...nativeToScene(point, new Vector3())).project(camera);
    expect(Math.abs(seen.x)).toBeLessThan(1); expect(Math.abs(seen.y)).toBeLessThan(1);
  }
  rig.dispose();
});


it('stops descent at ground clearance while preserving the view and pivot distance', () => {
  // Flat ground at y = 0, the eye kept 1.2 m above it.
  const rig = createCameraRig(document.createElement('div'), new Vector3(), vi.fn(), (point, _from, clearance = 1.2) => Math.max(0, clearance - point.y));
  rig.resize(1.5); rig.setMode('orbit');
  rig.frame(new Vector3(0, 3, 10), new Vector3(0, 0, 0)); // Looking down at the road ahead.
  const direction = rig.camera.getWorldDirection(new Vector3());
  const pivotDistance = rig.camera.position.distanceTo(rig.focus);
  let time = 0;
  rig.holdKey('q', true); rig.step(time);
  for (let i = 0; i < 90; i++) rig.step(time += 1000 / 60);
  rig.holdKey('q', false);
  expect(rig.camera.position.y).toBeCloseTo(1.2);
  expect(rig.camera.position.z).toBeCloseTo(10);
  expect(rig.camera.position.distanceTo(rig.focus)).toBeCloseTo(pivotDistance);
  expect(rig.camera.getWorldDirection(new Vector3()).dot(direction)).toBeCloseTo(1);
  rig.dispose();
});

it('flies over a hill without sinking: the point it looks at rides the ground, the eye keeps its height over it', () => {
  // Flat ground at y = 0 to x 60, a 100 m plateau beyond.
  const ground = (x: number) => (x > 60 ? 100 : 0);
  const rig = createCameraRig(document.createElement('div'), new Vector3(), vi.fn(), (point, _from, clearance = 1.2) => Math.max(0, ground(point.x) + clearance - point.y));
  rig.resize(1.5); rig.setMode('orbit');
  rig.frame(new Vector3(0, 30, 0), new Vector3(40, 0, 0));
  const direction = rig.camera.getWorldDirection(new Vector3());
  let time = 0;
  rig.holdKey('w', true); rig.step(time);
  for (let i = 0; i < 60; i++) rig.step(time += 1000 / 60);
  rig.holdKey('w', false);
  expect(rig.focus.x).toBeGreaterThan(60); expect(rig.focus.y).toBeCloseTo(100); // On the plateau, not under it.
  expect(rig.camera.position.y).toBeCloseTo(130); // Still 30 m over the point it looks at.
  expect(rig.camera.getWorldDirection(new Vector3()).dot(direction)).toBeCloseTo(1);
  rig.dispose();
});

it.each([false, true])('keeps Orbit tilt and pan working while Shift is held (%s)', shiftKey => {
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, {
    clientHeight: {value: 600},
    setPointerCapture: {value: vi.fn()},
    releasePointerCapture: {value: vi.fn()},
  });
  const rig = createCameraRig(canvas, new Vector3(), vi.fn(), (point, _from, clearance = 1.2) => Math.max(0, clearance - point.y));
  rig.setMode('orbit');
  rig.frame(new Vector3(0, 3, 10), new Vector3());
  const distance = rig.camera.position.distanceTo(rig.focus);
  const pointer = (type: string, clientY: number, button = 0) =>
    new PointerEvent(type, {pointerId: 1, pointerType: 'mouse', clientY, button, shiftKey});
  canvas.dispatchEvent(pointer('pointerdown', 300));
  document.dispatchEvent(pointer('pointermove', 200));
  document.dispatchEvent(pointer('pointerup', 200));
  const direction = rig.camera.getWorldDirection(new Vector3());
  expect(direction.y).toBeGreaterThan(0.5);
  expect(rig.camera.position.y).toBeCloseTo(1.2);
  expect(rig.camera.position.distanceTo(rig.focus)).toBeCloseTo(distance);

  const eye = rig.camera.position.clone();
  rig.holdKey('w', true); rig.step(0); rig.step(100);
  expect(rig.camera.position.y).toBeCloseTo(eye.y);
  expect(rig.camera.position.distanceTo(eye)).toBeCloseTo(2.5);
  expect(rig.camera.getWorldDirection(new Vector3()).dot(direction)).toBeCloseTo(1);
  rig.holdKey('w', false);
  const pivot = rig.focus.clone();
  canvas.dispatchEvent(pointer('pointerdown', 200, 2));
  document.dispatchEvent(pointer('pointermove', 150, 2));
  document.dispatchEvent(pointer('pointerup', 150, 2));
  expect(rig.focus.distanceTo(pivot)).toBeGreaterThan(0);
  expect(rig.camera.getWorldDirection(new Vector3()).dot(direction)).toBeCloseTo(1);
  rig.setMode('follow');
  expect(rig.camera.getWorldDirection(new Vector3()).y).toBeLessThan(0);
  rig.dispose();
});

it.each(['orbit', 'top'] as const)('matches wheel, toolbar and keyboard zoom in %s', mode => {
  const canvas = document.createElement('canvas');
  const rig = createCameraRig(canvas, new Vector3(), vi.fn());
  rig.resize(1.5); rig.setMode(mode);
  if (mode === 'orbit') rig.frame(new Vector3(0, 30, 40), new Vector3());
  const scale = () => mode === 'top' ? 1 / rig.camera.zoom : rig.camera.position.distanceTo(rig.focus);
  const initial = scale();
  canvas.dispatchEvent(new WheelEvent('wheel', {deltaY: -100, cancelable: true}));
  const wheel = scale();
  expect(wheel / initial).toBeCloseTo(0.95);
  rig.zoom(-1);
  expect(scale()).toBeCloseTo(initial);
  rig.holdKey('in', true);
  rig.holdKey('in', true);
  rig.holdKey('in', false);
  expect(scale()).toBeCloseTo(wheel);
  rig.zoom(1000);
  expect(scale()).toBeCloseTo(mode === 'top' ? 1 / 40 : 4);
  rig.zoom(-1000);
  expect(scale()).toBeCloseTo(mode === 'top' ? 10 : 7000);
  rig.dispose();
});
