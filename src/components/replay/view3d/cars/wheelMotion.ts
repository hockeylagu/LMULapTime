import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { isContinuousPose } from '../scene/replayPose.js';

/**
 * Tyre surface speed over road speed, `1 + slip ratio` from the live capture (SAE: -1 locked, >0 spinning).
 * Native `Wheel Speed` follows ground speed within ±4 % even under braking, so it never shows a lockup.
 */
function rollFactor(point: ReplayTrajectoryPoint, corner: number): number | undefined {
  const ratio = point.wheelSlip?.ratios[corner];
  return ratio === null || ratio === undefined || !Number.isFinite(ratio) ? undefined : Math.max(0, 1 + ratio);
}

function wheelTravel(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint, corner: number, fraction: number): number {
  // A sample without a ratio takes its neighbour's, so a lone gap never spins a locked tyre back up.
  const ka = rollFactor(a, corner) ?? rollFactor(b, corner) ?? 1, kb = rollFactor(b, corner) ?? ka;
  const dx = b.x - a.x, dz = b.z - a.z;
  const forward = Number.isFinite(a.rotY) ? -dx * Math.sin(a.rotY!) - dz * Math.cos(a.rotY!) : 1;
  // Match the interpolated body's horizontal travel, including reverse. Integrate slip over that travel.
  return Math.hypot(dx, dz) * (forward < 0 ? -1 : 1) * (ka * fraction + (kb - ka) * fraction * fraction / 2);
}

/** A corner's recorded angular speed at a sample, rad/s, positive rolling forward: the replay stores it negative rolling forward. */
function recordedSpin(point: ReplayTrajectoryPoint, corner: number): number | undefined {
  const omega = point.wheelAngularSpeeds?.[corner];
  return omega === undefined || !Number.isFinite(omega) ? undefined : -omega;
}

/**
 * Radians a wheel rolls forward from `a` over `fraction` of the way to `b`: the recorded angular speed where both samples hold
 * it (the wheel as the replay turns it: lockups, wheelspin and reverse included), else the travel over the wheel's radius.
 */
function wheelRoll(a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint, corner: number, fraction: number, radiusM: number): number {
  const start = recordedSpin(a, corner), end = recordedSpin(b, corner);
  if (start === undefined || end === undefined) return wheelTravel(a, b, corner, fraction) / radiusM;
  return (start * fraction + (end - start) * fraction * fraction / 2) * (b.timeSec! - a.timeSec!);
}

/**
 * Absolute cursor-based wheel rotation in radians, positive rolling forward, for wheels of `radiiM` (by corner): pause, seek,
 * lap loops and playback rates cannot accumulate drift.
 */
export function createWheelRoll(points: ReplayTrajectoryPoint[], radiiM: readonly number[]): (index: number, fraction: number, corner: number) => number {
  const roll = Array.from({length: 4}, () => new Float64Array(points.length));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], continuous = isContinuousPose(a, b);
    for (let corner = 0; corner < 4; corner++) roll[corner][i] = roll[corner][i - 1] + (continuous ? wheelRoll(a, b, corner, 1, radiiM[corner]) : 0);
  }
  return (index, fraction, corner) => {
    const i = Math.max(0, Math.min(points.length - 1, index)), a = points[i], b = points[i + 1];
    if (!a) return 0;
    const t = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    return roll[corner][i] + (isContinuousPose(a, b) ? wheelRoll(a, b, corner, t, radiiM[corner]) : 0);
  };
}

/** What the wheel animation reads of a lap: its samples and the car's steering calibration. */
export type WheelLap = Pick<ReplayTrajectoryData, 'points' | 'handlingCalibration'>;

/** Steering-wheel rotation in radians (ISO positive-left, counter-clockwise from the driver's seat) from the recorded steering. */
export function createSteeringWheelAngle(lap: WheelLap): (index: number, fraction: number) => number {
  const calibration = lap.handlingCalibration, points = lap.points;
  if (!calibration) return () => 0;
  // steerYaw keeps the chart's ±270° scale; see computeUnderOversteer for the same conversion.
  const scale = calibration.steeringWheelRangeDeg / 540 * Math.PI / 180;
  return (index, fraction) => {
    const a = points[index], b = points[index + 1], start = a?.steerYaw;
    if (start === undefined || !Number.isFinite(start)) return 0;
    const end = isContinuousPose(a, b) && b.steerYaw !== undefined && Number.isFinite(b.steerYaw) ? b.steerYaw : start;
    return (start + (end - start) * (Number.isFinite(fraction) ? fraction : 0)) * scale;
  };
}

/** Front road-wheel angle in radians (ISO positive-left): the steering-wheel rotation over the plugin ratio. */
export function createSteerAngle(lap: WheelLap): (index: number, fraction: number) => number {
  const wheel = createSteeringWheelAngle(lap), ratio = lap.handlingCalibration?.steeringRatio ?? 1;
  return (index, fraction) => wheel(index, fraction) / ratio;
}
