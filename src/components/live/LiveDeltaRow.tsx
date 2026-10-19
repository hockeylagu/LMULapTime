import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import { activeSectorDelta } from '../../../shared/domain/live/liveLapTiming.js';
import { LiveDelta } from './LiveDelta.js';
import { LiveEstimatedLap } from './LiveEstimatedLap.js';
import { UNKNOWN } from './liveFormat.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from './raceColumns.js';

const SECTOR_LABELS = ['S1 VS BEST', 'S2 VS BEST', 'S3 VS BEST'] as const;

const VALUE = 'mt-3 whitespace-nowrap font-mono text-[96px] font-bold leading-[1.2] tracking-[-0.025em]';
const LABEL = 'text-[48px] font-semibold text-lmu-text-soft';

/**
 * The sectors against the session best (the one in progress live, the done ones final), led by the estimated time
 * of the lap in progress in a race, or by the tyre surface average where the page already leads with the lap.
 * Renders at the timing rate.
 */
export function LiveDeltaRow({ store, lead, testId }: {
  store: LiveTimingStore; lead: 'estimate' | 'tyres'; testId: string;
}) {
  const timing = useLiveTiming(store);
  const tyres = timing?.tyreSurfaceAvgC ?? null;
  return (
    <section
      aria-label="Current lap against the session best"
      data-testid={testId}
      className={`${RACE_ROW} h-[240px] shrink-0 items-center rounded-xl bg-lmu-card`}
    >
      {lead === 'estimate' ? (
        <div className={RACE_LEAD}>
          <h2 className={LABEL}>ESTIMATED LAP</h2>
          <div className={VALUE}><LiveEstimatedLap store={store} /></div>
        </div>
      ) : (
        <div className={RACE_LEAD}>
          <h2 className={LABEL}>TYRE SURFACE AVG</h2>
          <div data-testid="live-tyre-avg" className={VALUE}>
            {tyres === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : Math.round(tyres)}
            <span className="ml-3 text-[48px] font-normal text-lmu-text-soft">°C</span>
          </div>
        </div>
      )}
      {SECTOR_LABELS.map((label, index) => {
        // The sector in progress shows its running delta, refreshed with the timing; done sectors their split delta.
        const active = timing !== null && timing.sector === index + 1 && timing.sectorDeltas[index] === null;
        const delta = active ? activeSectorDelta(timing) : (timing?.sectorDeltas[index] ?? null);
        return (
          <div key={label} className={`${RACE_COLUMN} ${RULED}`}>
            <h2 className={LABEL}>{label}</h2>
            <div data-testid={active ? 'live-active-sector' : undefined} className={VALUE}><LiveDelta seconds={delta} /></div>
          </div>
        );
      })}
    </section>
  );
}
