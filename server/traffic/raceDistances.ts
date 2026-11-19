import type { RaceReplayProgress } from '../../shared/types/index.js';
import type { SessionCornerPasses } from '../../shared/types/corners/cornerPasses.js';

/** Grid samples per second: distance is near linear over a second, so gaps read from it stay within a few hundredths. */
export const RACE_DISTANCES_HZ = 1;
/** A pass starting more than this after the previous one's exit is a new run: the car was in the pit lane or garage between. */
const JOINED_SEC = 0.5;

type Knot = [timeSec: number, distanceM: number];

/**
 * Each car's runs of joined passes as knots of time and distance: every turn's entry, slowest point and exit. The
 * distance is the centre line's station unwrapped across laps (lap `n` adds n - 1 track lengths), so the scenery can read
 * the station back and two cars' distances differ by their laps.
 */
function carRuns(passes: SessionCornerPasses & { available: true }, slot: number): Knot[][] {
  const turns = new Map(passes.turns.map(turn => [turn.id, turn]));
  const length = passes.trackLengthM;
  const runs: Knot[][] = [];
  let run: Knot[] = [], lastExit = -Infinity;
  const mine = passes.passes.filter(pass => pass.slot === slot).sort((a, b) => a.entrySec - b.entrySec);
  for (const pass of mine) {
    const turn = turns.get(pass.segment);
    if (!turn) continue;
    if (pass.entrySec - lastExit > JOINED_SEC && run.length) { runs.push(run); run = []; }
    const base = (pass.lapNumber - 1) * length + passes.startStationM;
    const knots: Knot[] = [[pass.entrySec, base + turn.startM]];
    if (pass.minSpeedSec !== null && pass.minSpeedM !== null) knots.push([pass.minSpeedSec, base + pass.minSpeedM]);
    knots.push([pass.exitSec, base + turn.endM]);
    for (const knot of knots) {
      const last = run[run.length - 1];
      // Time and distance only go forward; a knot that would step back (a pass re-timed across the line) is skipped.
      if (!last || (knot[0] > last[0] && knot[1] >= last[1])) run.push(knot);
    }
    lastExit = pass.exitSec;
  }
  if (run.length) runs.push(run);
  return runs.filter(knots => knots.length >= 2);
}

/** The car's distance at each grid time, in one sweep through its runs; null between runs and outside them. */
function sweep(runs: Knot[][], fromSec: number, hz: number, count: number): Array<number | null> {
  const out = new Array<number | null>(count).fill(null);
  for (const knots of runs) {
    let i = 1;
    for (let k = Math.max(0, Math.ceil((knots[0][0] - fromSec) * hz)); k < count; k++) {
      const timeSec = fromSec + k / hz;
      if (timeSec > knots[knots.length - 1][0]) break;
      while (knots[i][0] < timeSec) i++;
      const [t0, d0] = knots[i - 1], [t1, d1] = knots[i];
      out[k] = Math.round((d0 + (d1 - d0) * (timeSec - t0) / (t1 - t0)) * 10) / 10;
    }
  }
  return out;
}

/**
 * Every car's distance along the track once a second, from the session's corner passes (docs/plans/proposed/
 * CORNER_INSIGHT.md, step 5): linear between each turn's entry, slowest point and exit, as timing loops at every turn
 * boundary would read it. Null in the pit lane and garage, where a car has no passes.
 */
export function raceDistancesFromPasses(passes: SessionCornerPasses & { available: true }, hz = RACE_DISTANCES_HZ): RaceReplayProgress {
  const slots = [...new Set(passes.passes.map(pass => pass.slot))].sort((a, b) => a - b);
  const cars = slots.map(slot => ({ slot, runs: carRuns(passes, slot) })).filter(car => car.runs.length);
  if (!cars.length) return { fromSec: 0, hz, trackLengthM: passes.trackLengthM, cars: [] };
  const first = Math.min(...cars.map(car => car.runs[0][0][0]));
  const last = Math.max(...cars.map(car => { const run = car.runs[car.runs.length - 1]; return run[run.length - 1][0]; }));
  const fromSec = Math.floor(first * hz) / hz;
  const count = Math.floor((last - fromSec) * hz) + 1;
  return {
    fromSec, hz, trackLengthM: passes.trackLengthM,
    cars: cars.map(car => ({ slot: car.slot, distances: sweep(car.runs, fromSec, hz, count) })),
  };
}
