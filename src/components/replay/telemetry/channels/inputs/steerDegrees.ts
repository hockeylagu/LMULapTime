import type { ReplayTrajectoryPoint } from '../../../../../../shared/types/index.js';
import { DEFAULT_VEHICLE_HANDLING } from '../../../../../../shared/domain/vehicles/handling.js';
import { getSteerPercent } from '../../../../../../shared/domain/vehicles/steering.js';
import type { PointComparison } from '../../../../../utils/replayComparison.js';

/** The steering chart's scale: a fitted or fixed percent range, or the fitted range in steering-wheel degrees. */
export type SteerScaleMode = 'fit' | '25' | '50' | '100' | 'deg';

/** Each lap's steering wheel rotation lock to lock (its handling calibration); lap and baseline can differ. */
export interface SteeringWheelRanges {
  lap?: number;
  baseline?: number;
}

const halfRange = (rangeDeg: number | undefined) => (rangeDeg ?? DEFAULT_VEHICLE_HANDLING.steeringWheelRangeDeg) / 2;

/** A chart steering value (±270 chart degrees, `getSteerPercent`) as steering-wheel degrees for a wheel range. */
export function steeringWheelDeg(steerYaw: number | undefined, rangeDeg: number | undefined): number {
  return (getSteerPercent(steerYaw) / 100) * halfRange(rangeDeg);
}

/** The degree scale that fits both laps: their largest wheel angle plus a tenth, in 10° steps, at least 30°. */
export function fittedSteerDegrees(
  points: ReplayTrajectoryPoint[] | undefined, comparisons: PointComparison[] | undefined, ranges: SteeringWheelRanges,
): number {
  let peak = 0;
  for (const point of points ?? []) peak = Math.max(peak, Math.abs(steeringWheelDeg(point.steerYaw, ranges.lap)));
  for (const comparison of comparisons ?? []) peak = Math.max(peak, Math.abs(steeringWheelDeg(comparison.baseline.steerYaw, ranges.baseline)));
  return Math.max(30, Math.ceil((peak * 1.1) / 10) * 10);
}

/**
 * The vertical scale of one lap's trace, drawn at ±100 %: by the percent range, or in degrees by that lap's own half
 * range against the degree scale, so two laps with different wheel ranges share one degree axis.
 */
export function steerTraceScale(mode: SteerScaleMode, percentRange: number, degreeRange: number, rangeDeg: number | undefined): number {
  return mode === 'deg' ? halfRange(rangeDeg) / degreeRange : 100 / percentRange;
}

/** The cursor readout for one lap in the chart's unit. */
export function formatSteer(mode: SteerScaleMode, steerYaw: number | undefined, rangeDeg: number | undefined): string {
  const value = mode === 'deg' ? steeringWheelDeg(steerYaw, rangeDeg) : getSteerPercent(steerYaw);
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}${mode === 'deg' ? '°' : '%'}`;
}
