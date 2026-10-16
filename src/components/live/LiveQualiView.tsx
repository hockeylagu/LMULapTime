import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDelta } from './LiveDelta.js';
import { LiveDeltaRow } from './LiveDeltaRow.js';
import { LiveLastLapRow } from './LiveLastLapRow.js';
import { formatLapTime, lastLap, UNKNOWN } from './liveFormat.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from './raceColumns.js';

const LABEL = 'whitespace-nowrap text-[48px] font-semibold text-lmu-text-soft';
const VALUE = 'mt-3 whitespace-nowrap font-mono text-[88px] font-bold leading-[1.2] tracking-[-0.025em]';

/** The push lap against the session best, the page's lead value. Renders at 5 Hz. */
function PushDelta({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  return (
    <div data-testid="live-push-delta" className="whitespace-nowrap font-mono text-[180px] font-bold leading-[1.2] tracking-[-0.04em]">
      <LiveDelta seconds={timing?.deltaSeconds ?? null} />
    </div>
  );
}

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div data-testid={testId} className={`${RACE_COLUMN} ${RULED}`}>
      <h2 className={LABEL}>{label}</h2>
      <div className={VALUE}>{value}</div>
    </div>
  );
}

/**
 * The qualifying driving view, on the race columns: the push lap delta beside the session best, the best possible
 * and the position; then the tyre surface average and the sectors against the best; then the last lap.
 */
export function LiveQualiView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const best = snapshot.sessionBest;
  const place = snapshot.session?.playerPlace ?? null;
  return (
    <>
      <section aria-label="Push lap against the session best" className={`${RACE_ROW} min-h-0 flex-1 items-center`}>
        <div className={RACE_LEAD}>
          <h1 className="text-[48px] font-bold leading-[1.3]">PUSH LAP · VS BEST</h1>
          <PushDelta store={store} />
        </div>
        <Figure label="SESSION BEST" value={formatLapTime(best?.lapSeconds)} testId="live-quali-best" />
        <Figure label="BEST POSSIBLE" value={formatLapTime(best?.bestPossibleSeconds)} testId="live-quali-possible" />
        <Figure label="POSITION" value={place !== null ? `P${place}` : UNKNOWN} testId="live-quali-place" />
      </section>
      <LiveDeltaRow store={store} lead="tyres" testId="live-quali-deltas" />
      <LiveLastLapRow lap={lastLap(snapshot.recentLaps)} />
    </>
  );
}
