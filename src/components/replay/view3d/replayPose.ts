import { Euler, Quaternion } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { findIndexAtDistance } from '../../../utils/lapAlignment.js';

export interface RenderPose { x: number; y: number; z: number; yaw?: number; orientation?: Quaternion; index: number; fraction: number }

export function isContinuousPose(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint | undefined): b is ReplayTrajectoryPoint {
  if (!b || b.isTeleport || a.timeSec === undefined || b.timeSec === undefined) return false;
  const dt = b.timeSec - a.timeSec;
  return dt > 0 && dt <= 1 && [a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)
    && Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) <= 20;
}

function bodyOrientation(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint | undefined, t: number): Quaternion | undefined {
  if (!Number.isFinite(a.rotY)) return undefined;
  const pitch = Number.isFinite(a.rotX) ? a.rotX! : 0, roll = Number.isFinite(a.rotZ) ? a.rotZ! : 0;
  // Native -Z forward: yaw about world Y, then pitch and roll about the body axes.
  // The enclosing world group reflects Z once; do not reflect these angles a second time.
  const orientation = new Quaternion().setFromEuler(new Euler(pitch, a.rotY, roll, 'YXZ'));
  if (b && t > 0) {
    const nextPitch = Number.isFinite(a.rotX) && Number.isFinite(b.rotX) ? b.rotX! : pitch;
    const nextRoll = Number.isFinite(a.rotZ) && Number.isFinite(b.rotZ) ? b.rotZ! : roll;
    const nextYaw = Number.isFinite(b.rotY) ? b.rotY! : a.rotY!;
    orientation.slerp(new Quaternion().setFromEuler(new Euler(nextPitch, nextYaw, nextRoll, 'YXZ')), t);
  }
  return orientation;
}

/** Visual pose only. Native body Y is preserved; road height is not a body-origin correction. */
export function sampleRenderPose(points: ReplayTrajectoryPoint[], index: number, fraction: number): RenderPose | null {
  const sampleIndex = Math.max(0, Math.min(points.length - 1, index));
  const a = points[sampleIndex];
  if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) return null;
  const b = points[sampleIndex + 1];
  const continuous = isContinuousPose(a, b);
  const t = continuous && Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  let yaw = Number.isFinite(a.rotY) ? a.rotY : undefined;
  if (yaw !== undefined && continuous && Number.isFinite(b.rotY)) yaw += Math.atan2(Math.sin(b.rotY! - yaw), Math.cos(b.rotY! - yaw)) * t;
  const orientation = bodyOrientation(a, continuous ? b : undefined, t);
  if (!continuous || t === 0) return {x: a.x, y: a.y, z: a.z, yaw, orientation, index: sampleIndex, fraction: t};
  return { x: a.x + ((b?.x ?? a.x) - a.x) * t, y: a.y + ((b?.y ?? a.y) - a.y) * t, z: a.z + ((b?.z ?? a.z) - a.z) * t, yaw, orientation, index: sampleIndex, fraction: t };
}

export function sampleStationPose(points: ReplayTrajectoryPoint[], distances: number[], station: number): RenderPose | null {
  if (!distances.length || station < distances[0] || station > distances[distances.length - 1]) return null;
  let index = findIndexAtDistance(distances, station);
  if (index > 0 && distances[index] > station) index--;
  const span = (distances[index + 1] ?? distances[index]) - distances[index];
  return sampleRenderPose(points, index, span > 0 ? (station - distances[index]) / span : 0);
}
