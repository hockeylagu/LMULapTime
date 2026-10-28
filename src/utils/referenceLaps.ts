import type { ComparableLap } from '../../shared/types/index.js';

const sameCar = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The lap being analysed, as the session knows it. */
export interface AnalysedLap {
  sessionId: string;
  driverName: string;
  lapNumber: number;
  carType: string;
}

/** How much faster than the analysed lap the realistic reference aims to be (0.5%). */
export const ATTAINABLE_GAIN_RATIO = 0.005;

/**
 * Laps the debrief can compare against: with a replay, driven at racing speed, not marked non-representative, not the
 * lap being analysed and, unless `anyCar`, in the same car.
 */
function sameCarCandidates(laps: ComparableLap[], analysed: AnalysedLap, anyCar = false): Array<ComparableLap & { lapTime: number }> {
  return laps.filter((lap): lap is ComparableLap & { lapTime: number } => {
    if (!lap.matchingReplayFile || (!anyCar && !sameCar(lap.carType, analysed.carType))) return false;
    if (!lap.isValid || lap.isPitStop || lap.isOutLap || lap.nonRepresentativeReason) return false;
    if (typeof lap.lapTime !== 'number' || lap.lapTime <= 0) return false;
    return !(lap.sessionId === analysed.sessionId && lap.driverName === analysed.driverName && lap.lapNumber === analysed.lapNumber);
  });
}

type TimedLap = ComparableLap & { lapTime: number };

function fastestOf(candidates: TimedLap[]): TimedLap | null {
  let best: TimedLap | null = null;
  for (const lap of candidates) if (!best || lap.lapTime < best.lapTime) best = lap;
  return best;
}

/** The candidate closest to ATTAINABLE_GAIN_RATIO faster than `lapTime`; only faster laps qualify. */
function attainableOf(candidates: TimedLap[], lapTime: number): TimedLap | null {
  const target = lapTime * (1 - ATTAINABLE_GAIN_RATIO);
  let best: TimedLap | null = null;
  for (const lap of candidates) {
    if (lap.lapTime >= lapTime) continue;
    const distance = Math.abs(lap.lapTime - target);
    const bestDistance = best ? Math.abs(best.lapTime - target) : Infinity;
    if (distance < bestDistance || (distance === bestDistance && lap.lapTime < (best?.lapTime ?? Infinity))) best = lap;
  }
  return best;
}

/** The debrief's two references and where they came from. */
export interface ReferenceLaps {
  /** The realistic reference, or the fastest lap when none is faster than the analysed one; null when there is no lap. */
  reference: ComparableLap | null;
  /** The fastest lap, when it is faster than the reference. */
  technique: ComparableLap | null;
  /** `class`: no lap in the driver's car was clearly faster, so the references are other cars of the class. */
  pool: 'car' | 'class';
}

/**
 * Same-car laps first. When none is at least half the attainable gain faster, a same-car reference has little to
 * teach (Silverstone race 2026-10-28: the only faster Aston lap was 0.024 s quicker, while Porsches of the class ran
 * 0.8 s quicker in the same race), so the references come from `classLaps`, any car: a realistic one and the fastest.
 */
export function pickReferenceLaps(carLaps: ComparableLap[], classLaps: ComparableLap[], analysed: AnalysedLap & { lapTime: number }): ReferenceLaps {
  const sameCarLaps = sameCarCandidates(carLaps, analysed);
  const fastestSameCar = fastestOf(sameCarLaps);
  const classCandidates = sameCarCandidates(classLaps, analysed, true);
  const clearlyFaster = (lap: TimedLap | null) => lap !== null && lap.lapTime <= analysed.lapTime * (1 - ATTAINABLE_GAIN_RATIO / 2);
  const pool = clearlyFaster(fastestSameCar) || !clearlyFaster(fastestOf(classCandidates)) ? 'car' : 'class';
  const candidates = pool === 'car' ? sameCarLaps : classCandidates;
  const fastest = fastestOf(candidates);
  const reference = attainableOf(candidates, analysed.lapTime) ?? fastest;
  const technique = fastest && reference && fastest !== reference && fastest.lapTime < reference.lapTime ? fastest : null;
  return { reference, technique, pool };
}
