import type { AnalysisSessionRef, CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';
import { habitGapLabel, habitTryLine, habitTryTitle } from '../../session-detail/debrief/habitText.js';

/** A session of the habit history as the lines name it: "Oct 21 Race". */
export const sessionRefLabel = (session: AnalysisSessionRef): string =>
  `${new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${session.sessionType}`;


/**
 * What opens under a corner trends row: the corner's habit in the latest session with what the corner costs against
 * the target, the one thing to try, and the cost and the habit's own gap over the last sessions that measured the
 * corner. A gap that closes while the cost does not move shows there: the check that the advice works.
 */
export interface CornerHabitText {
  /** The latest habit; null when the corner has none (its cost and series still show). */
  habit: {
    /** "Carry 7 km/h more through T5". */
    line: string;
    /** False for a loss no rule explains: an observation, not something to do. */
    explained: boolean;
  } | null;
  /** "Turn in 5 m earlier"; null when the headline is the action or none is measured. */
  tryLine: string | null;
  /** The metres behind a try said in words, for its tooltip. */
  tryTitle: string | undefined;
  /** "+0.22 s a lap vs target"; null without a target there. */
  cost: string | null;
  /** "Cost: 0.31 → 0.28 → 0.22 s"; null with a single session. */
  costSeries: string | null;
  /** "Minimum speed at T5, gap to the target: 7 → 6 → 3 km/h"; null without a named habit or with a single session. */
  gapSeries: string | null;
}

export function cornerHabitText(trend: CornerHabitTrend): CornerHabitText {
  const { habit, gap, series, costSec } = trend;
  const several = series.length > 1;
  return {
    habit: habit && { line: habit.line, explained: habit.rule !== null },
    tryLine: habit ? habitTryLine(habit) : null,
    tryTitle: habit ? habitTryTitle(habit.action) : undefined,
    cost: costSec === null ? null : `${costSec >= 0 ? '+' : '−'}${Math.abs(costSec).toFixed(2)} s a lap vs target`,
    costSeries: several ? `Cost: ${series.map(point => point.costSec.toFixed(2)).join(' → ')} s` : null,
    gapSeries: several && gap
      ? `${habitGapLabel(gap.rule, gap.turnLabel)}, gap to the target: ${series.map(point => (point.gap === null ? '–' : String(Math.round(point.gap)))).join(' → ')} ${gap.unit}`
      : null,
  };
}
