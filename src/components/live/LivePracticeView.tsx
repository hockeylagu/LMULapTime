import { useLiveTiming, type LiveTimingStore } from '../../api/liveStream.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { LiveEstimatedLap } from './LiveEstimatedLap.js';
import { LiveDelta } from './LiveDelta.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { LivePracticeHistory } from './LivePracticeHistory.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from './raceColumns.js';
import { deploymentReadout } from './race/deploymentReadout.js';
import { PlanReadoutView } from './race/LiveRacePlan.js';

/** The lap in progress against the best, live; the last lap is in the history below. */
function CurrentDelta({ store }: { store: LiveTimingStore }) {
  return <span data-testid="live-practice-delta"><LiveDelta seconds={useLiveTiming(store)?.deltaSeconds ?? null} unit={false} /></span>;
}

/**
 * Practice, qualifying, warmup and unknown sessions, on the race plan's columns: the estimated lap leads, then the live
 * delta, the session best (laps left in qualifying, where the best is already the history's BEST row) and a hybrid's
 * deployment advice, each on the race cell's label, value, note and detail lines (without a battery the two timing
 * blocks are centred); the history follows.
 */
export function LivePracticeView({ snapshot, store }: { snapshot: LiveSnapshot; store: LiveTimingStore }) {
  const best = snapshot.sessionBest;
  const lapsLeft = snapshot.lapsLeft;
  const deployment = snapshot.strategy?.deployment;
  const qualifying = snapshot.session?.kind === 'qualifying';
  return (
    <>
      <section aria-label="Last lap and session timing" className={`${RACE_ROW} min-h-0 flex-1 items-center`}>
        <div className={RACE_LEAD}>
          {/* The race's lead cell, so titles and values sit where they do in a race; a lap time needs the smaller size to fit. */}
          <PlanReadoutView readout={{ label: 'ESTIMATED LAP', value: '' }} size="action" testId="live-practice-estimate">
            <span className="text-[182px]"><LiveEstimatedLap store={store} /></span>
          </PlanReadoutView>
        </div>
        {/* Without a battery the two timing blocks keep their column width, centred in the three columns' space. */}
        <div className={deployment ? 'contents' : 'col-span-3 mx-auto grid w-2/3 grid-cols-2'}>
          <div className={`${RACE_COLUMN} ${RULED} self-center`}>
            <PlanReadoutView readout={{ label: 'DELTA', value: '' }} size="cell" testId="live-practice-delta-cell"><CurrentDelta store={store} /></PlanReadoutView>
          </div>
          <div className={`${RACE_COLUMN} ${RULED} self-center`}>
            {qualifying
              ? <PlanReadoutView readout={{ label: 'LAPS LEFT', value: '' }} size="cell" testId="live-practice-laps-left-cell">
                <span data-testid="live-quali-laps-left">{lapsLeft ? `${lapsLeft.estimated ? '~' : ''}${lapsLeft.laps}` : UNKNOWN}</span>
              </PlanReadoutView>
              : <PlanReadoutView readout={{ label: 'SESSION BEST', value: formatLapTime(best?.lapSeconds) }} size="cell" testId="live-practice-best-cell" />}
          </div>
        </div>
        {deployment && <div className={`${RACE_COLUMN} ${RULED} self-center`}>
          <PlanReadoutView readout={deploymentReadout(deployment)} size="cell" testId="live-practice-deployment" />
        </div>}
      </section>
      <LivePracticeHistory laps={snapshot.recentLaps} best={best} store={store} />
    </>
  );
}
