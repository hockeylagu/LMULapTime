import { Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { isContinuousPose } from '../scene/replayPose.js';

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

/**
 * Half the stretch of path the travel direction is taken over, either side of the car. A lap's points can lie from a few
 * centimetres to several metres apart; differencing neighbouring points made the heading, and the chase camera, shake through
 * corners. App assumption: 3 m is short enough to follow a hairpin and long enough to average out the uneven spacing.
 */
const HEADING_HALF_SPAN_M = 3;

/** Path distance at each point from the first, and where each point's continuous stretch starts and ends. */
interface PathIndex { distance: Float64Array; first: Int32Array; last: Int32Array }
const pathIndexes = new WeakMap<ReplayTrajectoryPoint[], PathIndex>();
function pathIndex(points: ReplayTrajectoryPoint[]): PathIndex {
  let index = pathIndexes.get(points);
  if (index) return index;
  const n = points.length, distance = new Float64Array(n), first = new Int32Array(n), last = new Int32Array(n);
  for (let i = 1; i < n; i++) {
    const joined = isContinuousPose(points[i - 1], points[i]);
    distance[i] = distance[i - 1] + (joined ? Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z) : 0);
    first[i] = joined ? first[i - 1] : i;
  }
  last[n - 1] = n - 1;
  for (let i = n - 2; i >= 0; i--) last[i] = isContinuousPose(points[i], points[i + 1]) ? last[i + 1] : i;
  index = {distance, first, last};
  pathIndexes.set(points, index);
  return index;
}

/** The point at path distance `at` within points `from`..`to` (one continuous stretch), interpolated on the segment holding it. */
function pointAt(points: ReplayTrajectoryPoint[], distance: Float64Array, from: number, to: number, at: number): {x: number; z: number} {
  let lo = from, hi = to;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (distance[mid] <= at) lo = mid; else hi = mid; }
  const a = points[lo], b = points[hi], span = distance[hi] - distance[lo];
  const t = span > 0 ? Math.max(0, Math.min(1, (at - distance[lo]) / span)) : 0;
  return {x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t};
}

/**
 * The travel direction at a pose (sample `index`, `fraction` of the way to the next) in native LMU coordinates: from the path
 * point `HEADING_HALF_SPAN_M` behind to the one as far ahead, measured along the path and kept within the pose's continuous stretch.
 */
function pathHeading(points: ReplayTrajectoryPoint[], index: number, fraction: number): number | undefined {
  if (points.length < 2) return undefined;
  const {distance, first, last} = pathIndex(points), from = first[index], to = last[index];
  if (to === from) return undefined;
  const here = distance[index] + (index < to ? (distance[index + 1] - distance[index]) * fraction : 0);
  const behind = pointAt(points, distance, from, to, Math.max(distance[from], here - HEADING_HALF_SPAN_M));
  const ahead = pointAt(points, distance, from, to, Math.min(distance[to], here + HEADING_HALF_SPAN_M));
  const dx = ahead.x - behind.x, dz = ahead.z - behind.z;
  if (Math.hypot(dx, dz) < 0.05) return undefined;
  // Native forward is -Z, left is +X, right is -X. Clockwise yaw is atan2(-dx, -dz).
  return Math.atan2(-dx, -dz);
}

/** The car's travel direction (`pathHeading`) and speed at a pose, or undefined at a recording gap. */
function travelAt(points: ReplayTrajectoryPoint[], index: number, fraction: number): {heading: number; speedKmh: number} | undefined {
  const a = points[index], b = points[index + 1];
  if (!a || (b && !isContinuousPose(a, b))) return undefined;
  const t = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const heading = pathHeading(points, index, t);
  if (heading === undefined) return undefined;
  const dt = a.timeSec !== undefined && b?.timeSec !== undefined ? b.timeSec - a.timeSec : 0;
  const dist = b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
  const speedKmh = a.speedKmh !== undefined ? a.speedKmh + ((b?.speedKmh ?? a.speedKmh) - a.speedKmh) * t : (dt > 0 ? (dist / dt) * 3.6 : 0);
  return {heading, speedKmh};
}

/**
 * Target chase heading: blends the car's body yaw with its travel direction (`pathHeading`), so a slide shows. The travel
 * direction comes from a fixed stretch of path around the car's exact place, so it moves smoothly whatever the point spacing,
 * and never looks across recording gaps.
 */
export function computeChaseTargetYaw(
  bodyYaw: number,
  points: ReplayTrajectoryPoint[],
  index: number,
  fraction = 0,
): number {
  const safeBodyYaw = Number.isFinite(bodyYaw) ? bodyYaw : 0;
  const travel = travelAt(points, index, fraction);
  if (!travel) return safeBodyYaw;
  const velYaw = travel.heading;
  const speedBlend = Math.min(1, Math.max(0, (travel.speedKmh - 12) / 20));
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
      const positionDecay = Math.exp(-POSITION_LAG_RATE * dt), gain = -(1 - positionDecay) / (POSITION_LAG_RATE * dt);
      movement.subVectors(target, previousTarget);
      // Lateral and heave inertia only: the following distance never changes on play/resume. The sideways movement is the car's
      // speed across the camera's axis along its smoothed travel direction (scene forward is (-sin, cos) of the native heading),
      // not its movement this frame: between unevenly spaced points that changes direction at every point, and the camera,
      // following it, shook from side to side through corners.
      const lateralX = Math.cos(chaseYaw), lateralZ = Math.sin(chaseYaw), travel = travelAt(points, index, fraction);
      const sideways = travel ? travel.speedKmh / 3.6 * dt * Math.sin(chaseYaw - travel.heading) : movement.x * lateralX + movement.z * lateralZ;
      lag.x = Math.max(-2, Math.min(2, lag.x * positionDecay + gain * sideways));
      lag.y = Math.max(-0.35, Math.min(0.35, lag.y * positionDecay + gain * movement.y));
      anchor.copy(target).addScaledVector(movement.set(lateralX, 0, lateralZ), lag.x);
      anchor.y += lag.y;
      camera.position.sub(previousAnchor).applyAxisAngle(UP, -yawDelta).add(anchor);
      focus.sub(previousTarget).applyAxisAngle(UP, -yawDelta).add(target);
      previousTarget.copy(target);
      previousAnchor.copy(anchor); previousYaw = targetYaw; previousTime = timeSec;
    },
  };
}
