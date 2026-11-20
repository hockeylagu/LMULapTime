import type { AnalysisSessionRef, CornerHabitTrend, HabitChange } from '../../../../shared/types/corners/cornerAnalysis.js';

/** A session of the habit history as the lines name it: "Oct 21 Race". */
export const sessionRefLabel = (session: AnalysisSessionRef): string =>
  `${new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${session.sessionType}`;

/** A habit against the session before, in a few words: "new habit", or its cue ("brake 6 m later"); null without either. */
export const habitChangeText = (change: HabitChange | null): string | null => (change?.isNew ? 'new habit' : change?.cue ?? null);

/** The corner's time then against now: "0.14 s quicker". */
function gainText(gainSec: number): string {
  const amount = Math.abs(gainSec).toFixed(2);
  if (Number(amount) === 0) return 'same time';
  return `${amount} s ${gainSec > 0 ? 'quicker' : 'slower'}`;
}

/** The two lines under a corner trends row: its habit now, and the corner against the session before. */
export interface CornerHabitText {
  /** "Brake 10 m later into T5 · +0.12 s a lap · seen in 4 of 5 sessions"; null when it loses nothing worth telling. */
  habit: string | null;
  /** "vs Oct 21 Race: 0.14 s quicker · brake 6 m later"; null without a session before. */
  since: string | null;
  /** "Fixed since Oct 21 Race: Brake 10 m later into T5": that session's main habit, gone now. */
  fixed: string | null;
}

export function cornerHabitText(trend: CornerHabitTrend): CornerHabitText {
  const { habit, since } = trend;
  const seen = trend.of > 1 ? ` · seen in ${trend.seen} of ${trend.of} sessions` : '';
  const parts = [trend.gainSec === null ? null : gainText(trend.gainSec), habitChangeText(trend.change)].filter(Boolean);
  return {
    habit: habit && `${habit.line} · +${habit.lossSec.toFixed(2)} s a lap${seen}`,
    since: since && parts.length ? `vs ${sessionRefLabel(since)}: ${parts.join(' · ')}` : null,
    fixed: since && trend.fixed ? `Fixed since ${sessionRefLabel(since)}: ${trend.fixed}` : null,
  };
}
