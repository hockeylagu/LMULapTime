import { expect, it } from 'vitest';
import { Euler, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { computeChaseTargetYaw, computeCockpitPose, createChaseCameraTracker, trackCamera } from '../../../../src/components/replay/view3d/cameraTracking.js';
import { panCamera, zoomCamera } from '../../../../src/components/replay/view3d/cameraNavigation.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';

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

it('smoothly interpolates velocity vector across sample intervals without staircase jumps in corners', () => {
  // 4 trajectory points curving into a right turn
  const curvePoints: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, timeSec: 0, rotY: 0, speedKmh: 150 },
    { x: -5, y: 0, z: -10, timeSec: 0.1, rotY: 0.2, speedKmh: 150 },
    { x: -15, y: 0, z: -20, timeSec: 0.2, rotY: 0.5, speedKmh: 150 },
    { x: -30, y: 0, z: -25, timeSec: 0.3, rotY: 0.8, speedKmh: 150 },
  ];

  // Fraction progression between sample 1 and 2: heading should progress monotonically
  const yawAt0 = computeChaseTargetYaw(0.2, curvePoints, 1, 0.0);
  const yawAt50 = computeChaseTargetYaw(0.35, curvePoints, 1, 0.5);
  const yawAt100 = computeChaseTargetYaw(0.5, curvePoints, 1, 1.0);

  expect(yawAt50).toBeGreaterThan(yawAt0);
  expect(yawAt100).toBeGreaterThan(yawAt50);

  // Transition from sample 1 (fraction 1.0) to sample 2 (fraction 0.0) is C0 continuous with zero jump
  const endSample1 = computeChaseTargetYaw(0.5, curvePoints, 1, 1.0);
  const startSample2 = computeChaseTargetYaw(0.5, curvePoints, 2, 0.0);
  expect(endSample1).toBeCloseTo(startSample2, 4);
});

it('clearly shows slip angle in turns while keeping tracking fluid and non-rigid', () => {
  const points: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, timeSec: 0, rotY: 0.3, speedKmh: 150 },
    { x: -0.5, y: 0, z: -2, timeSec: 0.02, rotY: 0.3, speedKmh: 150 },
    { x: -1.0, y: 0, z: -4, timeSec: 0.04, rotY: 0.3, speedKmh: 150 },
  ];
  // Car body turned deeper (+0.3 rad) than trajectory path (~0.24 rad):
  // Target chase yaw is between trajectory and body yaw, clearly revealing the slip angle
  const blendedYaw = computeChaseTargetYaw(0.3, points, 0, 0.5);
  expect(blendedYaw).toBeLessThan(0.3);
  expect(blendedYaw).toBeGreaterThan(0.25);
});

it('maintains steady elevation and smooth rotational lag without wild swings or choppiness', () => {
  const tracker = createChaseCameraTracker();
  const camera = new PerspectiveCamera(48), focus = new Vector3();
  const points: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, timeSec: 0, rotY: 0, speedKmh: 100 },
    { x: -0.5, y: 0, z: -2, timeSec: 0.02, rotY: 0.4, speedKmh: 100 },
    { x: -1.0, y: 0, z: -4, timeSec: 0.04, rotY: 0.5, speedKmh: 100 },
  ];
  const initialTarget = new Vector3(0, 0, 0);
  tracker.reset(initialTarget, 0);
  camera.position.set(0, 6, -17);
  focus.copy(initialTarget);

  // Step into a turn with elevation change
  const nextTarget = new Vector3(-0.5, 2.5, 2);
  tracker.track(camera, focus, nextTarget, 0.4, points, 0, 0.5, true);

  // Keep the focus on the car while the eye absorbs at most 35 cm of vertical movement.
  expect(focus.y).toBeCloseTo(2.5);
  expect(camera.position.y).toBeGreaterThanOrEqual(8.15);
  expect(camera.position.y).toBeLessThan(8.5);

  // Rotational lag: car rotates first, camera smoothly follows behind
  const lateralDeviation = Math.abs(camera.position.x - nextTarget.x);
  expect(lateralDeviation).toBeGreaterThan(0.1);
  expect(lateralDeviation).toBeLessThan(3.0);
});

