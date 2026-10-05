import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';

export interface TrajectorySample {
  speedKmh?: number;
  timeSec?: number;
  rotY?: number;
  x: number;
  z: number;
  accelLatG?: number;
  accelLonG?: number;
}

export interface ResolvedAcceleration {
  latG: number;
  lonG: number;
}

/**
 * Resolves the vehicle's dynamic acceleration vector (latG, lonG) at the current
 * playback or scrub position.
 * If telemetry channels are missing (pure VCR replay or unprocessed samples), derives
 * lateral and longitudinal acceleration using kinematic finite differences.
 * Interpolates smoothly between samples when scrubbing or playing at fractional frames.
 */
export function resolveCarAcceleration(
  points: TrajectorySample[],
  index: number,
  fraction = 0
): ResolvedAcceleration | undefined {
  if (!points || points.length === 0) return undefined;

  const i0 = Math.max(0, Math.min(Math.floor(index), points.length - 1));
  const i1 = Math.min(i0 + 1, points.length - 1);
  const p0 = points[i0];
  const p1 = points[i1];

  const getPointAccel = (pt: TrajectorySample, idx: number): ResolvedAcceleration => {
    let latG = pt.accelLatG;
    let lonG = pt.accelLonG;

    if (latG === undefined || lonG === undefined) {
      const prev = points[Math.max(0, idx - 1)];
      const next = points[Math.min(points.length - 1, idx + 1)];
      const dt = ((next.timeSec ?? 0) - (prev.timeSec ?? 0)) || 0.05;
      const effectiveDt = dt > 0.005 ? dt : 0.05;

      if (lonG === undefined) {
        const vPrev = (prev.speedKmh ?? 0) / 3.6;
        const vNext = (next.speedKmh ?? 0) / 3.6;
        lonG = (vNext - vPrev) / (effectiveDt * 9.80665);
      }

      if (latG === undefined) {
        const v = (pt.speedKmh ?? 0) / 3.6;
        let dYaw = 0;
        if (Number.isFinite(next.rotY) && Number.isFinite(prev.rotY)) {
          dYaw = Math.atan2(Math.sin(next.rotY! - prev.rotY!), Math.cos(next.rotY! - prev.rotY!));
        } else {
          // Evaluate tangents at the same samples as dt. Adjacent segment headings are only
          // one sample apart and would halve the central turn rate; endpoint zero vectors
          // would invent a turn even on a straight.
          const pathHeading = (at: number): number | undefined => {
            const a = points[Math.max(0, at - 1)];
            const b = points[Math.min(points.length - 1, at + 1)];
            return Math.hypot(b.x - a.x, b.z - a.z) > 0.05
              ? Math.atan2(b.x - a.x, b.z - a.z) : undefined;
          };
          const hNext = pathHeading(Math.min(points.length - 1, idx + 1));
          const hPrev = pathHeading(Math.max(0, idx - 1));
          if (hNext !== undefined && hPrev !== undefined) {
            dYaw = Math.atan2(Math.sin(hNext - hPrev), Math.cos(hNext - hPrev));
          }
        }
        // LMU headings grow clockwise: the ISO 8855 yaw rate is -dYaw/dt, and a_y = v * r.
        const yawRateIso = -dYaw / effectiveDt;
        latG = (v * yawRateIso) / 9.80665;
      }
    }

    return {
      latG: Number(Math.max(-4.5, Math.min(4.5, latG || 0)).toFixed(2)),
      lonG: Number(Math.max(-4.5, Math.min(4.5, lonG || 0)).toFixed(2)),
    };
  };

  const a0 = getPointAccel(p0, i0);
  if (i0 === i1 || fraction <= 0) return a0;
  if (fraction >= 1) return getPointAccel(p1, i1);

  const a1 = getPointAccel(p1, i1);
  return {
    latG: Number((a0.latG + fraction * (a1.latG - a0.latG)).toFixed(2)),
    lonG: Number((a0.lonG + fraction * (a1.lonG - a0.lonG)).toFixed(2)),
  };
}

/**
 * Interpolates the primary car's spatial position and telemetry values at the current
 * playback fraction so HUD metrics and line separation match the continuous visual car.
 */
export function interpolatePrimaryPoint<T extends ReplayTelemetryPoint>(
  points: T[],
  index: number,
  fraction = 0
): T | undefined {
  if (!points || points.length === 0) return undefined;
  const i0 = Math.max(0, Math.min(Math.floor(index), points.length - 1));
  const p0 = points[i0];
  if (fraction <= 0 || i0 >= points.length - 1) return p0;
  const p1 = points[i0 + 1];
  const f = Math.max(0, Math.min(1, fraction));

  return {
    ...p0,
    x: Number((p0.x + (p1.x - p0.x) * f).toFixed(4)),
    y: p0.y !== undefined && p1.y !== undefined ? Number((p0.y + (p1.y - p0.y) * f).toFixed(4)) : p0.y,
    z: Number((p0.z + (p1.z - p0.z) * f).toFixed(4)),
    speedKmh: p0.speedKmh !== undefined && p1.speedKmh !== undefined
      ? Math.round(p0.speedKmh + (p1.speedKmh - p0.speedKmh) * f)
      : p0.speedKmh,
    throttle: p0.throttle !== undefined && p1.throttle !== undefined
      ? Math.round(p0.throttle + (p1.throttle - p0.throttle) * f)
      : p0.throttle,
    brake: p0.brake !== undefined && p1.brake !== undefined
      ? Math.round(p0.brake + (p1.brake - p0.brake) * f)
      : p0.brake,
  };
}

/**
 * Computes lateral separation distance between primary and baseline racing lines in meters.
 * Both points must be evaluated at the same station progression.
 */
export function computeLineSeparation(
  primaryPoint?: { x?: number; z?: number } | null,
  baselinePoint?: { x?: number; z?: number } | null
): number | null {
  if (
    primaryPoint?.x === undefined ||
    primaryPoint?.z === undefined ||
    baselinePoint?.x === undefined ||
    baselinePoint?.z === undefined
  ) {
    return null;
  }
  const dist = Math.hypot(primaryPoint.x - baselinePoint.x, primaryPoint.z - baselinePoint.z);
  return Number.isFinite(dist) ? Number(dist.toFixed(2)) : null;
}

/**
 * Linearly interpolates delta time (seconds) between consecutive comparison samples
 * so the gap display ticks smoothly without jumping.
 */
export function interpolateDeltaTime(
  comparisons: Array<{ deltaTimeSec: number }> | null | undefined,
  index: number,
  fraction = 0
): number | null {
  if (!comparisons || comparisons.length === 0) return null;
  const i0 = Math.max(0, Math.min(Math.floor(index), comparisons.length - 1));
  const d0 = comparisons[i0]?.deltaTimeSec;
  if (d0 === undefined) return null;
  if (fraction <= 0 || i0 >= comparisons.length - 1) return d0;
  const d1 = comparisons[i0 + 1]?.deltaTimeSec;
  if (d1 === undefined) return d0;
  const f = Math.max(0, Math.min(1, fraction));
  return Number((d0 + (d1 - d0) * f).toFixed(3));
}
