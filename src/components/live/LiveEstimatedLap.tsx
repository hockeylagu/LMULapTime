import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { formatLapTime } from './liveFormat.js';

/** The lap in progress projected to the line: the session best plus the running delta to it. */
export function estimatedLapSeconds(bestSeconds: number | null | undefined, deltaSeconds: number | null | undefined): number | null {
  return bestSeconds != null && bestSeconds > 0 && deltaSeconds != null ? bestSeconds + deltaSeconds : null;
}

/** Out laps are labelled explicitly; otherwise show the estimate or unknown without a reference. */
export function LiveEstimatedLap({ store, bestSeconds }: { store: LiveTimingStore; bestSeconds: number | null | undefined }) {
  const timing = useLiveTiming(store);
  const matched = estimatedLapSeconds(bestSeconds, timing?.deltaSeconds);
  const game = timing?.gameEstimatedLapSeconds;
  const fallback = matched === null && game != null && Number.isFinite(game) && game > 0 ? game : null;
  return <span data-testid="live-estimated-lap" data-estimate-source={timing?.isOutLap ? undefined : matched !== null ? 'session-trace' : fallback !== null ? 'game' : undefined}>
    {timing?.isOutLap ? 'OUT LAP' : fallback !== null ? `~${formatLapTime(fallback)}` : formatLapTime(matched)}
  </span>;
}
