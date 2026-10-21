import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { ReactNode } from 'react';
import { LiveEstimatedLap } from './LiveEstimatedLap.js';
import { LiveDelta } from './LiveDelta.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { LivePracticeHistory } from './LivePracticeHistory.js';

function Timing({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[48px] font-semibold text-lmu-text-soft">{label}</h3>
      <div className="whitespace-nowrap font-mono text-[96px] font-bold leading-[1.4] tracking-[-0.04em]">{children}</div>
    </div>
  );
}

/** The lap in progress against the best, live; the last lap is in the history below. */
function CurrentDelta({ store }: { store: LiveTimingStore }) {
  return <span data-testid="live-practice-delta"><LiveDelta seconds={useLiveTiming(store)?.deltaSeconds ?? null} unit={false} /></span>;
}

/**
 * Practice, qualifying, warmup and unknown sessions: estimated lap leads, followed by the live delta, the session best
 * (laps left in qualifying, where the best is already the history's BEST row) and the history.
 */
export function LivePracticeView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const best = snapshot.sessionBest;
  const lapsLeft = snapshot.lapsLeft;
  return (
    <>
      <section aria-label="Last lap and session timing" className="grid min-h-0 flex-1 grid-cols-[1.05fr_1fr] items-center">
        <div className="pr-12">
          <h1 className="text-[48px] font-bold leading-[1.3]">ESTIMATED LAP</h1>
          <div className="whitespace-nowrap font-mono text-[182px] font-bold leading-[1.2] tracking-[-0.04em]">
            <LiveEstimatedLap store={store} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-[60px] border-l border-lmu-border pl-[60px]">
          <Timing label="DELTA"><CurrentDelta store={store} /></Timing>
          {snapshot.session?.kind === 'qualifying'
            ? <Timing label="LAPS LEFT"><span data-testid="live-quali-laps-left">{lapsLeft ? `${lapsLeft.estimated ? '~' : ''}${lapsLeft.laps}` : UNKNOWN}</span></Timing>
            : <Timing label="SESSION BEST">{formatLapTime(best?.lapSeconds)}</Timing>}
        </div>
      </section>
      <LivePracticeHistory laps={snapshot.recentLaps} best={best} store={store} />
    </>
  );
}
