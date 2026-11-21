import type { AnalysisSessionRef, CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';

/** A session of the habit history as the lines name it: "Oct 21 Race". */
export const sessionRefLabel = (session: AnalysisSessionRef): string =>
  `${new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${session.sessionType}`;

/**
 * The advice under a corner trends row, at most two lines (driver, 2026-11-20: distilled): the habit to work on with
 * what it costs and how often it shows, then one line on the session before, holding only what the row does not
 * already show: how the habit's own cue moved, and a habit fixed. The corner's time against that session is the row's
 * graph, and a new habit is "seen in 1 of N".
 */
export interface CornerHabitText {
  /** The latest main habit; null when it loses nothing worth telling. */
  habit: {
    /** "Brake 10 m later into T5". */
    line: string;
    /** "+0.12 s a lap". */
    loss: string;
    /** "seen in 4 of 5 sessions"; null with a single session. */
    seen: string | null;
    /** False for a loss no rule explains: an observation, not something to do. */
    explained: boolean;
  } | null;
  /** The session before; null when it has nothing to add. */
  since: {
    /** "Since Oct 21 Race". */
    label: string;
    /** "brake 6 m later": the habit's cue against then; null for a new habit or one without a cue. */
    cue: string | null;
    /** "Brake 10 m later into T5": that session's main habit, fixed now. */
    fixed: string | null;
  } | null;
}

export function cornerHabitText(trend: CornerHabitTrend): CornerHabitText {
  const { habit, since, change } = trend;
  const cue = change && !change.isNew ? change.cue : null;
  const fixed = trend.fixed;
  return {
    habit: habit && {
      line: habit.line,
      loss: `+${habit.lossSec.toFixed(2)} s a lap`,
      seen: trend.of > 1 ? `seen in ${trend.seen} of ${trend.of} sessions` : null,
      explained: habit.rule !== null,
    },
    since: since && (cue || fixed) ? { label: `Since ${sessionRefLabel(since)}`, cue, fixed } : null,
  };
}
