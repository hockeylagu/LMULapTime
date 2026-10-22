import type { LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LivePracticeHistory } from './LivePracticeHistory.js';
import { LiveRacePlan } from './race/LiveRacePlan.js';
import { racePlanView } from './race/raceAction.js';

/**
 * The race driving view: the plan (pit countdown, per-lap use, MFD values, pit time, the estimated lap when the tank
 * reaches the finish) over the practice history. While damage matters its row takes the session bar's place
 * (`LiveDashboardView`), and the history keeps one completed lap to make room.
 */
export function LiveRaceView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const view = racePlanView(snapshot);
  return (
    <>
      <LiveRacePlan view={view} store={store} />
      {/* A sprint leads with the estimated lap; otherwise it takes the running clock's place in the lap row. */}
      <LivePracticeHistory laps={snapshot.recentLaps} best={snapshot.sessionBest} store={store}
        completedRows={snapshot.strategy?.damage?.significant ? 1 : 2} estimate={view.mode !== 'sprint'} />
    </>
  );
}
