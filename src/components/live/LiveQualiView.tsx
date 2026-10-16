import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDelta } from './LiveDelta.js';
import { LiveLastLapRow } from './LiveLastLapRow.js';
import { lastLap, UNKNOWN } from './liveFormat.js';

/** The push lap against the session best, large; the tyre surface average underneath, held with the unknown mark until known. Renders at 5 Hz. */
function PushLap({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  const tyres = timing?.tyreSurfaceAvgC ?? null;
  return (
    <>
      <section aria-label="Push lap against the session best" className="flex min-h-0 flex-1 flex-col justify-center">
        <h1 className="text-[48px] font-bold leading-[1.3]">PUSH LAP · VS BEST</h1>
        <div data-testid="live-push-delta" className="whitespace-nowrap font-mono text-[200px] font-bold leading-[1.2] tracking-[-0.04em]">
          <LiveDelta seconds={timing?.deltaSeconds ?? null} />
        </div>
      </section>
      <section aria-label="Tyre surface average" className="flex h-[240px] shrink-0 items-center rounded-xl bg-lmu-card px-9">
        <div>
          <h2 className="text-[48px] font-semibold text-lmu-text-soft">TYRE SURFACE AVG</h2>
          <div data-testid="live-tyre-avg" className="mt-3 whitespace-nowrap font-mono text-[96px] font-bold leading-[1.2] tracking-[-0.025em]">
            {tyres === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : Math.round(tyres)}
            <span className="ml-3 text-[48px] font-normal text-lmu-text-soft">°C</span>
          </div>
        </div>
      </section>
    </>
  );
}

/** The qualifying driving view: the push lap delta, tyre support, and the last lap. */
export function LiveQualiView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  return (
    <>
      <PushLap store={store} />
      <LiveLastLapRow lap={lastLap(snapshot.recentLaps)} />
    </>
  );
}
