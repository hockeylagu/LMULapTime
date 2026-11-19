import {
  CORNER_MIN_PROMINENCE_KMH, STEER_REVERSAL_FRACTION, findSpeedTurningPoints, maxAbsSteer,
} from '../../shared/domain/cornerSequences/speedTurningPoints.js';
import type { SequenceLap } from '../../shared/domain/cornerSequences/sequenceMap.js';
import type { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import type { PassLapSamples } from './cornerPasses.js';

/** A lap's driving samples in order, each at its distance from the start line, unwrapped across the line. */
export interface LapTrace {
  times: number[];
  distM: number[];
  speedKmh: Array<number | null>;
  steer: Array<number | null>;
}

/**
 * A stored lap (readPassLap) as one run along the track: the samples with a place on the centre line, their
 * distance unwrapped where it steps back across the line, and starting below zero when the lap's first samples sit
 * just short of it.
 */
export function lapTrace(lap: PassLapSamples, lengthM: number): LapTrace {
  const trace: LapTrace = { times: [], distM: [], speedKmh: [], steer: [] };
  let offset = 0;
  let previous: number | null = null;
  for (let i = 0; i < lap.stations.length; i++) {
    const station = lap.stations[i];
    if (!lap.usable[i] || !Number.isFinite(station) || !Number.isFinite(lap.times[i])) continue;
    if (previous === null && station > lengthM / 2) offset = -lengthM;
    else if (previous !== null && station + offset < previous - lengthM / 2) offset += lengthM;
    previous = station + offset;
    trace.times.push(lap.times[i]);
    trace.distM.push(previous);
    trace.speedKmh.push(lap.speedKmh[i]);
    trace.steer.push(lap.steer[i]);
  }
  return trace;
}

/** The corner rule's turning points of a trace (speed, split at a steering reversal), with the speed at each. */
export function sequenceLap(trace: LapTrace): SequenceLap {
  const threshold = maxAbsSteer(trace.steer) * STEER_REVERSAL_FRACTION;
  const points = findSpeedTurningPoints(trace.speedKmh, trace.steer, trace.distM, CORNER_MIN_PROMINENCE_KMH, threshold);
  return { points: points.map(point => ({ ...point, speedKmh: trace.speedKmh[point.index] ?? 0 })) };
}

/**
 * The driver's native lap (lap clock from 0) on the stored lap's track: speed and steering at the native rate,
 * each sample placed by the stored lap's distance at that moment (`lapStartSec` on the replay clock).
 */
export function nativeTrace(points: readonly ReplayTrajectoryPoint[], stored: LapTrace, lapStartSec: number): LapTrace {
  const trace: LapTrace = { times: [], distM: [], speedKmh: [], steer: [] };
  let k = 0;
  for (const point of points) {
    if (typeof point.timeSec !== 'number') continue;
    const t = lapStartSec + point.timeSec;
    while (k < stored.times.length - 2 && stored.times[k + 1] < t) k++;
    const t0 = stored.times[k];
    const t1 = stored.times[k + 1];
    if (t1 === undefined || t < t0 || t > t1 || t1 - t0 > 0.5) continue;
    const alpha = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    trace.times.push(t);
    trace.distM.push(stored.distM[k] + alpha * (stored.distM[k + 1] - stored.distM[k]));
    trace.speedKmh.push(point.speedKmh ?? null);
    trace.steer.push(point.steerYaw ?? null);
  }
  return trace;
}
