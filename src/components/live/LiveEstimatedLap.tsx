import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { formatLapTime } from './liveFormat.js';

/** The lap in progress projected to the line: the session best plus the running delta to it. */
export function estimatedLapSeconds(bestSeconds: number | null | undefined, deltaSeconds: number | null | undefined): number | null {
  if (bestSeconds == null || !Number.isFinite(bestSeconds) || bestSeconds <= 0
    || deltaSeconds == null || !Number.isFinite(deltaSeconds)) return null;
  const estimate = bestSeconds + deltaSeconds;
  return estimate > 0 ? estimate : null;
}

/** Out laps are labelled explicitly; otherwise show the estimate or unknown without a reference. */
export function LiveEstimatedLap({ store, bestSeconds }: { store: LiveTimingStore; bestSeconds: number | null | undefined }) {
  const timing = useLiveTiming(store);
  const matched = estimatedLapSeconds(bestSeconds, timing?.deltaSeconds);
  const split = timing?.sectorEstimatedLapSeconds;
  const fallback = matched === null && split != null && Number.isFinite(split) && split > 0 ? split : null;
  return <span data-testid="live-estimated-lap" title={fallback !== null && !timing?.isOutLap ? 'Estimate from the last completed sector' : undefined}
    data-estimate-source={timing?.isOutLap ? undefined : matched !== null ? 'session-trace' : fallback !== null ? 'sector' : undefined}>
    {timing?.isOutLap ? 'OUT LAP' : formatLapTime(matched ?? fallback)}
  </span>;
}
