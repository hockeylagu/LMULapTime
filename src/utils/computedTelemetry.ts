import { ReplayTrajectoryPoint } from '../../server/core/types';

const G_CONST = 9.80665;
const WHEELBASE_M = 2.7; // Standard GT3 / Prototype wheelbase (~2.7m)
const STEERING_RATIO = 11.0; // Effective ratio mapping LMU 270-deg steerYaw (540 lock-to-lock) to ~24.5 deg road wheel lock

/**
 * Normalizes an angle difference in radians to the range [-pi, pi].
 */
export function unwrapAngle(rad: number): number {
  let diff = rad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/**
 * Smooths an array of numbers using a moving-window average of given half-width.
 */
function movingAverage(arr: number[], radius = 1): number[] {
  if (arr.length <= 1 || radius <= 0) return [...arr];
  const out = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(arr.length - 1, i + radius);
    let sum = 0;
    for (let k = start; k <= end; k++) {
      sum += arr[k];
    }
    out[i] = sum / (end - start + 1);
  }
  return out;
}

/**
 * Computes longitudinal acceleration (G) from speed and time progression.
 * Positive = forward acceleration, negative = braking deceleration.
 */
export function computeLongitudinalG(points: ReplayTrajectoryPoint[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const rawG = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(n - 1, i + 1);
    const dt = (points[nextIdx].timeSec ?? 0) - (points[prevIdx].timeSec ?? 0);
    const vPrev = (points[prevIdx].speedKmh ?? 0) / 3.6;
    const vNext = (points[nextIdx].speedKmh ?? 0) / 3.6;

    if (dt > 0.005) {
      const a = (vNext - vPrev) / dt;
      rawG[i] = a / G_CONST;
    } else {
      rawG[i] = 0;
    }
  }

  // Smooth over 2-sample radius to eliminate sensor noise / frame jitter
  const smoothed = movingAverage(rawG, 2);
  return smoothed.map(g => Number(Math.max(-4.5, Math.min(2.5, g)).toFixed(2)));
}

/**
 * Computes yaw rotation rate (deg/s) from vehicle orientation yaw (rotY) or path tangent.
 */
export function computeYawRate(points: ReplayTrajectoryPoint[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const hasRotY = points.some(p => p.rotY !== undefined && p.rotY !== 0);
  const yawAngles: number[] = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    if (hasRotY && points[i].rotY !== undefined) {
      yawAngles[i] = points[i].rotY!;
    } else {
      // Fallback: derive heading angle from velocity / position trajectory
      const next = points[Math.min(n - 1, i + 1)];
      const prev = points[Math.max(0, i - 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      yawAngles[i] = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : 0;
    }
  }

  const rawRateDeg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(n - 1, i + 1);
    const dt = (points[nextIdx].timeSec ?? 0) - (points[prevIdx].timeSec ?? 0);
    if (dt > 0.005) {
      const dYawRad = unwrapAngle(yawAngles[nextIdx] - yawAngles[prevIdx]);
      rawRateDeg[i] = (dYawRad / dt) * (180 / Math.PI);
    } else {
      rawRateDeg[i] = 0;
    }
  }

  const smoothed = movingAverage(rawRateDeg, 2);
  return smoothed.map(r => Number(Math.max(-150, Math.min(150, r)).toFixed(1)));
}

/**
 * Computes lateral inertial acceleration (G) from yaw rate.
 * Canonical convention: +G right, -G left, 0G straight.
 */
export function computeLateralG(points: ReplayTrajectoryPoint[], yawRatesDeg: number[]): number[] {
  const n = points.length;
  if (n === 0) return [];

  const latG = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const vMs = (points[i].speedKmh ?? 0) / 3.6;
    const yawRateRad = (yawRatesDeg[i] * Math.PI) / 180;
    // a_lat = v * omega
    const aLat = vMs * yawRateRad;
    latG[i] = -aLat / G_CONST;
  }

  const smoothed = movingAverage(latG, 2);
  return smoothed.map(g => Number(Math.max(-4.5, Math.min(4.5, g)).toFixed(2)));
}

/**
 * Detects whether rotY in the trajectory has the native LMU PI coordinate offset
 * (car forward is -Z in local gMotor coordinate space).
 */
function detectRotYOffset(points: ReplayTrajectoryPoint[]): number {
  let sumDiff = 0;
  let count = 0;
  const maxScan = Math.min(points.length, 100);

  for (let i = 1; i < maxScan; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    if (Math.hypot(dx, dz) > 0.1 && points[i].rotY !== undefined) {
      const velH = Math.atan2(dx, dz);
      const d = Math.abs(unwrapAngle(velH - points[i].rotY!));
      sumDiff += d;
      count++;
    }
  }

  if (count === 0) return Math.PI;
  // If mean angular difference between velocity heading and rotY is > 1.5 rad (~86 deg),
  // rotY uses LMU/rFactor convention where forward is -Z (offset by PI).
  return (sumDiff / count) > 1.5 ? Math.PI : 0;
}

