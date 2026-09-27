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

/**
 * X-axis label for a session: its month/day and session name, e.g. "09/25 R1", so sessions
 * weeks apart are not all read as "P1".
 */
export function formatSessionAxisLabel(dateString: string, shortSession: string): string {
  const match = /^\d{4}[/-](\d{2})[/-](\d{2})/.exec(dateString);
  return match ? `${match[1]}/${match[2]} ${shortSession}` : shortSession;
}