it('snaps cleanly across discontinuous timeline seeks without trailing lag', () => {
  const tracker = createChaseCameraTracker();
  const camera = new PerspectiveCamera(48), focus = new Vector3();
  const points: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, timeSec: 0, rotY: 0, speedKmh: 100 },
    { x: 0, y: 0, z: -1, timeSec: 0.02, rotY: 0, speedKmh: 100 },
  ];
  const origin = new Vector3(0, 0, 0);
  tracker.reset(origin, 0);
  camera.position.set(0, 6, -17);
  focus.copy(origin);

  // Teleport across track to x = 500, z = 300 with continuous = false
  const jumpTarget = new Vector3(500, 10, 300);
  tracker.track(camera, focus, jumpTarget, 0, points, 0, 0, false);

  expect(focus.x).toBeCloseTo(500);
  expect(focus.y).toBeCloseTo(10);
  expect(focus.z).toBeCloseTo(300);
  expect(camera.position.x).toBeCloseTo(500);
  expect(camera.position.y).toBeCloseTo(16);
  expect(camera.position.z).toBeCloseTo(283);
});

it('follows the same motion at 30, 60 and 144 Hz and ignores duplicate paused updates', () => {
  const points: ReplayTrajectoryPoint[] = Array.from({length: 101}, (_, i) => ({
    x: i * 0.005, y: i * 0.001, z: -i * 0.02, timeSec: i / 100, speedKmh: 0,
  }));
  const run = (fps: number) => {
    const tracker = createChaseCameraTracker(), camera = new PerspectiveCamera(48), focus = new Vector3();
    camera.position.set(0, 6, -17); tracker.reset(focus, 0, 0);
    for (let frame = 1; frame <= fps; frame++) {
      const t = frame / fps, index = Math.min(99, Math.floor(t * 100));
      const target = new Vector3(t * 0.5, t * 0.1, t * 2);
      tracker.track(camera, focus, target, t * 0.4, points, index, t * 100 - index, true);
      const eye = camera.position.clone(), look = focus.clone();
      tracker.track(camera, focus, target, t * 0.4, points, index, t * 100 - index, true);
      expect(camera.position.distanceTo(eye)).toBe(0);
      expect(focus.distanceTo(look)).toBe(0);
    }
    expect(focus.toArray()).toEqual([0.5, 0.1, 2]);
    return camera.position;
  };
  const at30 = run(30);
  expect(at30.distanceTo(run(60))).toBeLessThan(1e-8);
  expect(at30.distanceTo(run(144))).toBeLessThan(1e-8);
});

it('bounds the actual angular lag and clears positional inertia on a backward seek', () => {
  const tracker = createChaseCameraTracker(), camera = new PerspectiveCamera(48), focus = new Vector3();
  const points: ReplayTrajectoryPoint[] = [
    {x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 0},
    {x: 0, y: 0, z: -2, timeSec: 0.1, speedKmh: 0},
  ];
  camera.position.set(0, 6, -17); tracker.reset(focus, 0, 0);
  const target = new Vector3(0, 0, 2);
  tracker.track(camera, focus, target, 3, points, 0, 1, true);
  // Only lateral inertia is applied; the camera boom keeps its following distance.
  const lagZ = -(1 - Math.exp(-1.2)) * 2 / 1.2;
  const chaseYaw = 3 - 0.18;
  const lateralLag = lagZ * Math.sin(chaseYaw);
  const heading = Math.atan2(camera.position.x - lateralLag * Math.cos(chaseYaw),
    -(camera.position.z - target.z - lateralLag * Math.sin(chaseYaw)));
  expect(Math.abs(3 - heading)).toBeLessThanOrEqual(0.18000001);
  tracker.track(camera, focus, new Vector3(), 0, points, 0, 0, true);
  expect(camera.position.distanceTo(new Vector3(0, 6, -17))).toBeLessThan(1e-8);
  expect(focus.length()).toBe(0);
});

it('does not derive chase heading from the position before a teleport', () => {
  const points: ReplayTrajectoryPoint[] = [
    {x: 1000, y: 0, z: 0, timeSec: 0, speedKmh: 100},
    {x: 0, y: 0, z: 0, timeSec: 0.1, speedKmh: 100, isTeleport: true},
    {x: 0, y: 0, z: -2, timeSec: 0.2, speedKmh: 100},
    {x: 0, y: 0, z: -4, timeSec: 0.3, speedKmh: 100},
  ];
  expect(computeChaseTargetYaw(0, points, 1, 0.5)).toBeCloseTo(0);
});

it.each([30, 60, 144])('keeps the chosen following distance on play and resume at %i Hz', fps => {
  const tracker = createChaseCameraTracker(), camera = new PerspectiveCamera(48), focus = new Vector3();
  const points: ReplayTrajectoryPoint[] = Array.from({length: 101}, (_, i) => ({
    x: 0, y: 0, z: -i * 0.6, timeSec: i / 100, speedKmh: 216, rotY: 0,
  }));
  camera.position.set(0, 6, -10); tracker.reset(focus, 0, 0);
  for (let frame = 1; frame <= fps; frame++) {
    const time = frame / fps, index = Math.min(99, Math.floor(time * 100));
    const target = new Vector3(0, 0, time * 60), fraction = time * 100 - index;
    tracker.track(camera, focus, target, 0, points, index, fraction, true);
    expect(camera.position.z - target.z).toBeCloseTo(-10, 8);
    expect(camera.position.y).toBeCloseTo(6, 8);
    const pausedEye = camera.position.clone();
    tracker.track(camera, focus, target, 0, points, index, fraction, true);
    expect(camera.position.distanceTo(pausedEye)).toBe(0);
  }
});

