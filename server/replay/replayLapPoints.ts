import { ReplayTrajectoryPoint } from '../core/types.js';
import { RawTrajectoryPoint, isTimeInIntervals } from './replayLapBuilder.js';

type Intervals = Array<{ start: number; end: number }>;

const MAX_PLAUSIBLE_SPEED_KMH = 400;
// Beyond this gap between consecutive samples the car teleported (pit, reset): the samples
// on the other side are not a continuation of the lap.
const MAX_SAMPLE_JUMP_M = 60;

/**
 * Converts raw replay samples to trajectory points. Speed comes from the packet when it
 * decodes to a plausible value, otherwise from the distance to the previous sample.
 */
export function buildTrajectoryPoints(
  samples: RawTrajectoryPoint[],
  garageIntervals: Intervals,
  pitIntervals: Intervals
): ReplayTrajectoryPoint[] {
  return samples.map((cur, i) => {
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
    const inGarage = isTimeInIntervals(cur.sTime, garageIntervals) ||
      (garageIntervals.length === 0 && Boolean(cur.inPit) && rawSpeed < 1);
    const inPit = Boolean(cur.inPit) || isTimeInIntervals(cur.sTime, pitIntervals);

    return {
      x: Number(cur.x.toFixed(4)),
      y: Number(cur.y.toFixed(4)),
      z: Number(cur.z.toFixed(4)),
      rotX: cur.rotX !== undefined ? Number(cur.rotX.toFixed(4)) : undefined,
      rotY: Number(cur.rotY.toFixed(4)),
      rotZ: cur.rotZ !== undefined ? Number(cur.rotZ.toFixed(4)) : undefined,
      speedKmh: Number(rawSpeed.toFixed(2)),
      throttle: cur.rawThrottle ?? 0,
      brake: cur.rawBrake ?? 0,
      steerYaw: cur.steerYaw ?? 0,
      gear: cur.gearRaw,
      inPit,
      isOffTrack: cur.isOffTrack,
      inGarage,
      isTeleport: false,
      timeSec: Number(cur.sTime.toFixed(4)),
      tcActive: cur.tcActive,
      absActive: cur.absActive,
      pitLimiter: cur.pitLimiter,
      detachablePartState: cur.detachablePartState,
      engineRpm: cur.engineRpm,
      wheelSpeeds: cur.wheelSpeeds,
      brakeTemps: cur.brakeTemps,
      fuel: cur.fuel,
    };
  });
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
