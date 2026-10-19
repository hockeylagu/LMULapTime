import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { formatLapTime } from './liveFormat.js';

/** Out laps are labelled explicitly; otherwise show the estimate or unknown without a reference. */
export function LiveEstimatedLap({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  const estimate = timing?.lapEstimate;
  const seconds = estimate != null && Number.isFinite(estimate.seconds) && estimate.seconds > 0 ? estimate.seconds : null;
  return <span data-testid="live-estimated-lap" title={estimate?.source === 'sector' && !timing?.isOutLap ? 'Estimate from the last completed sector' : undefined}
    data-estimate-source={timing?.isOutLap ? undefined : estimate?.source}>
    {timing?.isOutLap ? 'OUT LAP' : formatLapTime(seconds)}
  </span>;
}