it('places cockpit camera at driver position looking forward down the track for an unrotated car', () => {
  const car = new Vector3(100, 10, 200);
  const pose = computeCockpitPose(car);
  // Driver sits on the left (+0.28m X), eye level at +1.00m Y, cockpit front (+0.70m scene Z from native -0.70m forward)
  expect(pose.eye.x - car.x).toBeCloseTo(0.28, 4);
  expect(pose.eye.y - car.y).toBeCloseTo(1.00, 4);
  expect(pose.eye.z - car.z).toBeCloseTo(0.70, 4);

  // Focus point 40m down the track in scene forward (+Z) direction, angled slightly down
  expect(pose.target.x - car.x).toBeCloseTo(0.28, 4);
  expect(pose.target.y - car.y).toBeCloseTo(0.90, 4);
  expect(pose.target.z - car.z).toBeCloseTo(40.70, 4);

  // Up vector matches world Y for level vehicle
  expect(pose.up.x).toBeCloseTo(0, 4);
  expect(pose.up.y).toBeCloseTo(1, 4);
  expect(pose.up.z).toBeCloseTo(0, 4);
});

it('rotates cockpit eye and look target with car yaw in turns', () => {
  const car = new Vector3(0, 0, 0);
  // 90 deg clockwise turn in native left-handed space (+pi/2 rotY turns forward -Z towards native right -X)
  const orientation = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0, 'YXZ'));
  const pose = computeCockpitPose(car, orientation);

  // Target points in scene right (-X direction), retaining the driver lateral seat offset along Z
  expect(pose.target.x).toBeLessThan(-30);
  expect(pose.target.z).toBeCloseTo(0.28, 2);
});

it('tilts cockpit view with vehicle pitch and roll from 3D orientation', () => {
  const car = new Vector3(0, 0, 0);
  // Pitch down 5 degrees (braking dips nose down, negative pitch around X) and roll 3 degrees
  const pitchRad = -0.087;
  const orientation = new Quaternion().setFromEuler(new Euler(pitchRad, 0, 0.05, 'YXZ'));
  const pose = computeCockpitPose(car, orientation);

  // Nose dips under braking: look target Y drops lower than level target
  expect(pose.target.y).toBeLessThan(0.90);
  // Roll tilts up vector laterally
  expect(pose.up.x).not.toBe(0);
});

it('applies vehicle origin offsets from calibrated model packages and falls back to yaw', () => {
  const car = new Vector3(50, 5, -100);
  const poseWithOffset = computeCockpitPose(car, undefined, 0, new Vector3(0.1, -0.25, 0.5));
  expect(poseWithOffset.eye.x - car.x).toBeCloseTo(0.38, 4);
  expect(poseWithOffset.eye.y - car.y).toBeCloseTo(0.75, 4);
  expect(poseWithOffset.eye.z - car.z).toBeCloseTo(0.20, 4); // native -0.20m forward mirrors to scene +0.20m

  // Fallback to scalar bodyYaw when orientation quaternion is absent
  const poseYaw = computeCockpitPose(car, undefined, Math.PI);
  // 180 degree turn: looking in scene -Z direction
  expect(poseYaw.target.z).toBeLessThan(car.z);
});

it('rotates the fitted model height with the body and reflects the cockpit direction exactly once', () => {
  const car = new Vector3(50, 5, -100), offset = new Vector3(0.1, -0.25, 0.5);
  const orientation = new Quaternion().setFromEuler(new Euler(-0.08, 2.85, 0.04, 'YXZ'));
  const pose = computeCockpitPose(car, orientation, undefined, offset);
  const nativeEye = new Vector3(0.38, 0.75, -0.2).applyQuaternion(orientation);
  expect(pose.eye.distanceTo(car.clone().add(new Vector3(nativeEye.x, nativeEye.y, -nativeEye.z)))).toBeLessThan(1e-10);
  const direction = new Vector3(0, -0.10, -40).applyQuaternion(orientation);
  direction.z *= -1; direction.normalize();
  expect(pose.target.clone().sub(pose.eye).normalize().distanceTo(direction)).toBeLessThan(1e-10);
});
