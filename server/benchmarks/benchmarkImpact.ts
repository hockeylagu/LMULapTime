import {
  DetailedSession,
  ReferenceBenchmarkDiff,
  ReferenceBenchmarkDiffItem,
  LapCategoryShift,
  BenchmarkItemImpact,
} from '../core/types.js';
import {
  matchesTrack,
  matchesCarClass,
  getPaceCategoryFromPercentage,
} from '../../shared/domain/paceCategory.js';
import { formatTime } from '../../shared/domain/formatters.js';

const MAX_STORED_SAMPLE_SHIFTS = 25;

/** Bump when the impact rule changes: stored diffs computed with an older rule are recomputed. 2: player laps only. 3: the driver's own name on each changed lap. */
export const BENCHMARK_IMPACT_RULE = 3;

/**
 * Computes the impact of a single changed benchmark entry across all stored sessions.
 * Calculates how many sessions the player drove on the track/class and detects the player's
 * laps whose pace classification shifted as a result of target changes.
 */
export function computeBenchmarkItemImpact(
  item: ReferenceBenchmarkDiffItem,
  sessions: DetailedSession[]
): BenchmarkItemImpact {
  let affectedSessionsCount = 0;
  let affectedLapsCount = 0;
  const categoryShifts: LapCategoryShift[] = [];

  for (const session of sessions) {
    if (!matchesTrack(item.trackName, session.trackVenue, session.trackCourse)) {
      continue;
    }

    let sessionHasClassMatch = false;

    // Only the player's laps: the impact is about your own pace ratings.
    for (const driver of session.drivers || []) {
      if (!driver.isPlayer) continue;
      const driverClass = driver.carClass || driver.carType || '';
      if (!matchesCarClass(driverClass, driver.carType || '', item.carClass)) {
        continue;
      }

      sessionHasClassMatch = true;

      for (const lap of driver.laps || []) {
        if (!lap.lapTime || lap.lapTime <= 0 || lap.isValid === false) {
          continue;
        }

        affectedLapsCount++;

        // Determine if this lap changed pace category between old and new targets
        if (item.oldAlienSec && item.oldAlienSec > 0 && item.newAlienSec && item.newAlienSec > 0) {
          const oldPct = (lap.lapTime / item.oldAlienSec) * 100;
          const newPct = (lap.lapTime / item.newAlienSec) * 100;

          const oldCategory = getPaceCategoryFromPercentage(oldPct);
          const newCategory = getPaceCategoryFromPercentage(newPct);

          if (oldCategory !== newCategory) {
            categoryShifts.push({
              driverName: driver.name || driver.driverName || 'Driver',
              lapTimeSec: lap.lapTime,
              lapTimeString: formatTime(lap.lapTime),
              sessionId: session.id,
              sessionName: session.sessionName || session.sessionType || 'Session',
              lapNumber: lap.lapNum ?? (lap as unknown as { lapNumber?: number }).lapNumber ?? 0,
              oldCategory,
              newCategory,
            });
          }
        }
      }
    }

    if (sessionHasClassMatch) {
      affectedSessionsCount++;
    }
  }

  return {
    affectedSessionsCount,
    affectedLapsCount,
    categoryShiftsCount: categoryShifts.length,
    categoryShifts: categoryShifts.slice(0, MAX_STORED_SAMPLE_SHIFTS),
  };
}

/**
 * Enriches all items in a benchmark diff with their session and lap category impact.
 */
export function enrichBenchmarkDiffWithImpact(
  diff: ReferenceBenchmarkDiff,
  sessions: DetailedSession[]
): ReferenceBenchmarkDiff {
  const uniqueAffectedSessionIds = new Set<string>();
  let totalCategoryShifts = 0;

  const enrichList = (items: ReferenceBenchmarkDiffItem[]) => {
    for (const item of items) {
      const impact = computeBenchmarkItemImpact(item, sessions);
      item.impact = impact;
      totalCategoryShifts += impact.categoryShiftsCount;

      for (const shift of impact.categoryShifts) {
        uniqueAffectedSessionIds.add(shift.sessionId);
      }
    }
  };

  enrichList(diff.added);
  enrichList(diff.updated);
  enrichList(diff.removed);

  // Compute unique sessions affected by matching track/class
  let totalAffectedSessions = 0;
  for (const session of sessions) {
    const isAffected = [...diff.added, ...diff.updated, ...diff.removed].some(
      (item) =>
        matchesTrack(item.trackName, session.trackVenue, session.trackCourse) &&
        (session.drivers || []).some((d) => d.isPlayer &&
          matchesCarClass(d.carClass || d.carType || '', d.carType || '', item.carClass)
        )
    );
    if (isAffected) totalAffectedSessions++;
  }

  return {
    ...diff,
    totalAffectedSessions,
    totalCategoryShifts,
    impactRule: BENCHMARK_IMPACT_RULE,
  };
}
