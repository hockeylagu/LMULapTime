import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDelta } from './LiveDelta.js';
import { LiveLastLapRow } from './LiveLastLapRow.js';
import { lastLap, UNKNOWN } from './liveFormat.js';

const SECTOR_LABELS = ['S1 VS BEST', 'S2 VS BEST', 'S3 VS BEST'] as const;

const VALUE = 'mt-3 whitespace-nowrap font-mono text-[96px] font-bold leading-[1.2] tracking-[-0.025em]';
const LABEL = 'text-[48px] font-semibold text-lmu-text-soft';

/** Current lap against the session best, then the sectors done so far; the active sector says so. Renders at 5 Hz. */
function RaceDeltaRow({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  return (
    <section
      aria-label="Current lap against the session best"
      data-testid="live-race-deltas"
      className="grid h-[240px] shrink-0 grid-cols-[1.55fr_1fr_1fr_1fr] items-center rounded-xl bg-lmu-card px-9"
    >
      <div className="pr-[34px]">
        <h2 className={LABEL}>CURRENT VS BEST</h2>
        <div className={VALUE}><LiveDelta seconds={timing?.deltaSeconds ?? null} /></div>
      </div>
      {SECTOR_LABELS.map((label, index) => {
        const delta = timing?.sectorDeltas[index] ?? null;
        const active = delta === null && timing?.sector === index + 1;
        return (
          <div key={label} className="border-l border-lmu-rule pl-[34px]">
            <h2 className={LABEL}>{label}</h2>
            <div className={VALUE}>
              {active
                ? <span data-testid="live-active-sector" className="text-[64px] font-semibold tracking-normal text-lmu-text-soft">ACTIVE</span>
                : <LiveDelta seconds={delta} />}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** The race driving view. The primary area stays quiet until the pit advice arrives (later step). */
export function LiveRaceView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const session = snapshot.session;
  const lap = session?.playerLapsCompleted != null ? session.playerLapsCompleted + 1 : null;
  const lapsLeft = snapshot.lapsLeft;
  const latest = lastLap(snapshot.recentLaps);
  return (
    <>
      <section aria-label="Race" className="flex min-h-0 flex-1 flex-col justify-center gap-5">
        <h1 className="text-[164px] font-bold leading-[1.1] tracking-[-0.03em]">{lap === null ? 'RACE' : `LAP ${lap}`}</h1>
        {/* Both lines are always there, the unknown mark until known, so the lap title never moves. */}
        <p data-testid="live-race-laps-left" className="font-mono text-[64px] font-semibold text-lmu-text-soft">
          {lapsLeft ? `${lapsLeft.estimated ? '~' : ''}${lapsLeft.laps}` : UNKNOWN} LAPS LEFT
        </p>
        <p data-testid="live-race-place" className="text-[64px] font-semibold text-lmu-muted">
          {session?.playerPlace != null ? `P${session.playerPlace}` : UNKNOWN}
        </p>
      </section>
      <RaceDeltaRow store={store} />
      <LiveLastLapRow lap={latest} />
    </>
  );
}