/**
 * Computes vehicle body slip angle beta (degrees): angle between vehicle heading
 * and actual velocity vector.
 * In LMU/rFactor 2 coordinates, vehicle forward is -Z in local space, so yaw rotation
 * rotY is offset by PI relative to world atan2(dx, dz).
 * Suppressed at low speeds (< 10 km/h) to prevent singularity.
 */
export function computeSlipAngle(
  points: ReplayTrajectoryPoint[],
  latG?: number[]
): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const hasRotY = points.some(p => p.rotY !== undefined && p.rotY !== 0);
  const rotOffset = hasRotY ? detectRotYOffset(points) : 0;
  const slipAngles = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const spd = points[i].speedKmh ?? 0;
    if (spd < 10) {
      slipAngles[i] = 0;
      continue;
    }

    if (hasRotY && points[i].rotY !== undefined) {
      const prevIdx = Math.max(0, i - 2);
      const nextIdx = Math.min(n - 1, i + 2);
      const dx = points[nextIdx].x - points[prevIdx].x;
      const dz = points[nextIdx].z - points[prevIdx].z;

      if (Math.hypot(dx, dz) < 0.1) {
        slipAngles[i] = 0;
        continue;
      }

      // Velocity heading in LMU world plane (X = lateral/east, Z = forward/north)
      const velHeadingRad = Math.atan2(dx, dz);
      const carHeadingRad = unwrapAngle(points[i].rotY! + rotOffset);

      // Body slip angle: positive indicates slip to the right (+G / right turn),
      // negative indicates slip to the left (-G / left turn)
      const betaRad = unwrapAngle(carHeadingRad - velHeadingRad);
      const betaDeg = betaRad * (180 / Math.PI);
      slipAngles[i] = betaDeg;
    } else {
      // Fallback if orientation rotY is not available:
      // Approximate chassis body slip angle from lateral acceleration (~0.85 deg/G)
      const g = latG ? latG[i] ?? 0 : (points[i].accelLatG ?? 0);
      slipAngles[i] = g * 0.85;
    }
  }

  const smoothed = movingAverage(slipAngles, 2);
  return smoothed.map(b => Number(Math.max(-25, Math.min(25, b)).toFixed(2)));
}

/**
 * Computes dynamic understeer (+) vs oversteer (-) handling balance angle in degrees:
 * Difference between actual front road-wheel angle (steerYaw / ratio) and
 * kinematic Ackermann angle required for the path radius.
 * Gated to 0 when driving straight or at low speeds.
 */
export function computeUnderOversteer(
  points: ReplayTrajectoryPoint[],
  yawRatesDeg: number[]
): number[] {
  const n = points.length;
  if (n === 0) return [];

  const balance = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const spd = points[i].speedKmh ?? 0;
    const steer = points[i].steerYaw ?? 0;
    const yaw = yawRatesDeg[i] ?? 0;

    // Gate when driving slow or when both steering and vehicle yaw rotation are negligible
    if (spd < 15 || (Math.abs(steer) < 3 && Math.abs(yaw) < 3)) {
      balance[i] = 0;
      continue;
    }

    const vMs = spd / 3.6;
    // Actual road wheel steer angle in degrees
    const wheelAngleDeg = steer / STEERING_RATIO;

    // Kinematic steering angle for neutral turning: delta_k = (L * yawRateRad / v) in degrees
    const yawRateRad = (yaw * Math.PI) / 180;
    const kinematicAngleDeg = ((WHEELBASE_M * yawRateRad) / Math.max(1, vMs)) * (180 / Math.PI);

    // Reference cornering direction: determined by vehicle yaw rate when cornering,
    // falling back to driver steering angle if the car is just initiating turn.
    const turnDir = Math.abs(yaw) >= 3 ? (yaw > 0 ? 1 : -1) : (steer > 0 ? 1 : -1);

    // Dynamic handling balance (Understeer (+) vs Oversteer (-)):
    // - Understeer (+): Driver turns wheel more into corner than kinematic requirement (front pushing).
    // - Oversteer (-): Vehicle rotates faster than driver steering input (loose rear / power slide / countersteering).
    const diff = (wheelAngleDeg - kinematicAngleDeg) * turnDir;

    balance[i] = diff;
  }

  const smoothed = movingAverage(balance, 2);
  return smoothed.map(b => Number(Math.max(-15, Math.min(15, b)).toFixed(2)));
}

