import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { formatLapTime } from './liveFormat.js';

/** The lap in progress projected to the line: the session best plus the running delta to it. */
export function estimatedLapSeconds(bestSeconds: number | null | undefined, deltaSeconds: number | null | undefined): number | null {
  return bestSeconds != null && bestSeconds > 0 && deltaSeconds != null ? bestSeconds + deltaSeconds : null;
}

/** The estimated time of the lap in progress; the unknown mark before a session best. Renders at the timing rate. */
export function LiveEstimatedLap({ store, bestSeconds }: { store: LiveTimingStore; bestSeconds: number | null | undefined }) {
  const timing = useLiveTiming(store);
  return <span data-testid="live-estimated-lap">{formatLapTime(estimatedLapSeconds(bestSeconds, timing?.deltaSeconds))}</span>;
}
