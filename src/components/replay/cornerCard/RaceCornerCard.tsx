import React, { useMemo, useSyncExternalStore } from 'react';
import type { RaceClock } from '../race/raceClock.js';
import { cornerInsightAt, currentPass } from './cornerInsight.js';
import { CornerInsightCard } from './CornerInsightCard.js';
import { useCornerCardShown } from './cornerCardShown.js';
import { useCornerInsightIndex } from './useCornerInsightIndex.js';

interface Props {
  sessionId: string;
  clock: RaceClock;
  followSlot: number | null;
  /** The view shown takes the card's key (K); a view kept loaded behind another does not. */
  active: boolean;
  className?: string;
}

/** The corner card of the race replay: the followed car on the session clock; a strip cell moves the clock to that pass. */
export const RaceCornerCard: React.FC<Props> = ({ sessionId, clock, followSlot, active, className }) => {
  const shown = useCornerCardShown(active);
  const { index, reason, loading } = useCornerInsightIndex(shown ? sessionId : null);
  // As often as the timing panel: ten times a second.
  const tenth = useSyncExternalStore(clock.subscribe, () => Math.floor(clock.getState().timeSec * 10));
  // The rounded-down time can still be in the previous turn just after an entry (as when a strip cell seeks there):
  // the card never shows a turn before the one the car is in.
  const enteredSec = index && followSlot !== null ? currentPass(index, followSlot, clock.getState().timeSec)?.entrySec ?? null : null;
  const insight = useMemo(() => (index && followSlot !== null
    ? cornerInsightAt(index, followSlot, Math.max(tenth / 10, enteredSec ?? tenth / 10)) : null), [index, followSlot, tenth, enteredSec]);
  if (!shown) return null;
  return <CornerInsightCard insight={insight} reason={followSlot === null ? 'Follow a car to see its corners.' : reason}
    loading={loading} onPick={cell => clock.seek(cell.entrySec)} className={className} />;
};