export interface TireSlipAndLockupResult {
  tireSlipPct: number[];
  wheelLockActive: boolean[];
}

/**
 * Computes tire slip & grip saturation index (0-100%) and detects wheel lockup
 * for both ABS-equipped and non-ABS vehicles (LMP2, Hypercar, GTE).
 */
export function computeTireSlipAndLockup(
  points: ReplayTrajectoryPoint[],
  lonG: number[],
  latG: number[],
  slipAnglesDeg: number[],
  yawRatesDeg: number[]
): TireSlipAndLockupResult {
  const n = points.length;
  const slipPct = new Array<number>(n);
  const lockActive = new Array<boolean>(n);

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const brake = p.brake ?? 0;
    const throttle = p.throttle ?? 0;
    const gLon = lonG[i] ?? 0;
    const gLat = latG[i] ?? 0;
    const beta = Math.abs(slipAnglesDeg[i] ?? 0);
    const abs = Boolean(p.absActive);
    const tc = Boolean(p.tcActive);

    // Baseline friction saturation from acceleration demand
    const sLon = Math.min(1.0, Math.abs(gLon) / 2.5);
    const sLat = Math.min(1.0, Math.abs(gLat) / 2.8);
    const totalAccDemand = Math.min(1.0, Math.hypot(sLon, sLat));

    let slip = totalAccDemand * 70 + Math.min(1.0, beta / 6.0) * 25;

    // Detect non-ABS wheel lockup under heavy braking
    let isLocked = false;
    if (abs) {
      // ABS active represents wheel slip / threshold lock cycling
      isLocked = true;
      slip = Math.max(slip, 90);
    } else if (brake > 35) {
      // Non-ABS conditions:
      // 1. Extreme deceleration limit:
      const isExtremeDecel = gLon < -2.6;

      // 2. Sliding kinetic drop: driver holding heavy brake (> 60%), but deceleration
      // collapses (-1.3G or less) because locked tires transitioned to lower kinetic friction:
      const isKineticSkid = brake > 60 && gLon > -1.3 && (p.speedKmh ?? 0) > 40;

      // 3. Front steering lockup / plow: driver turning wheel significantly, but car fails to yaw
      const isSteeringPlow = brake > 40 && Math.abs(p.steerYaw ?? 0) > 25 && Math.abs(yawRatesDeg[i] ?? 0) < 4 && (p.speedKmh ?? 0) > 35;

      if (isExtremeDecel || isKineticSkid || isSteeringPlow) {
        isLocked = true;
        slip = Math.max(slip, 92);
      }
    }

    // Drive traction wheel spin (TC active or high throttle exit slide)
    if (tc) {
      slip = Math.max(slip, 82);
    } else if (throttle > 85 && beta > 4.0 && (p.speedKmh ?? 0) > 30) {
      slip = Math.max(slip, 75);
    }

    // Off-track gravel / grass grip loss
    if (p.isOffTrack) {
      slip = Math.max(slip, 75);
    }

    slipPct[i] = Math.round(Math.max(0, Math.min(100, slip)));
    lockActive[i] = isLocked;
  }

  return {
    tireSlipPct: slipPct,
    wheelLockActive: lockActive,
  };
}

/**
 * Chains all vehicle dynamics calculations and augments the trajectory points.
 */
export function computeVehicleDynamics(points: ReplayTrajectoryPoint[]): ReplayTrajectoryPoint[] {
  if (points.length === 0) return points;

  const lonG = computeLongitudinalG(points);
  const yawRates = computeYawRate(points);
  const latG = computeLateralG(points, yawRates);
  const slipAngles = computeSlipAngle(points, latG);
  const underOversteer = computeUnderOversteer(points, yawRates);
  const { tireSlipPct, wheelLockActive } = computeTireSlipAndLockup(
    points,
    lonG,
    latG,
    slipAngles,
    yawRates
  );

  return points.map((p, i) => {
    const gLon = lonG[i];
    const gLat = latG[i];
    const gTotal = Number(Math.hypot(gLon, gLat).toFixed(2));

    return {
      ...p,
      accelLonG: p.accelLonG ?? gLon,
      accelLatG: p.accelLatG ?? gLat,
      accelTotalG: p.accelTotalG ?? gTotal,
      yawRateDeg: yawRates[i],
      slipAngleDeg: slipAngles[i],
      understeerDeg: underOversteer[i],
      tireSlipPct: tireSlipPct[i],
      wheelLockActive: wheelLockActive[i],
    };
  });
}
