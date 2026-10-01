import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';

/** Samples per second when a lap carries no timestamps (playback then steps samples evenly). */
const UNTIMED_SAMPLES_PER_SEC = 40;

/**
 * Where playback is on a lap: the lap's own clock (sample timeSec), so 1x replays the lap in its
 * lap time. Samples are not evenly spaced in time - the server keeps them where the traces change
 * (dense in braking zones, sparse on straights) and the VCR's own frame rate varies - so stepping
 * a fixed number of samples per frame ran the car fast on straights and slow in corners.
 */
export interface PlaybackClock {
  /** Lap clock in seconds (the samples' timeSec). */
  timeSec: number;
  /** The sample shown: the last one at or before timeSec. */
  index: number;
}

function sampleTime(points: ReplayTrajectoryPoint[], i: number, timed: boolean): number {
  return timed ? (points[i].timeSec ?? 0) : i / UNTIMED_SAMPLES_PER_SEC;
}

function isTimed(points: ReplayTrajectoryPoint[]): boolean {
  return points.length > 1 && (points[points.length - 1].timeSec ?? 0) > (points[0].timeSec ?? 0);
}

/** Visual interpolation only; gaps/teleports and repeated timestamps stay at the sample. */
export function playbackSampleFraction(points: ReplayTrajectoryPoint[], clock: PlaybackClock): number {
  const next = points[clock.index + 1];
  const current = points[clock.index];
  if (!next || next.isTeleport || !current || Math.hypot(next.x - current.x, next.z - current.z) > 20) return 0;
  const timed = isTimed(points);
  const start = sampleTime(points, clock.index, timed);
  const span = sampleTime(points, clock.index + 1, timed) - start;
  return span > 0 ? Math.max(0, Math.min(1, (clock.timeSec - start) / span)) : 0;
}

/** Starts the clock at a sample (play pressed, or the user moved the cursor while playing). */
export function playbackClockAt(points: ReplayTrajectoryPoint[], index: number): PlaybackClock {
  const i = Math.max(0, Math.min(points.length - 1, index));
  return { timeSec: points.length ? sampleTime(points, i, isTimed(points)) : 0, index: i };
}

/**
 * Advances the clock by `elapsedMs` of wall time at `speed`. Returns null once it runs past the
 * last sample (the lap has finished playing).
 */
export function advancePlaybackClock(
  points: ReplayTrajectoryPoint[],
  clock: PlaybackClock,
  elapsedMs: number,
  speed: number,
): PlaybackClock | null {
  if (points.length === 0) return null;
  const timed = isTimed(points);
  const timeSec = clock.timeSec + (elapsedMs / 1000) * speed;
  const last = points.length - 1;
  const endSec = sampleTime(points, last, timed);
  // Past the end: the last sample is shown for one frame before playback stops.
  if (timeSec > endSec) return clock.index < last ? { timeSec: endSec, index: last } : null;
  // Last sample at or before timeSec, searching forward from the current one.
  let lo = Math.max(0, Math.min(clock.index, last));
  if (sampleTime(points, lo, timed) > timeSec) lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sampleTime(points, mid, timed) <= timeSec) lo = mid;
    else hi = mid - 1;
  }
  return { timeSec, index: lo };
}
