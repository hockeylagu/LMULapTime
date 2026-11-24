import type { ReplayLapSummary, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { computeLapComparisons } from '../../../../utils/replayComparison.js';

/**
 * What a wheel/dash readout needs from laps other than the one shown: the live delta to the reference lap (the driver's best lap
 * finished before this one, the lap the BestLap field shows) and the fuel and virtual energy the previous lap used. The inspector
 * loads those laps after the shown one and registers the result for it; the readout reads it every frame, so it fills in when it
 * arrives without rebuilding the car.
 */
export interface ReadoutLapExtras {
  /** The reference lap's time; null when no earlier lap is finished (the delta fields then show the game's neutral ` -.---`). */
  referenceLapSec: number | null;
  /** Seconds behind (positive) or ahead of the reference at each sample of the shown lap; null without a reference. */
  delta: number[] | null;
  /** Litres and percent of virtual energy the previous lap used (its first sample minus its last); null where unknown. */
  previousFuelUsed: number | null;
  previousEnergyUsed: number | null;
}

const registry = new WeakMap<object, ReadoutLapExtras>();

/** Registers `extras` for the shown lap (the trajectory object the 3D view draws). */
export function setReadoutLapExtras(lap: object, extras: ReadoutLapExtras): void {
  registry.set(lap, extras);
}

/** The extras registered for `lap`, or null while they load (or when the lap has none). */
export function readoutLapExtras(lap: object): ReadoutLapExtras | null {
  return registry.get(lap) ?? null;
}

/**
 * The laps finished before `currentLap` that count for a best: timed and valid. An invalid lap (cut, or a partial lap a session
 * reset or a jump to the garage ends) is never the best.
 */
export function finishedLapsBefore(laps: readonly ReplayLapSummary[] | undefined, currentLap: number): ReplayLapSummary[] {
  return (laps ?? []).filter(lap => lap.lapNumber < currentLap && lap.lapTimeSec > 0 && lap.isValid !== false);
}

/** The lap number of the reference: the fastest valid lap finished before `currentLap`, as the BestLap field picks it. */
export function referenceLapNumber(trajectory: Pick<ReplayTrajectoryData, 'currentLap' | 'laps'>): number | null {
  const current = trajectory.currentLap;
  if (current === undefined) return null;
  const done = finishedLapsBefore(trajectory.laps, current);
  if (!done.length) return null;
  return done.reduce((best, lap) => lap.lapTimeSec < best.lapTimeSec ? lap : best).lapNumber;
}

const used = (points: readonly ReplayTrajectoryPoint[], value: (point: ReplayTrajectoryPoint) => number | undefined): number | null => {
  const first = points.find(point => value(point) !== undefined), last = points.findLast(point => value(point) !== undefined);
  return first && last ? Math.max(0, value(first)! - value(last)!) : null;
};

/** The extras of `trajectory` from its reference lap and previous lap (null where not loaded or not there). */
export function buildReadoutLapExtras(trajectory: ReplayTrajectoryData, reference: ReplayTrajectoryData | null, previous: ReplayTrajectoryData | null): ReadoutLapExtras {
  const referenceLap = reference ? (trajectory.laps ?? []).find(lap => lap.lapNumber === reference.currentLap) ?? null : null;
  const comparisons = reference && referenceLap ? computeLapComparisons(trajectory.points, reference.points, trajectory.trackLengthM) : [];
  return {
    referenceLapSec: referenceLap && comparisons.length === trajectory.points.length ? referenceLap.lapTimeSec : null,
    delta: comparisons.length === trajectory.points.length ? comparisons.map(row => row.deltaTimeSec) : null,
    previousFuelUsed: previous ? used(previous.points, point => point.fuel) : null,
    previousEnergyUsed: previous ? used(previous.points, point => point.virtualEnergy) : null,
  };
}
