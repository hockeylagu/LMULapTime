import type { PaceGoal } from '../../types/corners/habitFocus.js';
import { calculateBenchmarkPace, PACE_CATEGORY_BANDS } from '../paceCategory.js';

/**
 * Where a session stands: its true pace against the benchmark target of its layout and class, rated like a pace badge,
 * and the seconds a lap to find to reach the level above. Worked out on read, so an updated benchmark applies to past
 * sessions too. Null without a benchmark target or a true pace.
 */
export function paceGoal(benchmarkSec: number | null, paceSec: number | null): PaceGoal | null {
  const pace = calculateBenchmarkPace(paceSec, benchmarkSec);
  if (!pace || paceSec === null || !benchmarkSec) return null;
  const above = PACE_CATEGORY_BANDS[PACE_CATEGORY_BANDS.findIndex(band => band.category === pace.category) - 1] as (typeof PACE_CATEGORY_BANDS)[number] | undefined;
  return {
    benchmarkSec, percent: pace.percentage, level: pace.category,
    next: above ? { level: above.category, maxPercent: above.maxPercentage, toFindSec: paceSec - (benchmarkSec * above.maxPercentage) / 100 } : null,
  };
}
