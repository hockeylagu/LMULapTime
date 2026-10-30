import { Quaternion, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { isContinuousPose } from './replayPose.js';

const UP = new Vector3(0, 1, 0);

/** Move the user's camera/focus offsets with the car; native chase yaw becomes negative scene yaw. */
export function trackCamera(
  camera: PerspectiveCamera | OrthographicCamera, focus: Vector3,
  previousCar: Vector3, nextCar: Vector3, nativeYawDelta = 0,
): void {
  camera.position.sub(previousCar).applyAxisAngle(UP, -nativeYawDelta).add(nextCar);
  focus.sub(previousCar).applyAxisAngle(UP, -nativeYawDelta).add(nextCar);
}

/** Maximum slip angle influence (in radians, ~14.3 degrees) to show slides and countersteer cleanly. */
const MAX_SLIP_RAD = 0.25;
/** Bias toward travel direction so chassis slip stays visible through corners. */
const VELOCITY_WEIGHT = 0.75;

/** Computes the central-difference trajectory heading at a sample node in native LMU coordinates. */
function sampleNodeHeading(points: ReplayTrajectoryPoint[], i: number): number | undefined {
  const n = points.length;
  if (n < 2) return undefined;
  const node = points[i];
  if (!node) return undefined;
  const prev = i > 0 && isContinuousPose(points[i - 1], node) ? points[i - 1] : node;
  const next = isContinuousPose(node, points[i + 1]) ? points[i + 1] : node;
  if (!prev || !next) return undefined;
  const dx = next.x - prev.x, dz = next.z - prev.z;
  if (Math.hypot(dx, dz) < 0.05) return undefined;
  // Native forward is -Z, left is +X, right is -X. Clockwise yaw is atan2(-dx, -dz).
  return Math.atan2(-dx, -dz);
}

/**
 * Target chase heading: blends the car's body yaw with its trajectory velocity vector.
 * Smoothly interpolates velocity heading across sample intervals using `fraction` so cornering
 * headings stay continuous at sample boundaries, without looking across recording gaps.
 */
export function computeChaseTargetYaw(
  bodyYaw: number,
  points: ReplayTrajectoryPoint[],
  index: number,
  fraction = 0,
): number {
  const safeBodyYaw = Number.isFinite(bodyYaw) ? bodyYaw : 0;
  const a = points[index], b = points[index + 1];
  if (!a || (b && !isContinuousPose(a, b))) return safeBodyYaw;

  const h0 = sampleNodeHeading(points, index);
  const h1 = sampleNodeHeading(points, index + 1);
  if (h0 === undefined && h1 === undefined) return safeBodyYaw;

  const t = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const baseH0 = h0 ?? h1 ?? safeBodyYaw;
  const baseH1 = h1 ?? h0 ?? safeBodyYaw;
  const dH = Math.atan2(Math.sin(baseH1 - baseH0), Math.cos(baseH1 - baseH0));
  const velYaw = baseH0 + dH * t;

  const dt = a.timeSec !== undefined && b?.timeSec !== undefined ? b.timeSec - a.timeSec : 0;
  const dist = b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
  const speedKmh = a.speedKmh !== undefined ? a.speedKmh + ((b?.speedKmh ?? a.speedKmh) - a.speedKmh) * t : (dt > 0 ? (dist / dt) * 3.6 : 0);
  const speedBlend = Math.min(1, Math.max(0, (speedKmh - 12) / 20));
  if (speedBlend <= 0) return safeBodyYaw;

  const slip = Math.atan2(Math.sin(velYaw - safeBodyYaw), Math.cos(velYaw - safeBodyYaw));
  const boundedSlip = Math.max(-MAX_SLIP_RAD, Math.min(MAX_SLIP_RAD, slip));
  return safeBodyYaw + boundedSlip * VELOCITY_WEIGHT * speedBlend;
}

export interface ChaseCameraTracker {
  track(
    camera: PerspectiveCamera | OrthographicCamera,
    focus: Vector3,
    target: Vector3,
    bodyYaw: number,
    points: ReplayTrajectoryPoint[],
    index: number,
    fraction: number,
    continuous: boolean,
  ): void;
  reset(target: Vector3, bodyYaw: number, timeSec?: number): void;
}

/** Rates in replay seconds, independent of render frequency and duplicate React notifications. */
const YAW_LAG_RATE = 8;
const POSITION_LAG_RATE = 12;
/** Maximum angular lag (~10.3 degrees) prevents excessive swing in sudden chicanes. */
const MAX_LAG_RAD = 0.18;

export function createChaseCameraTracker(): ChaseCameraTracker {
  let chaseYaw = 0;
  let previousYaw = 0, previousTime: number | undefined;
  const previousTarget = new Vector3();
  const lag = new Vector3(), previousAnchor = new Vector3(), anchor = new Vector3(), movement = new Vector3();
  let initialized = false;

  return {
    reset(target: Vector3, bodyYaw: number, timeSec?: number) {
      chaseYaw = Number.isFinite(bodyYaw) ? bodyYaw : 0;
      previousYaw = chaseYaw; previousTime = timeSec;
      previousTarget.copy(target);
      previousAnchor.copy(target); lag.set(0, 0, 0);
      initialized = true;
    },
    track(camera, focus, target, bodyYaw, points, index, fraction, continuous) {
      const safeYaw = Number.isFinite(bodyYaw) ? bodyYaw : 0;
      const targetYaw = computeChaseTargetYaw(safeYaw, points, index, fraction);
      const a = points[index], b = points[index + 1];
      const t = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
      const timeSec = (a?.timeSec ?? index / 40) + (a && isContinuousPose(a, b) ? (b.timeSec! - a.timeSec!) * t : 0);
      const dt = previousTime === undefined ? 1 / 60 : timeSec - previousTime;
      if (!initialized || !continuous || dt < 0 || dt > 0.25) {
        const jumpDeltaYaw = initialized ? targetYaw - chaseYaw : 0;
        camera.position.sub(previousAnchor).applyAxisAngle(UP, -jumpDeltaYaw).add(target);
        focus.sub(previousTarget).applyAxisAngle(UP, -jumpDeltaYaw).add(target);
        chaseYaw = targetYaw;
        previousYaw = targetYaw; previousTime = timeSec;
        previousTarget.copy(target);
        previousAnchor.copy(target); lag.set(0, 0, 0);
        initialized = true;
        return;
      }

      if (dt === 0) return;
      // Integrate a moving input analytically: the same turn at 30/60/144 Hz has the same lag.
      const turn = Math.atan2(Math.sin(targetYaw - previousYaw), Math.cos(targetYaw - previousYaw));
      const yawError = Math.atan2(Math.sin(chaseYaw - previousYaw), Math.cos(chaseYaw - previousYaw));
      const decay = Math.exp(-YAW_LAG_RATE * dt), angularVelocity = turn / dt;
      const residual = (yawError + angularVelocity / YAW_LAG_RATE) * decay - angularVelocity / YAW_LAG_RATE;
      const nextYaw = previousYaw + turn + Math.max(-MAX_LAG_RAD, Math.min(MAX_LAG_RAD, residual));
      const yawDelta = nextYaw - chaseYaw;
      chaseYaw = nextYaw;
      const positionDecay = Math.exp(-POSITION_LAG_RATE * dt);
      movement.subVectors(target, previousTarget);
      lag.multiplyScalar(positionDecay).addScaledVector(movement, -(1 - positionDecay) / (POSITION_LAG_RATE * dt));
      // Retain lateral/heave inertia, but never change the following distance on play/resume.
      lag.y = Math.max(-0.35, Math.min(0.35, lag.y)); lag.clampLength(0, 2);
      const lateralX = Math.cos(chaseYaw), lateralZ = Math.sin(chaseYaw);
      const lateralLag = lag.x * lateralX + lag.z * lateralZ;
      anchor.copy(target).addScaledVector(movement.set(lateralX, 0, lateralZ), lateralLag);
      anchor.y += lag.y;
      camera.position.sub(previousAnchor).applyAxisAngle(UP, -yawDelta).add(anchor);
      focus.sub(previousTarget).applyAxisAngle(UP, -yawDelta).add(target);
      previousTarget.copy(target);
      previousAnchor.copy(anchor); previousYaw = targetYaw; previousTime = timeSec;
    },
  };
}

export interface CockpitPose {
  eye: Vector3;
  target: Vector3;
  up: Vector3;
}

/**
 * Driver eye position and look-ahead focus target in scene coordinates.
 * Local offsets use native vehicle space (metres: +X left, +Y up, -Z forward),
 * with the driver seated on the left and looking forward down the track.
 * Include the displayed envelope's ground-fit height so the eye stays inside the car.
 */
export function computeCockpitPose(
  carPosition: Vector3,
  orientation?: Quaternion,
  bodyYaw?: number,
  modelOffset: Readonly<{x: number; y: number; z: number}> = {x: 0, y: 0, z: 0},
): CockpitPose {
  const localEye = new Vector3(modelOffset.x + 0.28, modelOffset.y + 0.78, modelOffset.z - 0.20);
  const localTarget = new Vector3(modelOffset.x + 0.28, modelOffset.y + 0.70, modelOffset.z - 40.20);
  const localUp = new Vector3(0, 1, 0);

  if (orientation) {
    localEye.applyQuaternion(orientation);
    localTarget.applyQuaternion(orientation);
    localUp.applyQuaternion(orientation);
  } else {
    const yaw = Number.isFinite(bodyYaw) ? bodyYaw! : 0;
    localEye.applyAxisAngle(UP, yaw);
    localTarget.applyAxisAngle(UP, yaw);
    localUp.applyAxisAngle(UP, yaw);
  }

  // Convert native rotated offsets to scene coordinates by mirroring Z
  const eye = new Vector3(carPosition.x + localEye.x, carPosition.y + localEye.y, carPosition.z - localEye.z);
  const target = new Vector3(carPosition.x + localTarget.x, carPosition.y + localTarget.y, carPosition.z - localTarget.z);
  const up = new Vector3(localUp.x, localUp.y, -localUp.z);

  return { eye, target, up };
}
