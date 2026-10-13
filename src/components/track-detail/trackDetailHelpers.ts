import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { getPaceCategoryFromPercentage } from '../../../shared/domain/paceCategory.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';

export function getPaceCategoryForLap(lapTime: number | null, benchmark: ReferenceLaptimeEntry | null) {
  if (!lapTime || !benchmark || !benchmark.targets.alienSec) return null;
  const alienSec = benchmark.targets.alienSec;
  const percentage = (lapTime / alienSec) * 100;
  const category = getPaceCategoryFromPercentage(percentage);
  return { category, percentage };
}

/** A session's best lap against the benchmark. A wet best lap has no rating: the targets are dry laps. */
export function getSessionBestLapPace(driver: SessionCard['playerDriver'], benchmark: ReferenceLaptimeEntry | null) {
  return driver?.bestLapWet ? null : getPaceCategoryForLap(driver?.bestLapTime || null, benchmark);
}
