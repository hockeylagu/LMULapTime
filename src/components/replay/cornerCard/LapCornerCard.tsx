import React, { useContext, useMemo } from 'react';
import type { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { ReplayFullscreenControlsContext } from '../inspector/replayFullscreenControls.js';
import { currentPass, lapClockToReplay, lapInsightAt, type StripCell } from './cornerInsight.js';
import { CornerInsightCard } from './CornerInsightCard.js';
import { useCornerCardCompare, useCornerCardShown } from './cornerCardShown.js';
import { useCornerInsightIndex } from './useCornerInsightIndex.js';

interface Props {
  trajectory: ReplayTrajectoryData;
  /** The compare lap, when one is shown: the card can measure against its pass through each turn. */
  baseline?: ReplayTrajectoryData | null;
  /** The sample's time: session time for a replay lap, lap time for one fused with the telemetry (`timeReference`). */
  timeSec: number | null | undefined;
  /** The view shown takes the card's key (K); a view kept loaded behind another does not. */
  active: boolean;
  className?: string;
}

/**
 * The corner card of the lap view: the shown lap's pass through the turn at the playhead, against the car's usual and
 * its class's fastest of the session, or against the compare lap's pass. A cell of its strip opens that lap (one the
 * session has telemetry for).
 */
export const LapCornerCard: React.FC<Props> = ({ trajectory, baseline, timeSec, active, className }) => {
  const shown = useCornerCardShown(active);
  const compareOn = useCornerCardCompare();
  const { sessionId, driverSlot: slot, currentLap: lapNumber } = trajectory;
  const { index, reason, loading } = useCornerInsightIndex(shown ? sessionId : null);
  const versusMode = baseline ? compareOn : undefined;
  const base = useCornerInsightIndex(shown && versusMode ? baseline?.sessionId : null);
  const baseIndex = base.index;
  // Why no turn has a compare time: its passes still load, or its session has none.
  const versusNote = base.loading ? "Loading the compare lap's corner times…" : base.reason && `The compare lap: ${base.reason}`;
  const baseSlot = baseline?.driverSlot, baseLap = baseline?.currentLap;
  const compareLap = useMemo(() => (versusMode && baseIndex && baseSlot !== undefined && baseLap !== undefined
    ? { index: baseIndex, slot: baseSlot, lapNumber: baseLap } : null), [versusMode, baseIndex, baseSlot, baseLap]);
  const choice = useContext(ReplayFullscreenControlsContext)?.primary;
  // Ten times a second is enough for the card; the playhead moves every frame.
  const tenth = typeof timeSec === 'number' ? Math.floor(timeSec * 10) : null;
  const onReplay = (sec: number) => (!index || slot === undefined || lapNumber === undefined ? null
    : trajectory.timeReference === 'lap' ? lapClockToReplay(index, slot, lapNumber, sec) : sec);
  // The rounded-down time can still be in the previous turn just after an entry (as when a strip cell lands there):
  // the card never shows a turn before the one the car is in.
  const exactSec = typeof timeSec === 'number' ? onReplay(timeSec) : null;
  const enteredSec = index && slot !== undefined && exactSec !== null ? currentPass(index, slot, exactSec)?.entrySec ?? null : null;
  const insight = useMemo(() => {
    if (!index || slot === undefined || lapNumber === undefined || tenth === null) return null;
    const replaySec = trajectory.timeReference === 'lap' ? lapClockToReplay(index, slot, lapNumber, tenth / 10) : tenth / 10;
    return replaySec === null ? null : lapInsightAt(index, slot, lapNumber, Math.max(replaySec, enteredSec ?? replaySec), compareLap);
  }, [index, slot, lapNumber, tenth, enteredSec, trajectory.timeReference, compareLap]);
  if (!shown) return null;
  const why = sessionId ? reason : 'This lap has no session replay.';
  // The lap opens at this turn's entry, so the car stays in the turn (not back at the start line).
  const onPick = choice && ((cell: StripCell) => {
    if (cell.lapNumber === lapNumber || !choice.laps.some(lap => lap.lapNumber === cell.lapNumber)) return;
    const lapStartSec = index && slot !== undefined ? lapClockToReplay(index, slot, cell.lapNumber, 0) : null;
    choice.onSelect(cell.lapNumber, lapStartSec === null ? undefined : { replaySec: cell.entrySec, lapStartSec });
  });
  return <CornerInsightCard insight={insight} reason={why} loading={loading} onPick={onPick} versusMode={versusMode}
    versusNote={versusNote} className={className} />;
};
