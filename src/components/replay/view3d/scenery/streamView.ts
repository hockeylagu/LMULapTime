import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { CameraMode } from '../cameraModes.js';
import type { StreamView } from './residency.js';

/** Re-plan residency only after the view moved this far: chunks are hundreds of metres long. */
export const LAP_REPLAN_M = 25;
export const FREE_REPLAN_M = 50;

/** Orbit and overhead cameras are panned away from the car; every other mode stays beside it. */
export const isFreeCameraMode = (mode: CameraMode): boolean => mode === 'orbit' || mode === 'top';

/** Canonical track station of the replay position (interpolated between samples, never across the start/finish wrap). */
export function stationAt(points: ReplayTrajectoryPoint[], index: number, fraction: number, routeLengthM: number): number | undefined {
  const a = points[index]?.stationM, b = points[index + 1]?.stationM;
  if (a === undefined || !Number.isFinite(a)) return undefined;
  if (b === undefined || !Number.isFinite(b) || Math.abs(b - a) > routeLengthM / 2) return a;
  return a + (b - a) * Math.max(0, Math.min(1, fraction));
}

export function viewMoved(previous: StreamView | null, next: StreamView, routeLengthM: number): boolean {
  if (!previous || previous.kind !== next.kind) return true;
  if (previous.kind === 'lap' && next.kind === 'lap') {
    const delta = Math.abs(previous.lapDistanceM - next.lapDistanceM) % routeLengthM;
    return Math.min(delta, routeLengthM - delta) >= LAP_REPLAN_M;
  }
  return next.kind === 'free' && previous.kind === 'free' && Math.hypot(previous.x - next.x, previous.z - next.z) >= FREE_REPLAN_M;
}
