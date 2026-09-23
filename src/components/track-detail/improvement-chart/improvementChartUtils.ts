export function buildPersonalBestSeries(bestLapTimes: readonly (number | null)[]): (number | null)[] {
  let personalBest: number | null = null;

  return bestLapTimes.map((bestLapTime) => {
    if (bestLapTime !== null && bestLapTime > 0 && (personalBest === null || bestLapTime < personalBest)) {
      personalBest = bestLapTime;
    }
    return personalBest;
  });
}

export function calculateLapPrDelta(bestLapTime: number | null, previousPersonalBest: number | null): number | null {
  if (bestLapTime === null || bestLapTime <= 0 || previousPersonalBest === null || previousPersonalBest <= 0) {
    return null;
  }
  return parseFloat((bestLapTime - previousPersonalBest).toFixed(3));
}
