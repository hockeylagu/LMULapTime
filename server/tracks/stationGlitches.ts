import { ReplayTrajectoryPoint } from '../core/types.js';

/** A station this far behind the previous one is a projection glitch, not centreline noise. */
export const STATION_BACKWARD_TOLERANCE_M = 1;
/** A station advancing this much further than the car actually drove is a jump to another part of the track. */
export const STATION_JUMP_TOLERANCE_M = 20;
// Consecutive samples further apart than this are a teleport (same threshold as lap slicing).
const TELEPORT_M = 60;
const MIN_SPEED_KMH = 20;
/**
 * Further than this from the centreline the car is off the circuit (a run-off, a gravel trap):
 * the nearest stretch of centreline is ambiguous there by nature, so a disagreement is counted
 * apart from the on-track ones.
 */
export const OFF_CIRCUIT_OFFSET_M = 20;

export interface StationGlitches {
  backwardSteps: number;
  forwardJumps: number;
  /** Largest disagreement, in metres, between the station change and the distance driven. */
  worstM: number;
  /** Disagreements (backwards or jumps) while the car was off the circuit. */
  offCircuit: number;
}

/**
 * Counts where a lap's projection on the centreline disagrees with how the car moved: the station
 * going backwards, or advancing much further than the distance driven (the projection latched
 * onto a neighbouring stretch of track, e.g. where two parts of a circuit run side by side).
 * The client hides both by forcing stations to be non-decreasing; this makes them visible.
 * `points` must carry stationM in [0, trackLengthM] (the seam is unwrapped here).
 */
export function countStationGlitches(points: ReplayTrajectoryPoint[], trackLengthM: number): StationGlitches {
  const result: StationGlitches = { backwardSteps: 0, forwardJumps: 0, worstM: 0, offCircuit: 0 };
  let prevRaw = points[0]?.stationM;
  for (let i = 1; i < points.length; i++) {
    const raw = points[i].stationM;
    if (raw === undefined || prevRaw === undefined) {
      prevRaw = raw;
      continue;
    }
    let ds = raw - prevRaw;
    if (ds < -trackLengthM / 2) ds += trackLengthM;
    else if (ds > trackLengthM / 2) ds -= trackLengthM;
    prevRaw = raw;

    const a = points[i - 1];
    const b = points[i];
    const driven = Math.hypot(b.x - a.x, b.z - a.z);
    // Not a projection question: a teleport (reset to the pits), the pit lane (off the
    // centreline by design), or a car crawling or reversing after a spin.
    const outOfScope = driven >= TELEPORT_M || a.inPit || b.inPit || a.inGarage || b.inGarage ||
      Math.min(a.speedKmh ?? Infinity, b.speedKmh ?? Infinity) < MIN_SPEED_KMH;
    if (outOfScope) continue;
    const isGlitch = ds < -STATION_BACKWARD_TOLERANCE_M || ds - driven > STATION_JUMP_TOLERANCE_M;
    if (isGlitch && Math.max(Math.abs(a.lateralOffsetM ?? 0), Math.abs(b.lateralOffsetM ?? 0)) > OFF_CIRCUIT_OFFSET_M) {
      result.offCircuit++;
    } else if (ds < -STATION_BACKWARD_TOLERANCE_M) {
      result.backwardSteps++;
      result.worstM = Math.max(result.worstM, -ds);
    } else if (ds - driven > STATION_JUMP_TOLERANCE_M) {
      result.forwardJumps++;
      result.worstM = Math.max(result.worstM, ds - driven);
    }
  }
  return result;
}
