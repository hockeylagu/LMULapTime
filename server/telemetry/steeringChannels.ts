import type { SetupSteeringCalibration } from '../../shared/types/dataPlugin.js';
import type { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { DEFAULT_VEHICLE_HANDLING } from '../../shared/domain/vehicles/handling.js';
import { computeSteeringForce } from '../../shared/domain/vehicles/steeringForce.js';

/**
 * The steering column channels of a LMU DuckDB recording and the run's steering lock (docs/TELEMETRY_FORMAT.md).
 * Both channels read right-positive like the game's steering; the lap points store them ISO 8855 (positive turns
 * the wheel left), as `steerYaw`.
 */
export const STEERING_TORQUE_TABLE = 'Steering Shaft Torque';
export const FFB_OUTPUT_TABLE = 'FFB Output';

/** `Steering Shaft Torque` (Nm, car-side column torque) as stored on a lap point: ISO sign, 0.1 Nm. */
export function steerTorqueNmOf(raw: number | undefined): number | undefined {
  return raw === undefined || !Number.isFinite(raw) ? undefined : Number((-raw).toFixed(1)) || 0;
}

/** `FFB Output` (% of the wheel base's peak, ±100) as stored on a lap point: ISO sign, 0.1 %. */
export function ffbPctOf(raw: number | undefined): number | undefined {
  return raw === undefined || !Number.isFinite(raw) ? undefined : Number((-raw).toFixed(1)) || 0;
}

/**
 * The run's steering lock from the recording's `CarSetup` metadata (a JSON object of setup entries). Its
 * `VM_STEER_LOCK` entry gives the steering wheel's rotation and, in brackets, the road wheels' lock, written in
 * several ways by the game: `524deg (18.5deg)`, `440 (17) deg`, `516 deg(19.7 )`. The two values form one
 * calibration (range and ratio, `shared/domain/vehicles/handling.ts`): ratio = half the range over the lock.
 * Absent when the setup or either value is missing or not positive.
 */
export function parseSetupSteering(carSetup: string | undefined): SetupSteeringCalibration | undefined {
  if (!carSetup) return undefined;
  let entry: unknown;
  try {
    entry = (JSON.parse(carSetup) as Record<string, unknown>).VM_STEER_LOCK;
  } catch {
    return undefined;
  }
  const text = typeof entry === 'object' && entry !== null ? (entry as { stringValue?: unknown }).stringValue : undefined;
  if (typeof text !== 'string') return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:deg)?\s*\(\s*(\d+(?:\.\d+)?)\s*(?:deg)?\s*\)/i.exec(text);
  if (!match) return undefined;
  const rangeDeg = Number(match[1]), lockDeg = Number(match[2]);
  if (!(rangeDeg > 0) || !(lockDeg > 0)) return undefined;
  return { steeringWheelRangeDeg: rangeDeg, steeringRatio: Number((rangeDeg / 2 / lockDeg).toFixed(3)) };
}

/**
 * Adds the driver's steering force and its two markers to a full-rate lap's points, in place. Runs before the lap
 * is spaced for serving, so the mean and the markers see every sample. Without the run's lock the wheel's range is
 * the historical default: the server reader does not know the car's plugin calibration (every recording checked
 * 2026-11-26 carries `VM_STEER_LOCK`).
 */
export function addSteeringForce(points: ReplayTrajectoryPoint[], setup: SetupSteeringCalibration | undefined): void {
  if (!points.some(point => point.ffbPct !== undefined)) return;
  const force = computeSteeringForce({
    timeSec: points.map(point => point.timeSec ?? 0),
    steer: points.map(point => point.steerYaw ?? 0),
    ffbPct: points.map(point => point.ffbPct),
    speedKmh: points.map(point => point.speedKmh ?? 0),
    steeringWheelRangeDeg: setup?.steeringWheelRangeDeg ?? DEFAULT_VEHICLE_HANDLING.steeringWheelRangeDeg,
  });
  points.forEach((point, i) => {
    const driverForcePct = force.driverForcePct[i];
    if (driverForcePct !== undefined) point.driverForcePct = driverForcePct;
    if (force.holdingStill[i]) point.steerHoldStill = true;
    if (force.passiveCounterSteer[i]) point.passiveCounterSteer = true;
  });
}
