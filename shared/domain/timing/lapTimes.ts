export function computeTheoreticalBest(s1: number | null, s2: number | null, s3: number | null): number | null {
  if (s1 !== null && s2 !== null && s3 !== null && s1 > 0 && s2 > 0 && s3 > 0) {
    return parseFloat((s1 + s2 + s3).toFixed(3));
  }
  return null;
}

export function computeTheoreticalGap(
  bestLapTime?: number | null,
  theoreticalBest?: number | null
): number | null {
  if (
    bestLapTime !== null &&
    bestLapTime !== undefined &&
    theoreticalBest !== null &&
    theoreticalBest !== undefined &&
    bestLapTime > 0 &&
    theoreticalBest > 0
  ) {
    const gap = bestLapTime - theoreticalBest;
    return parseFloat(Math.max(0, gap).toFixed(3));
  }
  return null;
}

/** The faster of two lap times; a missing or zero time never wins. */
export function fasterLapTime(current: number | null, next: number | null | undefined): number | null {
  return next !== null && next !== undefined && next > 0 && (current === null || next < current) ? next : current;
}

export interface DriverLapReference {
  lapNumber: number;
  lapTime: number | null;
  isValid?: boolean;
}

export interface DriverLapSummary {
  bestLapNumber?: number | null;
  bestLapTime?: number | null;
  laps?: DriverLapReference[];
}

/**
 * Resolves the best lap number for a driver profile or session summary.
 * Prioritizes explicitly known bestLapNumber, then the fastest valid lap,
 * then any completed lap, and finally defaults to 1.
 */
export function getBestLapNumber(driver?: DriverLapSummary | null): number {
  if (!driver) return 1;
  if (typeof driver.bestLapNumber === 'number' && driver.bestLapNumber > 0) {
    return driver.bestLapNumber;
  }
  const laps = driver.laps;
  if (laps && laps.length > 0) {
    if (typeof driver.bestLapTime === 'number' && driver.bestLapTime > 0) {
      const matchValid = laps.find(l => l.isValid && l.lapTime === driver.bestLapTime);
      if (matchValid) return matchValid.lapNumber;
      const matchAny = laps.find(l => l.lapTime === driver.bestLapTime);
      if (matchAny) return matchAny.lapNumber;
    }
    const validLaps = laps.filter(l => l.isValid && typeof l.lapTime === 'number' && l.lapTime > 0);
    if (validLaps.length > 0) {
      const best = validLaps.reduce((min, cur) => ((cur.lapTime as number) < (min.lapTime as number) ? cur : min));
      return best.lapNumber;
    }
    const completedLaps = laps.filter(l => typeof l.lapTime === 'number' && l.lapTime > 0);
    if (completedLaps.length > 0) {
      const best = completedLaps.reduce((min, cur) => ((cur.lapTime as number) < (min.lapTime as number) ? cur : min));
      return best.lapNumber;
    }
    return laps[0].lapNumber || 1;
  }
  return 1;
}
