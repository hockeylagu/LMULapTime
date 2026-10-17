import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { ReactNode } from 'react';
import { LiveDelta } from './LiveDelta.js';
import { LiveEstimatedLap } from './LiveEstimatedLap.js';
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

function Figure({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className={`${RACE_COLUMN} ${RULED}`}>
      <h2 className={LABEL}>{label}</h2>
      <div className={VALUE}>{children}</div>
    </div>
  );
}

/**
 * The qualifying driving view, on the race columns: the push lap delta (position under it) beside the estimated lap,
 * the session best and the laps left; then the tyre surface average and the sectors against the best; then the last lap.
 */
export function LiveQualiView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const best = snapshot.sessionBest;
  const place = snapshot.session?.playerPlace ?? null;
  const lapsLeft = snapshot.lapsLeft;
  return (
    <>
      <section aria-label="Push lap against the session best" className={`${RACE_ROW} min-h-0 flex-1 items-center`}>
        <div className={RACE_LEAD}>
          <h1 className="text-[48px] font-bold leading-[1.3]">PUSH LAP · VS BEST</h1>
          <PushDelta store={store} />
          <p data-testid="live-quali-place" className="whitespace-nowrap font-mono text-[48px] font-semibold text-lmu-muted">
            {place !== null ? `P${place}` : UNKNOWN}
          </p>
        </div>
        <Figure label="ESTIMATED LAP" testId="live-quali-estimate"><LiveEstimatedLap store={store} bestSeconds={best?.lapSeconds} /></Figure>
        <Figure label="SESSION BEST" testId="live-quali-best">{formatLapTime(best?.lapSeconds)}</Figure>
        <Figure label="LAPS LEFT" testId="live-quali-laps-left">{lapsLeft ? `${lapsLeft.estimated ? '~' : ''}${lapsLeft.laps}` : UNKNOWN}</Figure>
      </section>
      <LiveDeltaRow store={store} lead="tyres" testId="live-quali-deltas" />
      <LiveLastLapRow lap={lastLap(snapshot.recentLaps)} />
    </>
  );
}
