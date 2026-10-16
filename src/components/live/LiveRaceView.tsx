import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDelta } from './LiveDelta.js';
import { LiveLastLapRow } from './LiveLastLapRow.js';
import { lastLap } from './liveFormat.js';
import { LiveDamageRow } from './race/LiveDamageRow.js';
import { LiveRacePlan } from './race/LiveRacePlan.js';

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

/**
 * The race driving view: the plan (pit countdown, per-lap use, MFD values, pit time), the current lap against the
 * best, then the last lap, or the damage row in its place while damage matters.
 */
export function LiveRaceView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const damage = snapshot.strategy?.damage ?? null;
  return (
    <>
      <LiveRacePlan snapshot={snapshot} />
      <RaceDeltaRow store={store} />
      {damage?.significant
        ? <LiveDamageRow damage={damage} lapsLeft={snapshot.lapsLeft?.laps ?? null} />
        : <LiveLastLapRow lap={lastLap(snapshot.recentLaps)} />}
    </>
  );
}
