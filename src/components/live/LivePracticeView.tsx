import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDelta } from './LiveDelta.js';
import { formatLapTime, lastLap } from './liveFormat.js';
import { LivePracticeHistory } from './LivePracticeHistory.js';

/** The current lap against the session best, under the last lap. Renders at 5 Hz. */
function CurrentDelta({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  return (
    <div className="mt-5 flex items-baseline gap-8">
      {/* Held at a delta's width so the label beside it stays put when the first value arrives. */}
      <span data-testid="live-practice-delta" className="inline-block min-w-[4em] font-mono text-[80px] font-bold"><LiveDelta seconds={timing?.deltaSeconds ?? null} /></span>
      <span className="text-[48px] text-lmu-text-soft">CURRENT VS BEST</span>
    </div>
  );
}

function Timing({ label, seconds }: { label: string; seconds: number | null | undefined }) {
  return (
    <div>
      <h3 className="text-[48px] font-semibold text-lmu-text-soft">{label}</h3>
      <div className="whitespace-nowrap font-mono text-[96px] font-bold leading-[1.4] tracking-[-0.04em]">{formatLapTime(seconds)}</div>
    </div>
  );
}

/** The practice view (also warmup and unknown sessions): last lap, session best, best possible, and the lap history. */
export function LivePracticeView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const latest = lastLap(snapshot.recentLaps);
  const best = snapshot.sessionBest;
  return (
    <>
      <section aria-label="Last lap and session timing" className="grid min-h-0 flex-1 grid-cols-[1.05fr_1fr] items-center">
        <div className={`pr-12 ${latest && !latest.valid ? 'opacity-50' : ''}`}>
          <h1 className="text-[48px] font-bold leading-[1.3]">LAST LAP</h1>
          <div data-testid="live-practice-last" className="whitespace-nowrap font-mono text-[182px] font-bold leading-[1.2] tracking-[-0.04em]">
            {formatLapTime(latest?.lapSeconds)}
          </div>
          <CurrentDelta store={store} />
        </div>
        <div className="grid grid-cols-2 gap-x-[60px] border-l border-lmu-border pl-[60px]">
          <Timing label="SESSION BEST" seconds={best?.lapSeconds} />
          <Timing label="BEST POSSIBLE" seconds={best?.bestPossibleSeconds} />
        </div>
      </section>
      <LivePracticeHistory laps={snapshot.recentLaps} best={best} store={store} />
    </>
  );
}
