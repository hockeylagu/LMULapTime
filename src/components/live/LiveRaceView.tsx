import type { LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveDeltaRow } from './LiveDeltaRow.js';
import { LiveLastLapRow } from './LiveLastLapRow.js';
import { lastLap } from './liveFormat.js';
import { LiveDamageRow } from './race/LiveDamageRow.js';
import { LiveRacePlan } from './race/LiveRacePlan.js';
import { racePlanView } from './race/raceAction.js';

/**
 * The race driving view: the plan (pit countdown, per-lap use, MFD values, pit time), the current lap against the
 * best, then the last lap, or the damage row in its place while damage matters.
 */
export function LiveRaceView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const damage = snapshot.strategy?.damage ?? null;
  const view = racePlanView(snapshot);
  return (
    <>
      <LiveRacePlan snapshot={snapshot} view={view} store={store} />
      <LiveDeltaRow store={store} lead={view.mode === 'sprint' ? 'tyres' : 'estimate'} testId="live-race-deltas" />
      {damage?.significant
        ? <LiveDamageRow damage={damage} lapsLeft={snapshot.lapsLeft?.laps ?? null} />
        : <LiveLastLapRow lap={lastLap(snapshot.recentLaps)} />}
    </>
  );
}
