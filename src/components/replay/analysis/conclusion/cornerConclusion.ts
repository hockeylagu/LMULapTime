import type { CornerMistake, HabitRule, MistakeCause, SessionCornerAnalysis } from '../../../../../shared/types/corners/cornerAnalysis.js';
import { cornerHabit } from '../../../../../shared/domain/cornerAnalysis/habitFocus.js';
import { habitTryLine, habitTryTitle } from '../../../session-detail/debrief/habitText.js';
import { focusDiagnosis } from '../../../session-detail/debrief/watchNextSession.js';
import { cornerSpeedCue } from '../../../track-detail/corner-trends/cornerHabitText.js';

/**
 * What the corner analysis engine concluded at one corner of the lap view: the driver's usual over the session against
 * the layout's target (the habit a focus would carry, as the debrief and the corner trends say it), and what the shown
 * lap lost there against the driver's own usual. Not the shown lap against its compare lap: the panel above says that.
 */
export interface CornerConclusion {
  /** The usual time lost to the target through the whole corner (s a lap); null when the session did not measure it. */
  costSec: number | null;
  /** One of the session's 2 focus corners. */
  focus: boolean;
  habit: {
    /** "Carry 7 km/h more through T5", or "Losing time into T5: no clear cause". */
    line: string;
    /** Null for a loss no rule explains: an observation, not something to do. */
    rule: HabitRule | null;
    /** The share of laps the habit showed on. */
    share: number;
    /** "Turn in 5 m earlier"; null when the headline is the action or none is measured. */
    tryLine: string | null;
    tryTitle: string | undefined;
    /** "Apex 96 → 100 km/h": the driver's, then the target's. */
    speedCue: string | null;
    /** The kind of loss ("tighter arc (34 m radius against 42 m)"). */
    diagnosis: string | null;
    /** What else was measured there: "braking 0.4 s longer". */
    causes: string[];
  } | null;
  /** The shown lap's biggest loss in the corner against the driver's own usual; null when it lost nothing worth telling. */
  mistake: { turnLabel: string; lossSec: number; cause: MistakeCause } | null;
}

/** Null for a corner the analysis does not hold (another class's corners). */
export function cornerConclusion(analysis: SessionCornerAnalysis, cornerId: number, lapOrdinal: number | undefined): CornerConclusion | null {
  const corner = analysis.corners.find(item => item.id === cornerId);
  if (!corner) return null;
  const habit = cornerHabit(analysis, cornerId) ?? analysis.unexplained.find(item => item.cornerId === cornerId) ?? null;
  const mistake = analysis.mistakes.filter(item => item.cornerId === cornerId && item.lapOrdinal === lapOrdinal)
    .reduce<CornerMistake | null>((worst, item) => (worst === null || item.lossSec > worst.lossSec ? item : worst), null);
  return {
    costSec: corner.lossSec,
    focus: analysis.focus.corners.some(item => item.cornerId === cornerId),
    habit: habit && {
      line: habit.line, rule: habit.rule, share: habit.repeatability,
      tryLine: habitTryLine(habit), tryTitle: habitTryTitle(habit.action),
      speedCue: habit.rule ? cornerSpeedCue(habit) : null,
      diagnosis: habit.rule ? focusDiagnosis(habit) : null,
      causes: habit.causes.map(cause => cause.line),
    },
    mistake: mistake && { turnLabel: mistake.turnLabel, lossSec: mistake.lossSec, cause: mistake.cause },
  };
}
