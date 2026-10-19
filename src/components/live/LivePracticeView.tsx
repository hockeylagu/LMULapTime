import type { LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { ReactNode } from 'react';
import { LiveEstimatedLap } from './LiveEstimatedLap.js';
import { formatLapTime, lastLap } from './liveFormat.js';
import { LivePracticeHistory } from './LivePracticeHistory.js';

function Timing({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[48px] font-semibold text-lmu-text-soft">{label}</h3>
      <div className="whitespace-nowrap font-mono text-[96px] font-bold leading-[1.4] tracking-[-0.04em]">{children}</div>
    </div>
  );
}

/** Practice, warmup and unknown sessions: estimated lap leads, followed by last lap, best and history. */
export function LivePracticeView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const latest = lastLap(snapshot.recentLaps);
  const best = snapshot.sessionBest;
  return (
    <>
      <section aria-label="Last lap and session timing" className="grid min-h-0 flex-1 grid-cols-[1.05fr_1fr] items-center">
        <div className="pr-12">
          <h1 className="text-[48px] font-bold leading-[1.3]">ESTIMATED LAP</h1>
          <div className="whitespace-nowrap font-mono text-[182px] font-bold leading-[1.2] tracking-[-0.04em]">
            <LiveEstimatedLap store={store} bestSeconds={best?.lapSeconds} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-[60px] border-l border-lmu-border pl-[60px]">
          <Timing label="LAST LAP"><span data-testid="live-practice-last" title={latest?.timeSource === 'lap-start' ? 'Computed lap time' : undefined} className={latest && !latest.valid ? 'text-lmu-muted' : undefined}>{formatLapTime(latest?.lapSeconds)}</span></Timing>
          <Timing label="SESSION BEST">{formatLapTime(best?.lapSeconds)}</Timing>
        </div>
      </section>
      <LivePracticeHistory laps={snapshot.recentLaps} best={best} store={store} paused={snapshot.paused} />
    </>
  );
}
