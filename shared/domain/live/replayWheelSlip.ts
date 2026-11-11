import type { ReplayTrajectoryPoint } from '../../types/replay.js';
import type { WheelSlipRatios } from '../../types/liveEvidence.js';
import { WHEEL_POSITIONS, detectWheelSlipEvents } from './wheelSlip.js';

/** Free rolling: no brake, nearly straight, at speed. The wheel's rolling radius is measured on these samples. */
const FREE_ROLLING_MIN_SPEED_MPS = 20;
const FREE_ROLLING_MAX_YAW_DEG_S = 3;
/** A wheel needs this many free-rolling samples in the lap (about 1 s at 50 Hz) for a radius. */
const MIN_FREE_ROLLING_SAMPLES = 50;
/** Same rule as the live ratio: undefined for a slow or reversing car. */
const MIN_FORWARD_SPEED_MPS = 5;

/**
 * Each wheel's rolling radius in the lap (m): the median of forward speed over wheel speed while free rolling. The
 * replay holds wheel speed for every car but no radius; it holds steady within 0.4 % over a stint.
 */
function rollingRadii(points: readonly ReplayTrajectoryPoint[]): Array<number | null> {
  return WHEEL_POSITIONS.map((_, wheel) => {
    const free: number[] = [];
    for (const p of points) {
      const omega = Math.abs(p.wheelAngularSpeeds?.[wheel] ?? 0);
      if (p.brake === 0 && Math.abs(p.yawRateDeg ?? Infinity) < FREE_ROLLING_MAX_YAW_DEG_S
        && (p.velocityLon ?? 0) > FREE_ROLLING_MIN_SPEED_MPS && omega > 1) free.push(p.velocityLon! / omega);
    }
    if (free.length < MIN_FREE_ROLLING_SAMPLES) return null;
    free.sort((a, b) => a - b);
    return free[free.length >> 1];
  });
}

/**
 * Wheel slip for a replay lap from each wheel's angular speed and the car's measured forward speed:
 * ratio = (ω × r − v) / v, SAE sign as the live ratio. Lockup and wheelspin use the live event rule. A lap that
 * already has slip (from a live capture, which measures the contact patch) or has no wheel speeds is returned as is.
 * Validated against a live capture over a 16-lap race: 47 of 53 live events found, the misses at 15–19 %. The ratio reads
 * about 2 % less braking slip at the front wheels than the contact patch (1 % at the rears), so a borderline front lockup
 * can be missed; accepted as a known limit rather than modelling the loaded tyre radius.
 */
export function withReplayWheelSlip(points: ReplayTrajectoryPoint[]): ReplayTrajectoryPoint[] {
  if (points.some(p => p.wheelSlip !== undefined)) return points;
  const radii = rollingRadii(points);
  if (radii.every(radius => radius === null)) return points;
  const samples = points.map(p => {
    const v = p.velocityLon;
    const ratios = WHEEL_POSITIONS.map((_, wheel) => {
      const omega = p.wheelAngularSpeeds?.[wheel];
      const radius = radii[wheel];
      if (radius === null || omega === undefined || v === undefined || v < MIN_FORWARD_SPEED_MPS) return null;
      return (Math.abs(omega) * radius - v) / v;
    }) as WheelSlipRatios;
    return { lapSeconds: p.timeSec ?? NaN, ratios };
  });
  const events = detectWheelSlipEvents(samples);
  const wheelsIn = (kind: 'lockup' | 'wheelspin', time: number) => events
    .filter(e => e.kind === kind && time >= e.startLapSeconds && time <= e.endLapSeconds).map(e => e.wheel);
  return points.map((p, i) => {
    const { ratios, lapSeconds } = samples[i];
    if (ratios.every(ratio => ratio === null)) return p;
    return { ...p, wheelSlip: { ratios, lockup: wheelsIn('lockup', lapSeconds), wheelspin: wheelsIn('wheelspin', lapSeconds) } };
  });
}
