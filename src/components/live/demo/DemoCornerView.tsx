import type { LiveTimingStore } from '../../../api/liveStream.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { LivePracticeView } from '../LivePracticeView.js';
import { LiveSessionBar } from '../LiveSessionBar.js';
import { LivePedalTrace } from '../LivePedalTrace.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import { lastLap, UNKNOWN } from '../liveFormat.js';

/** The last corner against the reference lap; null before a corner has been compared. */
export interface CornerSample { turn: string; lossSeconds: number; minKmh: number; refKmh: number }

// Illustrative data only: the demo computes no corner coaching.
const CORNER: CornerSample = { turn: 'T4', lossSeconds: 0.24, minKmh: 84, refKmh: 92 };

/**
 * Two fixed columns on one grid: the corner over MIN, the loss over REF, each label directly above its value and
 * everything left-aligned on the column edge. The columns are sized in the value font (3 ch for T19 or 299; the
 * rest for +9.99 s), so a new corner, a bigger loss, a 3-digit speed or a missing value never moves anything.
 */
const LABEL = 'self-end font-sans text-[32px] font-normal leading-none text-lmu-text-soft';

/** The tentative corner cue layout, the demo's `corners` scenario: practice timing over the last corner and the pedal trace. */
export function DemoCornerView({ snapshot, store, buffer, corner = CORNER }: {
  snapshot: LiveSnapshot; store: LiveTimingStore; buffer: PedalBuffer; corner?: CornerSample | null;
}) {
  return <>
    <LiveSessionBar snapshot={snapshot} connection="live" />
    <LivePracticeView snapshot={snapshot} store={store} />
    <section aria-label={`Pedal trace and last corner comparison against lap ${lastLap(snapshot.recentLaps)?.lapNumber ?? 'unknown'}`} className="grid h-[294px] shrink-0 grid-cols-[440px_1fr] grid-rows-[minmax(0,1fr)] gap-4 border-t border-lmu-border pt-2">
      <div className="grid grid-flow-col grid-cols-[3ch_1fr] grid-rows-[auto_auto_auto] content-center gap-x-8 gap-y-3 whitespace-nowrap border-r border-lmu-border pr-4 font-mono text-[80px] font-bold leading-none tabular-nums">
        <h2>{corner?.turn ?? UNKNOWN}</h2>
        <span className={LABEL}>MIN</span>
        <b aria-label={corner ? `Minimum speed ${Math.round(corner.minKmh)} kilometres per hour` : 'Minimum speed unknown'} className="font-semibold">{corner ? Math.round(corner.minKmh) : UNKNOWN}</b>
        <span className="text-lmu-loss" aria-label={corner ? `Lost ${corner.lossSeconds.toFixed(2)} seconds` : 'Loss unknown'}>
          <span className="inline-block w-[5ch]">{corner ? `+${Math.min(corner.lossSeconds, 9.99).toFixed(2)}` : UNKNOWN}</span><span className="ml-3 font-sans text-[48px] font-normal">s</span>
        </span>
        <span className={LABEL}>REF</span>
        <b aria-label={corner ? `Reference speed ${Math.round(corner.refKmh)} kilometres per hour` : 'Reference speed unknown'} className="font-semibold">{corner ? Math.round(corner.refKmh) : UNKNOWN}</b>
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden"><LivePedalTrace buffer={buffer} /></div>
    </section>
  </>;
}
