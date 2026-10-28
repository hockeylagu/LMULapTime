import { ReplayPitEvent, ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { applyGarageState } from './garageState.js';
import { RawTrajectoryPoint, isTimeInIntervals } from './replayLapBuilder.js';

type Intervals = Array<{ start: number; end: number }>;

const MAX_PLAUSIBLE_SPEED_KMH = 400;
// Beyond this gap between consecutive samples the car teleported (pit, reset): the samples
// on the other side are not a continuation of the lap.
const MAX_SAMPLE_JUMP_M = 60;

/**
 * Number(value.toFixed(digits)) without building a string per value. The scaled value is off by at
 * most one rounding step, so only a value within that of a half step can round the other way: those
 * few take toFixed. Zero returns +0 like toFixed does for -0.
 */
export function roundFixed(value: number, digits: number): number {
  if (value === 0) return 0;
  const scale = 10 ** digits;
  const scaled = value * scale;
  const rounded = Math.round(scaled);
  return Math.abs(Math.abs(scaled - rounded) - 0.5) > 1e-6 ? rounded / scale : Number(value.toFixed(digits));
}

/**
 * Converts raw replay samples to trajectory points. Speed comes from the packet when it
 * decodes to a plausible value, otherwise from the distance to the previous sample. The garage
 * state comes from the driver's pit events (applyGarageState), the same way a stored lap gets it.
 */
export function buildTrajectoryPoints(
  samples: RawTrajectoryPoint[],
  pitIntervals: Intervals,
  driverPitEvents: ReplayPitEvent[]
): ReplayTrajectoryPoint[] {
  const points = samples.map((cur, i): ReplayTrajectoryPoint => {
    let derivedSpeed = 0;
    if (i > 0) {
      const prev = samples[i - 1];
      const dt = cur.sTime - prev.sTime;
      const dist = Math.hypot(cur.x - prev.x, cur.z - prev.z);
      if (dt > 0.005 && dist < MAX_SAMPLE_JUMP_M) {
        derivedSpeed = Math.min((dist / dt) * 3.6, MAX_PLAUSIBLE_SPEED_KMH);
      }
    }
    const packetSpeed = cur.speedKmhRaw;
    const rawSpeed = packetSpeed !== undefined && packetSpeed <= MAX_PLAUSIBLE_SPEED_KMH ? packetSpeed : derivedSpeed;
    const inPit = Boolean(cur.inPit) || isTimeInIntervals(cur.sTime, pitIntervals);

    return {
      x: roundFixed(cur.x, 4),
      y: roundFixed(cur.y, 4),
      z: roundFixed(cur.z, 4),
      // The old decoder rounded X/Z before this conversion, turning rounded -0 into
      // +0 on the second pass. Keep that output while rounding each value only once.
      rotX: cur.rotX !== undefined ? roundFixed(cur.rotX, 4) + 0 : undefined,
      rotY: roundFixed(cur.rotY, 4),
      rotZ: cur.rotZ !== undefined ? roundFixed(cur.rotZ, 4) + 0 : undefined,
      speedKmh: roundFixed(rawSpeed, 2),
      throttle: cur.rawThrottle ?? 0,
      brake: cur.rawBrake ?? 0,
      steerYaw: cur.steerYaw ?? 0,
      gear: cur.gearRaw,
      inPit,
      isOffTrack: cur.isOffTrack,
      inGarage: false,
      isTeleport: false,
      timeSec: roundFixed(cur.sTime, 4),
      tcActive: cur.tcActive,
      absActive: cur.absActive,
      pitLimiter: cur.pitLimiter,
      detachablePartState: cur.detachablePartState,
      engineRpm: cur.engineRpm,
      wheelSpeeds: cur.wheelSpeeds,
      brakeTemps: cur.brakeTemps,
      virtualEnergy: cur.virtualEnergy,
      rainIntensity: cur.rainIntensity,
      ambientTemp: cur.ambientTemp,
      tireCompoundIndices: cur.tireCompoundIndices,
    };
  });
  applyGarageState(points, driverPitEvents);
  return points;
}

/**
 * How much recording is kept either side of a lap as sliced by the timing loop. A remote
 * driver's timing event reaches the replay late (the lap is sliced 10-15 m after the line at
 * racing speed); the padding lets the lap be cut exactly at the line once the samples are
 * projected on the track (see server/tracks/lapLineCut.ts).
 */
export const LAP_EDGE_PADDING_SEC = 2;

/**
 * The recording within LAP_EDGE_PADDING_SEC before and after a lap, taken from the laps either
 * side of it (the end of the previous lap is the run-up to this one's start line), stopping at a
 * teleport or a gap in time.
 */
export function lapEdgesFromNeighbours(
  lap: ReplayTrajectoryPoint[],
  previous: ReplayTrajectoryPoint[] | undefined,
  next: ReplayTrajectoryPoint[] | undefined
): { leadIn: ReplayTrajectoryPoint[]; leadOut: ReplayTrajectoryPoint[] } {
  const first = lap[0];
  const last = lap[lap.length - 1];
  if (!first || !last) return { leadIn: [], leadOut: [] };
  const timeOf = (p: ReplayTrajectoryPoint) => p.timeSec ?? NaN;
  // Times are stored to 0.01 s, so two consecutive samples can share one: only going back in
  // time or a teleport breaks the recording.
  const isContinuous = (a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint) =>
    timeOf(b) >= timeOf(a) && Math.hypot(b.x - a.x, b.z - a.z) < MAX_SAMPLE_JUMP_M;

  const leadIn: ReplayTrajectoryPoint[] = [];
  let after = first;
  for (let i = (previous?.length ?? 0) - 1; i >= 0 && previous; i--) {
    const p = previous[i];
    if (timeOf(p) >= timeOf(first)) continue;
    if (timeOf(first) - timeOf(p) > LAP_EDGE_PADDING_SEC || !isContinuous(p, after)) break;
    leadIn.unshift(p);
    after = p;
  }
  const leadOut: ReplayTrajectoryPoint[] = [];
  let before = last;
  for (const p of next ?? []) {
    if (timeOf(p) <= timeOf(last)) continue;
    if (timeOf(p) - timeOf(last) > LAP_EDGE_PADDING_SEC || !isContinuous(before, p)) break;
    leadOut.push(p);
    before = p;
  }
  return { leadIn, leadOut };
}
