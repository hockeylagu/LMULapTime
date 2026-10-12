import type { ReplayLapSummary, ReplayTrajectoryData } from '../../../shared/types/index.js';
import { buildPitIntervals } from './replayLapBuilder.js';

/** Recover pit flags from retained replay evidence without rewriting the recording or cache. */
export function classifyRetainedReplayLaps(
  trajectory: ReplayTrajectoryData,
  spans: ReadonlyMap<number, { startSec: number; endSec: number }>,
  driverSlot = trajectory.driverSlot,
): ReplayLapSummary[] | undefined {
  const events = (trajectory.pitEvents ?? []).filter(event => event.driverSlot === driverSlot);
  const intervals = buildPitIntervals(events);
  const laps = trajectory.laps?.map(lap => {
    const span = spans.get(lap.lapNumber);
    const current = lap.lapNumber === trajectory.currentLap;
    const start = current ? trajectory.points[0] : undefined;
    const enteredPit = span && events.some(event => event.code === 34
      && event.timeSec >= span.startSec && event.timeSec < span.endSec);
    const startedInPit = span && intervals.some(interval => interval.start <= span.startSec && interval.end > span.startSec);
    const isPitStop = Boolean(lap.isPitStop || enteredPit
      || (current && trajectory.points.some(point => point.inPit || point.pitLimiter)));
    const isOutLap = Boolean(lap.isOutLap || startedInPit || start?.inPit || start?.pitLimiter);
    return { ...lap, ...(isPitStop ? { isPitStop: true, isBest: false } : {}), ...(isOutLap ? { isOutLap: true } : {}) };
  });
  if (laps && trajectory.laps?.some(lap => lap.isBest) && !laps.some(lap => lap.isBest)) {
    const best = laps.filter(lap => lap.isValid !== false && !lap.isOutLap && !lap.isPitStop && lap.lapTimeSec > 0)
      .reduce<ReplayLapSummary | undefined>((fastest, lap) => !fastest || lap.lapTimeSec < fastest.lapTimeSec ? lap : fastest, undefined);
    if (best) best.isBest = true;
  }
  return laps;
}
